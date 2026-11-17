// ------------------------------------------------------------------
// Ledger transactions repository. `sale_ids` is a JSON array of linked
// sale pos_ids (multiple bills merged into one same-day entry).
// ------------------------------------------------------------------
import type { RowDataPacket } from 'mysql2/promise'
import { pool, iso, toMysqlDateTime } from '../db.js'
import type { Executor } from './executor.js'
import type { LedgerTx } from '../types.js'
import { escapeLike } from './customers.js'

interface LedgerTxRow extends RowDataPacket {
  pos_id: string
  customer_id: string
  type: 'udhaar' | 'wasooli'
  amount: number
  note: string | null
  ref: string | null
  sale_ids: string | string[] | null
  tx_date: string | null
}

function parseSaleIds(raw: string | string[] | null): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function mapRow(r: LedgerTxRow): LedgerTx {
  return {
    id: r.pos_id,
    customerId: r.customer_id,
    type: r.type,
    amount: Number(r.amount),
    note: r.note ?? '',
    ref: r.ref ?? '',
    saleIds: parseSaleIds(r.sale_ids),
    date: iso(r.tx_date),
  }
}

export async function getAll(exec: Executor = pool): Promise<LedgerTx[]> {
  const [rows] = await exec.query<LedgerTxRow[]>('SELECT * FROM ledger_tx ORDER BY id')
  return rows.map(mapRow)
}

export async function getById(id: string, exec: Executor = pool): Promise<LedgerTx | null> {
  const [rows] = await exec.query<LedgerTxRow[]>('SELECT * FROM ledger_tx WHERE pos_id = ?', [id])
  return rows[0] ? mapRow(rows[0]) : null
}

interface CountRow extends RowDataPacket {
  total: number
}

interface LedgerTxJoinRow extends LedgerTxRow {
  customer_name: string | null
  customer_phone: string | null
}

/** A ledger entry plus its customer's display fields (joined, for the list UI). */
export interface LedgerTxWithCustomer extends LedgerTx {
  customerName: string
  customerPhone: string
}

export interface ListOptions {
  q?: string
  /** Inclusive 'YYYY-MM-DD' day bounds. */
  from?: string
  to?: string
  offset?: number
  /** 0 = no limit (used by the "export the whole filtered statement" PDF). */
  limit?: number
}

/**
 * One page of ledger entries, newest first, with the customer's name/phone
 * joined in — the list renders them, and `q` searches them (customer name,
 * phone, or the entry's own note).
 *
 * The day filter compares against the stored DATETIME in the database's own
 * wall-clock, which is the same clock `toMysqlDateTime()` writes with. LEFT
 * JOIN, so entries whose customer was deleted still appear.
 */
export async function listPaged(
  { q = '', from = '', to = '', offset = 0, limit = 50 }: ListOptions,
  exec: Executor = pool,
): Promise<{ items: LedgerTxWithCustomer[]; total: number }> {
  const clauses: string[] = []
  const params: unknown[] = []

  if (q) {
    const like = `%${escapeLike(q)}%`
    clauses.push("(c.name LIKE ? ESCAPE '\\\\' OR c.phone LIKE ? ESCAPE '\\\\' OR t.note LIKE ? ESCAPE '\\\\')")
    params.push(like, like, like)
  }
  if (from) {
    clauses.push('t.tx_date >= ?')
    params.push(`${from} 00:00:00`)
  }
  if (to) {
    // < to+1day, so the whole `to` day is included.
    clauses.push('t.tx_date < DATE_ADD(?, INTERVAL 1 DAY)')
    params.push(`${to} 00:00:00`)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''

  const [rows] = await exec.query<LedgerTxJoinRow[]>(
    `SELECT t.*, c.name AS customer_name, c.phone AS customer_phone
     FROM ledger_tx t
     LEFT JOIN customers c ON c.pos_id = t.customer_id
     ${where}
     ORDER BY t.tx_date DESC, t.id DESC
     ${limit > 0 ? 'LIMIT ? OFFSET ?' : ''}`,
    limit > 0 ? [...params, limit, offset] : params,
  )
  const [counts] = await exec.query<CountRow[]>(
    `SELECT COUNT(*) AS total
     FROM ledger_tx t
     LEFT JOIN customers c ON c.pos_id = t.customer_id
     ${where}`,
    params,
  )

  const items = rows.map((r) => ({
    ...mapRow(r),
    customerName: r.customer_name ?? '',
    customerPhone: r.customer_phone ?? '',
  }))
  return { items, total: Number(counts[0]?.total ?? 0) }
}

export interface LedgerTxInput {
  id: string
  customerId: string
  type: 'udhaar' | 'wasooli'
  amount: number
  note?: string
  ref?: string
  saleIds?: string[]
  date?: string
}

export async function create(input: LedgerTxInput, exec: Executor = pool): Promise<LedgerTx> {
  const saleIds = input.saleIds ?? []
  await exec.query(
    `INSERT INTO ledger_tx (pos_id, customer_id, type, amount, note, ref, sale_ids, tx_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      input.id,
      input.customerId,
      input.type,
      input.amount ?? 0,
      input.note ?? null,
      input.ref ?? null,
      saleIds.length ? JSON.stringify(saleIds) : null,
      toMysqlDateTime(input.date),
    ],
  )
  return (await getById(input.id, exec))!
}

/**
 * Find an existing sale-based 'udhaar' entry for this customer whose ISO day
 * (YYYY-MM-DD, from the mapped .date) matches `isoDayKey`. Used to merge
 * multiple same-day bills into one entry, mirroring the frontend's original
 * checkout() logic exactly (it compared `t.date.slice(0, 10)`), which avoids
 * any timezone drift between the stored DATETIME and the ISO string.
 */
export async function findSaleUdhaarForDay(
  customerId: string,
  isoDayKey: string,
  exec: Executor = pool,
): Promise<LedgerTx | null> {
  const [rows] = await exec.query<LedgerTxRow[]>(
    `SELECT * FROM ledger_tx
     WHERE customer_id = ? AND type = 'udhaar' AND sale_ids IS NOT NULL
     ORDER BY id DESC`,
    [customerId],
  )
  for (const r of rows) {
    const tx = mapRow(r)
    if (tx.saleIds.length && tx.date.slice(0, 10) === isoDayKey) return tx
  }
  return null
}

export async function updateMerge(
  id: string,
  fields: { amount: number; date: string; saleIds: string[]; note: string; ref?: string },
  exec: Executor = pool,
): Promise<LedgerTx | null> {
  await exec.query(
    `UPDATE ledger_tx SET amount = ?, tx_date = ?, sale_ids = ?, note = ?, ref = COALESCE(?, ref), updated_at = NOW()
     WHERE pos_id = ?`,
    [
      fields.amount,
      toMysqlDateTime(fields.date),
      JSON.stringify(fields.saleIds),
      fields.note,
      fields.ref ?? null,
      id,
    ],
  )
  return getById(id, exec)
}