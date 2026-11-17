// ------------------------------------------------------------------
// JWT auth middleware. `requireAuth` verifies the Bearer token and
// attaches req.user; `requireAdmin` additionally enforces the admin role.
// ------------------------------------------------------------------
import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import type { AuthUser } from '../types.js'

// Augment Express's Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwt.secret, { expiresIn: config.jwt.expiresIn } as jwt.SignOptions)
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  try {
    const payload = jwt.verify(token, config.jwt.secret) as jwt.JwtPayload & AuthUser
    req.user = { id: payload.id, username: payload.username, name: payload.name, role: payload.role }
    next()
  } catch (err) {
    // Distinguish an expired token (client should log out) from an otherwise
    // invalid one, so the frontend only force-logs-out on genuine expiry.
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' })
    } else {
      res.status(401).json({ error: 'Invalid token', code: 'TOKEN_INVALID' })
    }
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admins only' })
    return
  }
  next()
}
