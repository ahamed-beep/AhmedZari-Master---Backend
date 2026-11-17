// ------------------------------------------------------------------
// GET  /api/ledger-tx — paged/searchable ledger entries (LedgerScreen list).
// POST /api/ledger-tx — manual ledger entry (from LedgerScreen).
// Inserts the transaction and adjusts the customer's balance atomically:
//   udhaar  (credit given)     -> balance + amount
//   wasooli (payment received) -> balance - amount
// Returns { tx, customer }.
// ------------------------------------------------------------------
import { Router } from 'express'
import { asyncHandler, parsePaging, queryDay, queryStr } from './util.js'
import { withTransaction } from '../db.js'
import * as ledgerTx from '../repositories/ledgerTx.js'
import * as customers from '../repositories/customers.js'

export const ledgerTxRouter = Router()

const LEDGER_PAGE_SIZE = 50

/**
 * GET /api/ledger-tx?q=&from=&to=&page=&pageSize=&all=1
 * Newest first, with the customer name/phone joined in. `q` matches customer
 * name, phone or note; from/to are inclusive 'YYYY-MM-DD' bounds.
 * `all=1` returns every match unpaged — used by the statement PDF, which must
 * cover the whole filtered range rather than the page on screen.
 */
ledgerTxRouter.get(
  '/ledger-tx',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePaging(req.query, LEDGER_PAGE_SIZE)
    const wantsAll = queryStr(req.query.all) === '1'
    const filters = {
      q: queryStr(req.query.q).trim(),
      from: queryDay(req.query.from),
      to: queryDay(req.query.to),
    }
    const { items, total } = await ledgerTx.listPaged(
      wantsAll ? { ...filters, limit: 0 } : { ...filters, offset, limit: pageSize },
    )
    res.json({ items, total, page: wantsAll ? 1 : page, pageSize: wantsAll ? total : pageSize })
  }),
)

ledgerTxRouter.post(
  '/ledger-tx',
  asyncHandler(async (req, res) => {
    const { id, customerId, type, amount, note } = req.body ?? {}
    const amt = Number(amount)
    if (!id || !customerId || (type !== 'udhaar' && type !== 'wasooli') || !(amt > 0)) {
      res.status(400).json({ error: 'id, customerId, valid type and positive amount are required' })
      return
    }

    const result = await withTransaction(async (conn) => {
      const tx = await ledgerTx.create({ id, customerId, type, amount: amt, note }, conn)
      const delta = type === 'udhaar' ? amt : -amt
      const customer = await customers.adjustBalance(customerId, delta, conn)
      return { tx, customer }
    })

    res.status(201).json(result)
  }),
)
