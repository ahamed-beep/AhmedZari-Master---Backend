// ------------------------------------------------------------------
// One-time migration: move legacy plaintext `employees.password` into the
// new bcrypt `password_hash` column, then drop the legacy column. Also
// seeds the two default users (hashed) when the table is empty.
//
// Safe to run repeatedly (idempotent). Invoked by migrations/run.ts and
// also runnable directly: `npm run hash-passwords`.
// ------------------------------------------------------------------
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { hashPassword, isBcryptHash } from '../src/auth/passwords.js'

async function columnExists(pool: Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  )
  return rows.length > 0
}

export async function hashPasswords(pool: Pool): Promise<void> {
  const hasHashCol = await columnExists(pool, 'employees', 'password_hash')
  if (!hasHashCol) {
    await pool.query(
      `ALTER TABLE employees ADD COLUMN password_hash VARCHAR(255) NULL AFTER username`,
    )
  }

  const hasLegacyCol = await columnExists(pool, 'employees', 'password')

  // 1) Migrate any legacy plaintext passwords into password_hash.
  if (hasLegacyCol) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, password, password_hash FROM employees`,
    )
    for (const r of rows) {
      const legacy = r.password as string | null
      const existingHash = r.password_hash as string | null
      if (existingHash && isBcryptHash(existingHash)) continue
      const source = legacy ?? ''
      const hash = isBcryptHash(source) ? source : await hashPassword(source || 'changeme')
      await pool.query(`UPDATE employees SET password_hash = ? WHERE id = ?`, [hash, r.id])
    }
    // 2) Drop the legacy column so future inserts don't hit its NOT NULL.
    await pool.query(`ALTER TABLE employees DROP COLUMN password`)
  }

  // 3) Ensure password_hash is NOT NULL now that it is populated.
  await pool.query(
    `ALTER TABLE employees MODIFY COLUMN password_hash VARCHAR(255) NOT NULL`,
  )

  // 4) Seed default users when the table is empty (fresh install).
  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM employees`,
  )
  if ((countRows[0]?.c ?? 0) === 0) {
    const defaults = [
      { pos_id: 'seed_emp_bilal', username: 'bilal', name: 'M Bilal Virk', role: 'admin', pw: 'Ahmad123@' },
      { pos_id: 'seed_emp_ali', username: 'ali', name: 'Ali', role: 'employee', pw: 'Ali123@' },
    ]
    for (const d of defaults) {
      const hash = await hashPassword(d.pw)
      await pool.query(
        `INSERT INTO employees (pos_id, username, password_hash, name, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [d.pos_id, d.username, hash, d.name, d.role],
      )
    }
    console.log('Seeded default users: bilal (admin), ali (employee)')
  }
}

// Allow running standalone.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { pool } = await import('../src/db.js')
  await hashPasswords(pool)
  await pool.end()
  console.log('Password migration complete.')
}
