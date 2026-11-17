// ------------------------------------------------------------------
// Products repository. Row <-> Product JSON mapping mirrors the
// 'products' case of get_collection() in the old index.php.
// ------------------------------------------------------------------
import type { RowDataPacket } from 'mysql2/promise'
import { pool } from '../db.js'
import type { Executor } from './executor.js'
import type { Product } from '../types.js'

interface ProductRow extends RowDataPacket {
  pos_id: string
  name: string
  barcode: string | null
  category: string | null
  purchase: number
  price: number
  stock: number
  unit: string | null
}

function mapRow(r: ProductRow): Product {
  return {
    id: r.pos_id,
    name: r.name,
    barcode: r.barcode ?? '',
    category: r.category ?? '',
    purchase: Number(r.purchase),
    price: Number(r.price),
    stock: Number(r.stock),
    unit: r.unit ?? 'bottle',
  }
}

export async function getAll(exec: Executor = pool): Promise<Product[]> {
  const [rows] = await exec.query<ProductRow[]>('SELECT * FROM products ORDER BY id')
  return rows.map(mapRow)
}

export async function getById(id: string, exec: Executor = pool): Promise<Product | null> {
  const [rows] = await exec.query<ProductRow[]>('SELECT * FROM products WHERE pos_id = ?', [id])
  return rows[0] ? mapRow(rows[0]) : null
}

function normalize(input: Partial<Product>) {
  return {
    name: input.name ?? '',
    barcode: input.barcode ?? null,
    category: input.category ?? '',
    purchase: input.purchase ?? 0,
    price: input.price ?? 0,
    stock: input.stock ?? 0,
    unit: input.unit ?? 'bottle',
  }
}

export async function create(input: Product, exec: Executor = pool): Promise<Product> {
  const v = normalize(input)
  await exec.query(
    `INSERT INTO products (pos_id, name, barcode, category, purchase, price, stock, unit, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [input.id, v.name, v.barcode, v.category, v.purchase, v.price, v.stock, v.unit],
  )
  return (await getById(input.id, exec))!
}

export async function update(id: string, input: Partial<Product>, exec: Executor = pool): Promise<Product | null> {
  const v = normalize(input)
  await exec.query(
    `UPDATE products SET name=?, barcode=?, category=?, purchase=?, price=?, stock=?, unit=?, updated_at=NOW()
     WHERE pos_id = ?`,
    [v.name, v.barcode, v.category, v.purchase, v.price, v.stock, v.unit, id],
  )
  return getById(id, exec)
}

export async function remove(id: string, exec: Executor = pool): Promise<void> {
  await exec.query('DELETE FROM products WHERE pos_id = ?', [id])
}

/** Add `delta` to stock (delta may be negative). Optionally set purchase cost. */
export async function adjustStock(
  id: string,
  delta: number,
  exec: Executor = pool,
  newPurchaseCost?: number,
): Promise<Product | null> {
  if (newPurchaseCost === undefined) {
    await exec.query(
      'UPDATE products SET stock = GREATEST(0, stock + ?), updated_at = NOW() WHERE pos_id = ?',
      [delta, id],
    )
  } else {
    await exec.query(
      'UPDATE products SET stock = GREATEST(0, stock + ?), purchase = ?, updated_at = NOW() WHERE pos_id = ?',
      [delta, newPurchaseCost, id],
    )
  }
  return getById(id, exec)
}
