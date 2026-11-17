// ------------------------------------------------------------------
// Customers repository (the frontend's 'ledger' collection).
// ------------------------------------------------------------------
import type { RowDataPacket } from 'mysql2/promise'
import { pool } from '../db.js'
import type { Executor } from './executor.js'
import type { Customer } from '../types.js'

interface CustomerRow extends RowDataPacket {
  pos_id: string
  name: string
  phone: string | null
  balance: number
}

interface CountRow extends RowDataPacket {
  total: number
}

interface TotalsRow extends RowDataPacket {
  to_receive: number
  to_give: number
}

function mapRow(r: CustomerRow): Customer {
  return { id: r.pos_id, name: r.name, phone: r.phone ?? '', balance: Number(r.balance) }
}

/** Neutralise LIKE wildcards so a search for "50%" doesn't match everything. */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (ch) => '\\' + ch)
}

export async function getAll(exec: Executor = pool): Promise<Customer[]> {
  const [rows] = await exec.query<CustomerRow[]>('SELECT * FROM customers ORDER BY id')
  return rows.map(mapRow)
}

export async function getById(id: string, exec: Executor = pool): Promise<Customer | null> {
  const [rows] = await exec.query<CustomerRow[]>('SELECT * FROM customers WHERE pos_id = ?', [id])
  return rows[0] ? mapRow(rows[0]) : null
}

export interface ListOptions {
  q?: string
  offset?: number
  limit?: number
}

/**
 * One page of customers, alphabetical. `q` is a case-insensitive substring
 * match on name OR phone. `total` is the count of ALL matches (not just this
 * page) so the client can render pagination.
 */
export async function listPaged(
  { q = '', offset = 0, limit = 10 }: ListOptions,
  exec: Executor = pool,
): Promise<{ items: Customer[]; total: number }> {
  const where = q ? "WHERE (name LIKE ? ESCAPE '\\\\' OR phone LIKE ? ESCAPE '\\\\')" : ''
  const like = `%${escapeLike(q)}%`
  const filterParams = q ? [like, like] : []

  const [rows] = await exec.query<CustomerRow[]>(
    `SELECT * FROM customers ${where} ORDER BY name ASC, id ASC LIMIT ? OFFSET ?`,
    [...filterParams, limit, offset],
  )
  const [counts] = await exec.query<CountRow[]>(
    `SELECT COUNT(*) AS total FROM customers ${where}`,
    filterParams,
  )
  return { items: rows.map(mapRow), total: Number(counts[0]?.total ?? 0) }
}

/**
 * Shop-wide receivable / payable totals across EVERY customer — deliberately
 * unfiltered by the search box, because the summary tiles report the business
 * position, not the position of whatever the user is currently searching for.
 */
export async function balanceTotals(exec: Executor = pool): Promise<{ toReceive: number; toGive: number }> {
  const [rows] = await exec.query<TotalsRow[]>(
    `SELECT COALESCE(SUM(GREATEST(balance, 0)), 0)  AS to_receive,
            COALESCE(SUM(GREATEST(-balance, 0)), 0) AS to_give
     FROM customers`,
  )
  return { toReceive: Number(rows[0]?.to_receive ?? 0), toGive: Number(rows[0]?.to_give ?? 0) }
}

/**
 * Update a customer's profile fields. `balance` is intentionally NOT editable
 * here — it is derived from sales + ledger transactions, so overwriting it
 * directly would silently desync the account from its own history.
 */
export async function update(
  id: string,
  fields: { name?: string; phone?: string },
  exec: Executor = pool,
): Promise<Customer | null> {
  const sets: string[] = []
  const params: unknown[] = []
  if (fields.name !== undefined) {
    sets.push('name = ?')
    params.push(fields.name)
  }
  if (fields.phone !== undefined) {
    sets.push('phone = ?')
    params.push(fields.phone)
  }
  if (!sets.length) return getById(id, exec)

  await exec.query(
    `UPDATE customers SET ${sets.join(', ')}, updated_at = NOW() WHERE pos_id = ?`,
    [...params, id],
  )
  return getById(id, exec)
}

export async function create(input: Customer, exec: Executor = pool): Promise<Customer> {
  await exec.query(
    `INSERT INTO customers (pos_id, name, phone, balance, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [input.id, input.name ?? '', input.phone ?? null, input.balance ?? 0],
  )
  return (await getById(input.id, exec))!
}

/** Delete a customer AND their ledger transactions (cascade), atomically. */
export async function remove(id: string, exec: Executor = pool): Promise<void> {
  await exec.query('DELETE FROM ledger_tx WHERE customer_id = ?', [id])
  await exec.query('DELETE FROM customers WHERE pos_id = ?', [id])
}

/** Add `delta` to the balance (delta may be negative). */
export async function adjustBalance(id: string, delta: number, exec: Executor = pool): Promise<Customer | null> {
  await exec.query(
    'UPDATE customers SET balance = balance + ?, updated_at = NOW() WHERE pos_id = ?',
    [delta, id],
  )
  return getById(id, exec)
}
