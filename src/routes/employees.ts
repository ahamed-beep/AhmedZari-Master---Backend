// ------------------------------------------------------------------
// Employees CRUD (admin only). Passwords are hashed on write and never
// returned. On update, an empty password means "keep the current one".
// ------------------------------------------------------------------
import { Router } from 'express'
import { asyncHandler } from './util.js'
import { requireAdmin } from '../auth/middleware.js'
import * as employees from '../repositories/employees.js'
import type { EmployeeInput } from '../types.js'

export const employeesRouter = Router()

employeesRouter.post(
  '/employees',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = req.body as EmployeeInput
    if (!input?.id || !input.username?.trim() || !input.name?.trim() || !input.password) {
      res.status(400).json({ error: 'id, name, username and password are required' })
      return
    }
    if (await employees.usernameTaken(input.username)) {
      res.status(409).json({ error: 'This username is already taken' })
      return
    }
    res.status(201).json(await employees.create(input))
  }),
)

employeesRouter.put(
  '/employees/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = req.body as EmployeeInput
    if (!input.username?.trim() || !input.name?.trim()) {
      res.status(400).json({ error: 'name and username are required' })
      return
    }
    if (await employees.usernameTaken(input.username, req.params.id)) {
      res.status(409).json({ error: 'This username is already taken' })
      return
    }
    const updated = await employees.update(req.params.id, input)
    if (!updated) {
      res.status(404).json({ error: 'employee not found' })
      return
    }
    res.json(updated)
  }),
)

employeesRouter.delete(
  '/employees/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await employees.remove(req.params.id)
    res.json({ ok: true })
  }),
)
