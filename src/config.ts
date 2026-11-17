// ------------------------------------------------------------------
// Configuration — reads from environment (.env). Replaces config.php.
// ------------------------------------------------------------------
import 'dotenv/config'

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (v === undefined) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return v
}

export const config = {
  port: Number(process.env.PORT ?? 8000),

  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME ?? 'agropoint_pos',
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASS ?? '',
  },

  // '*' allows any origin (matches the old PHP default). Otherwise a
  // comma-separated allow-list.
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  jwt: {
    secret: required('JWT_SECRET', 'change-me-to-a-long-random-secret'),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
}
