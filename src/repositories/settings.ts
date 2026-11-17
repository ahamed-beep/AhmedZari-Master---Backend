// ------------------------------------------------------------------
// Settings repository — a key/value store. Values that are JSON-encodable
// objects/arrays are stored as JSON and decoded on read; scalars stored
// as plain strings. Mirrors get/save 'settings' in the old index.php.
// ------------------------------------------------------------------
import type { RowDataPacket } from 'mysql2/promise'
import { pool } from '../db.js'
import type { Executor } from './executor.js'
import type { Settings } from '../types.js'

interface SettingRow extends RowDataPacket {
  key: string
  value: string | null
}

export async function getAll(exec: Executor = pool): Promise<Settings> {
  const [rows] = await exec.query<SettingRow[]>('SELECT * FROM settings')
  const out: Settings = {}
  for (const r of rows) {
    const raw = r.value
    if (raw === null) {
      out[r.key] = null
      continue
    }
    try {
      const decoded = JSON.parse(raw)
      out[r.key] = decoded
    } catch {
      out[r.key] = raw
    }
  }
  return out
}

export async function saveAll(data: Settings, exec: Executor = pool): Promise<Settings> {
  for (const [key, val] of Object.entries(data)) {
    const stored = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '')
    await exec.query(
      `INSERT INTO settings (\`key\`, \`value\`, created_at, updated_at) VALUES (?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE \`value\` = ?, updated_at = NOW()`,
      [key, stored, stored],
    )
  }
  return getAll(exec)
}
