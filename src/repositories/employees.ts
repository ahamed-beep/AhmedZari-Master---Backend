// ------------------------------------------------------------------
// Employees repository. Passwords are stored as bcrypt hashes and are
// NEVER returned to the client (unlike the old PHP backend, which
// exposed plaintext passwords via GET /api/data).
// ------------------------------------------------------------------
import type { RowDataPacket } from 'mysql2/promise'
import { pool } from '../db.js'
import type { Executor } from './executor.js'
import type { Employee, EmployeeInput } from '../types.js'
import { hashPassword } from '../auth/passwords.js'

interface EmployeeRow extends RowDataPacket {
  pos_id: string
  username: string
  password_hash: string
  name: string
  role: 'admin' | 'employee'
}

function mapRow(r: EmployeeRow): Employee {
  return { id: r.pos_id, username: r.username, name: r.name, role: r.role }
}

export async function getAll(exec: Executor = pool): Promise<Employee[]> {
  const [rows] = await exec.query<EmployeeRow[]>('SELECT * FROM employees ORDER BY id')
  return rows.map(mapRow)
}

export async function getById(id: string, exec: Executor = pool): Promise<Employee | null> {
  const [rows] = await exec.query<EmployeeRow[]>('SELECT * FROM employees WHERE pos_id = ?', [id])
  return rows[0] ? mapRow(rows[0]) : null
}

/** Full row incl. hash — for the login flow only. */
export async function findByUsername(username: string): Promise<EmployeeRow | null> {
  const [rows] = await pool.query<EmployeeRow[]>('SELECT * FROM employees WHERE username = ?', [username])
  return rows[0] ?? null
}

export async function usernameTaken(username: string, exceptId?: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT pos_id FROM employees WHERE username = ?',
    [username],
  )
  return rows.some((r) => r.pos_id !== exceptId)
}

export async function create(input: EmployeeInput): Promise<Employee> {
  const hash = await hashPassword(input.password ?? '')
  await pool.query(
    `INSERT INTO employees (pos_id, username, password_hash, name, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [input.id, input.username ?? '', hash, input.name ?? '', input.role ?? 'employee'],
  )
  return (await getById(input.id))!
}

/** Update. If `password` is empty/omitted, the existing hash is kept. */
export async function update(id: string, input: EmployeeInput): Promise<Employee | null> {
  if (input.password) {
    const hash = await hashPassword(input.password)
    await pool.query(
      `UPDATE employees SET username=?, password_hash=?, name=?, role=?, updated_at=NOW() WHERE pos_id = ?`,
      [input.username ?? '', hash, input.name ?? '', input.role ?? 'employee', id],
    )
  } else {
    await pool.query(
      `UPDATE employees SET username=?, name=?, role=?, updated_at=NOW() WHERE pos_id = ?`,
      [input.username ?? '', input.name ?? '', input.role ?? 'employee', id],
    )
  }
  return getById(id)
}

export async function remove(id: string): Promise<void> {
  await pool.query('DELETE FROM employees WHERE pos_id = ?', [id])
}

export async function count(): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS c FROM employees')
  return Number(rows[0]?.c ?? 0)
}
