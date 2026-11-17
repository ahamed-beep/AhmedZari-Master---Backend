// ------------------------------------------------------------------
// POST /api/login — verify credentials server-side against the bcrypt
// hash and return a JWT. Replaces the old client-side plaintext match.
// ------------------------------------------------------------------
import { Router } from 'express'
import * as employees from '../repositories/employees.js'
import { verifyPassword } from './passwords.js'
import { signToken } from './middleware.js'
import { asyncHandler } from '../routes/util.js'
import type { AuthUser } from '../types.js'

export const authRouter = Router()

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body ?? {}
    if (!username || !password) {
      res.status(400).json({ error: 'Username aur password dono zaroori hain' })
      return
    }

    const row = await employees.findByUsername(String(username))
    if (!row || !(await verifyPassword(String(password), row.password_hash))) {
      res.status(401).json({ error: 'Username ya password galat hai' })
      return
    }

    const user: AuthUser = { id: row.pos_id, username: row.username, name: row.name, role: row.role }
    res.json({ token: signToken(user), user })
  }),
)
