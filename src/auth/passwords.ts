// ------------------------------------------------------------------
// Password hashing helpers (bcrypt). Used by auth + employee writes +
// the migration that hashes legacy plaintext passwords.
// ------------------------------------------------------------------
import bcrypt from 'bcryptjs'

const ROUNDS = 10

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/** True if a stored string already looks like a bcrypt hash. */
export function isBcryptHash(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value)
}
