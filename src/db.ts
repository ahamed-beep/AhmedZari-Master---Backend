// ------------------------------------------------------------------
// MySQL connection pool + shared helpers. Mirrors db.php (PDO) but with
// mysql2's promise API and a small transaction helper.
// ------------------------------------------------------------------
import mysql, { type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise'
import { config } from './config.js'

export const pool: Pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  // Keeps DECIMAL columns as JS numbers (the frontend expects numbers, not
  // strings). Safe for this app's money magnitudes.
  decimalNumbers: true,
})

/** Run a SELECT and return typed rows. */
export async function query<T extends RowDataPacket>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await pool.query<T[]>(sql, params)
  return rows
}

/**
 * Run `fn` inside a transaction on a dedicated connection. Commits on
 * success, rolls back on any thrown error, and always releases the
 * connection. Use for the multi-table flows (checkout, purchase, ledger).
 */
export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (err) {
    try {
      await conn.rollback()
    } catch {
      /* ignore rollback errors */
    }
    throw err
  } finally {
    conn.release()
  }
}

/** ISO-8601 string for a DB DATETIME (or now, if null). Mirrors iso() in db.php. */
export function iso(dt: Date | string | null | undefined): string {
  if (!dt) return new Date().toISOString()
  const d = dt instanceof Date ? dt : new Date(dt)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

/** Convert an ISO/date string to a MySQL DATETIME ('YYYY-MM-DD HH:MM:SS'). */
export function toMysqlDateTime(input?: string | null): string {
  const d = input ? new Date(input) : new Date()
  const use = isNaN(d.getTime()) ? new Date() : d
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${use.getFullYear()}-${pad(use.getMonth() + 1)}-${pad(use.getDate())} ` +
    `${pad(use.getHours())}:${pad(use.getMinutes())}:${pad(use.getSeconds())}`
  )
}
