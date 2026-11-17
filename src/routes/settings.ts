// ------------------------------------------------------------------
// Settings — bulk key/value save. Body: { value: { ...settings } }
// (kept identical to the old PUT /api/data/settings contract).
// ------------------------------------------------------------------
import { Router } from 'express'
import { asyncHandler } from './util.js'
import { requireAdmin } from '../auth/middleware.js'
import * as settings from '../repositories/settings.js'
import type { Settings } from '../types.js'

export const settingsRouter = Router()

settingsRouter.put(
  '/settings',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const value = (req.body?.value ?? req.body) as Settings
    const saved = await settings.saveAll(value ?? {})
    res.json({ ok: true, value: saved })
  }),
)
