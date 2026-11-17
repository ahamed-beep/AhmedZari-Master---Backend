// ------------------------------------------------------------------
// Sales repository (sales + sale_items). Stores the frontend's real
// shape, including the fields the old PHP backend silently dropped
// (cashier, paymentType, settledImmediately, customerPhone, reference).
// ------------------------------------------------------------------
import type { RowDataPacket } from 'mysql2/promise'
import { pool, iso, toMysqlDateTime } from '../db.js'
import type { Executor } from './executor.js'
import type { Sale, SaleItem } from '../types.js'

interface SaleRow extends RowDataPacket {
  id: number
  pos_id: string
  cashier: string | null
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  reference: string | null
  subtotal: number
  discount: number
  total: number
  payment_type: string
  settled_immediately: number
  return_of: string | null
  sale_date: string | null
}

interface SaleItemRow extends RowDataPacket {
  sale_id: number
  product_id: string | null
  name: string
  price: number
  cost: number
  qty: number
}

function mapItem(i: SaleItemRow): SaleItem {
  return {
    productId: i.product_id ?? '',
    name: i.name,
    price: Number(i.price),
    cost: Number(i.cost),
    qty: Number(i.qty),
  }
}

function mapRow(s: SaleRow, items: SaleItem[]): Sale {
  return {
    id: s.pos_id,
    date: iso(s.sale_date),
    cashier: s.cashier ?? '',
    items,
    subtotal: Number(s.subtotal),
    discount: Number(s.discount),
    total: Number(s.total),
    paymentType: s.payment_type,
    settledImmediately: Boolean(s.settled_immediately),
    customerId: s.customer_id,
    customerName: s.customer_name ?? '',
    customerPhone: s.customer_phone ?? '',
    reference: s.reference ?? '',
    returnOf: s.return_of ?? null,
  }
}

export async function getAll(exec: Executor = pool): Promise<Sale[]> {
  const [sales] = await exec.query<SaleRow[]>('SELECT * FROM sales ORDER BY id')
  if (sales.length === 0) return []
  const ids = sales.map((s) => s.id)
  const [items] = await exec.query<SaleItemRow[]>(
    `SELECT * FROM sale_items WHERE sale_id IN (${ids.map(() => '?').join(',')})`,
    ids,
  )
  const itemsBySale = new Map<number, SaleItem[]>()
  for (const it of items) {
    if (!itemsBySale.has(it.sale_id)) itemsBySale.set(it.sale_id, [])
    itemsBySale.get(it.sale_id)!.push(mapItem(it))
  }
  return sales.map((s) => mapRow(s, itemsBySale.get(s.id) ?? []))
}

export async function getById(id: string, exec: Executor = pool): Promise<Sale | null> {
  const [rows] = await exec.query<SaleRow[]>('SELECT * FROM sales WHERE pos_id = ?', [id])
  const s = rows[0]
  if (!s) return null
  const [items] = await exec.query<SaleItemRow[]>('SELECT * FROM sale_items WHERE sale_id = ?', [s.id])
  return mapRow(s, items.map(mapItem))
}

export async function create(input: Sale, exec: Executor = pool): Promise<Sale> {
  const [result] = await exec.query<import('mysql2').ResultSetHeader>(
    `INSERT INTO sales
       (pos_id, cashier, customer_id, customer_name, customer_phone, reference,
        subtotal, discount, total, payment_type, settled_immediately, return_of, sale_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      input.id,
      input.cashier ?? null,
      input.customerId ?? null,
      input.customerName ?? null,
      input.customerPhone ?? null,
      input.reference ?? null,
      input.subtotal ?? 0,
      input.discount ?? 0,
      input.total ?? 0,
      input.paymentType ?? 'cash',
      input.settledImmediately ? 1 : 0,
      input.returnOf ?? null,
      toMysqlDateTime(input.date),
    ],
  )
  const saleRowId = result.insertId
  for (const it of input.items ?? []) {
    await exec.query(
      `INSERT INTO sale_items (sale_id, product_id, name, price, cost, qty) VALUES (?, ?, ?, ?, ?, ?)`,
      [saleRowId, it.productId ?? null, it.name ?? '', it.price ?? 0, it.cost ?? 0, it.qty ?? 1],
    )
  }
  return (await getById(input.id, exec))!
}

/**
 * Sum of quantities ALREADY returned per product for a given original sale.
 * Return rows store qty as negative, so we negate the SUM to get a positive
 * "already returned" count. Used to cap how much more can be returned.
 */
export async function returnedQtyByProduct(
  originalSaleId: string,
  exec: Executor = pool,
): Promise<Map<string, number>> {
  const [rows] = await exec.query<(RowDataPacket & { product_id: string | null; q: number })[]>(
    `SELECT si.product_id AS product_id, COALESCE(SUM(si.qty), 0) AS q
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
      WHERE s.return_of = ?
      GROUP BY si.product_id`,
    [originalSaleId],
  )
  const map = new Map<string, number>()
  for (const r of rows) {
    if (r.product_id) map.set(r.product_id, Math.abs(Number(r.q)))
  }
  return map
}
