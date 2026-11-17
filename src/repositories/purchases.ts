// ------------------------------------------------------------------
// Purchases repository.
// ------------------------------------------------------------------
import type { RowDataPacket } from 'mysql2/promise'
import { pool, iso, toMysqlDateTime } from '../db.js'
import type { Executor } from './executor.js'
import type { Purchase } from '../types.js'

interface PurchaseRow extends RowDataPacket {
  pos_id: string
  product_id: string | null
  product_name: string
  qty: number
  cost: number
  total: number
  note: string | null
  purchase_date: string | null
}

function mapRow(r: PurchaseRow): Purchase {
  return {
    id: r.pos_id,
    productId: r.product_id ?? '',
    productName: r.product_name,
    qty: Number(r.qty),
    cost: Number(r.cost),
    total: Number(r.total),
    note: r.note ?? '',
    date: iso(r.purchase_date),
  }
}

export async function getAll(exec: Executor = pool): Promise<Purchase[]> {
  const [rows] = await exec.query<PurchaseRow[]>('SELECT * FROM purchases ORDER BY id')
  return rows.map(mapRow)
}

export async function getById(id: string, exec: Executor = pool): Promise<Purchase | null> {
  const [rows] = await exec.query<PurchaseRow[]>('SELECT * FROM purchases WHERE pos_id = ?', [id])
  return rows[0] ? mapRow(rows[0]) : null
}

export async function create(input: Purchase, exec: Executor = pool): Promise<Purchase> {
  await exec.query(
    `INSERT INTO purchases (pos_id, product_id, product_name, qty, cost, total, note, purchase_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      input.id,
      input.productId ?? null,
      input.productName ?? '',
      input.qty ?? 0,
      input.cost ?? 0,
      input.total ?? 0,
      input.note ?? null,
      toMysqlDateTime(input.date),
    ],
  )
  return (await getById(input.id, exec))!
}
