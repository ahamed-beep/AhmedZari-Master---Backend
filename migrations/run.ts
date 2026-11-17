// ------------------------------------------------------------------
// Migration runner: `npm run migrate`
//   1. Create the database if it doesn't exist.
//   2. Apply 001_schema.sql (CREATE TABLE IF NOT EXISTS — no-op on
//      existing tables).
//   3. Reconcile columns on pre-existing tables (adds the new `sales`
//      columns the PHP schema lacked).
//   4. Hash legacy plaintext passwords / seed default users.
//
// Safe to run against a fresh DB or the existing PHP database.
// ------------------------------------------------------------------
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise'
import { config } from '../src/config.js'
import { hashPasswords } from './002_hash_passwords.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function columnExists(pool: Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  )
  return rows.length > 0
}

async function ensureColumn(
  pool: Pool,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  if (!(await columnExists(pool, table, column))) {
    console.log(`  + adding ${table}.${column}`)
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`)
  }
}

async function main() {
  // Step 1 — create the database using a connection with no default DB.
  const rootConn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  })
  await rootConn.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  )
  await rootConn.end()
  console.log(`Database "${config.db.database}" ready.`)

  // Step 2 — apply the schema.
  const schemaConn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  })
  const schemaSql = await readFile(join(__dirname, '001_schema.sql'), 'utf8')
  await schemaConn.query(schemaSql)
  await schemaConn.end()
  console.log('Schema applied.')

  // Steps 3 & 4 — reconcile columns + passwords via the pool.
  const pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
  })

  console.log('Reconciling columns on existing tables…')
  await ensureColumn(pool, 'sales', 'cashier', 'cashier VARCHAR(128) NULL')
  await ensureColumn(pool, 'sales', 'customer_phone', 'customer_phone VARCHAR(32) NULL')
  await ensureColumn(pool, 'sales', 'reference', 'reference VARCHAR(255) NULL')
  await ensureColumn(pool, 'sales', 'payment_type', "payment_type VARCHAR(32) NOT NULL DEFAULT 'cash'")
  await ensureColumn(pool, 'sales', 'settled_immediately', 'settled_immediately TINYINT(1) NOT NULL DEFAULT 0')
  await ensureColumn(pool, 'sales', 'return_of', 'return_of VARCHAR(32) NULL')

  console.log('Migrating passwords / seeding users…')
  await hashPasswords(pool)

  await pool.end()
  console.log('Migration complete.')
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
