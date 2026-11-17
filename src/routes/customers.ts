// ------------------------------------------------------------------
// Customers (ledger). Read/create/update are allowed for any authenticated
// user; delete is admin-only (matches the frontend) and cascades the
// customer's ledger transactions inside one transaction.
// ------------------------------------------------------------------
import { Router } from 'express'
import { asyncHandler, parsePaging, queryStr } from './util.js'
import { requireAdmin } from '../auth/middleware.js'
import { withTransaction } from '../db.js'
import * as customers from '../repositories/customers.js'
import type { Customer } from '../types.js'

export const customersRouter = Router()

const CUSTOMER_PAGE_SIZE = 10

/**
 * GET /api/customers?q=&page=&pageSize=
 * A page of customers plus `total` for the pager. `toReceive`/`toGive` are
 * shop-wide totals over every customer, so the summary tiles stay correct
 * while the user is on page 3 or filtering by name.
 */
customersRouter.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePaging(req.query, CUSTOMER_PAGE_SIZE)
    const q = queryStr(req.query.q).trim()
    const [{ items, total }, totals] = await Promise.all([
      customers.listPaged({ q, offset, limit: pageSize }),
      customers.balanceTotals(),
    ])
    res.json({ items, total, page, pageSize, ...totals })
  }),
)

customersRouter.post(
  '/customers',
  asyncHandler(async (req, res) => {
    const input = req.body as Customer
    if (!input?.id || !input.name?.trim()) {
      res.status(400).json({ error: 'id and name are required' })
      return
    }
    res.status(201).json(await customers.create(input))
  }),
)

/**
 * PUT /api/customers/:id — edit the profile only (name, phone).
 * `balance` is ignored on purpose: it is derived from sales and ledger
 * transactions, so accepting it here would let the account drift from its
 * own history. Use POST /api/ledger-tx to move a balance.
 */
customersRouter.put(
  '/customers/:id',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Partial<Customer>
    const fields: { name?: string; phone?: string } = {}

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) {
        res.status(400).json({ error: 'name cannot be empty' })
        return
      }
      fields.name = name
    }
    if (body.phone !== undefined) fields.phone = String(body.phone).trim()

    const updated = await customers.update(req.params.id, fields)
    if (!updated) {
      res.status(404).json({ error: 'customer not found' })
      return
    }
    res.json(updated)
  }),
)

customersRouter.delete(
  '/customers/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await withTransaction((conn) => customers.remove(req.params.id, conn))
    res.json({ ok: true })
  }),
)
