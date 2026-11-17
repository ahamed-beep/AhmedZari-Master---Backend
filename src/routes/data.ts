// ------------------------------------------------------------------
// Read endpoints (bootstrap). Kept bulk to minimise frontend change:
//   GET /api/data        -> all collections, keyed exactly as before
//   GET /api/data/:key   -> a single collection { key, value }
// The 'employees' collection NEVER includes passwords.
// ------------------------------------------------------------------
import { Router } from 'express'
import { asyncHandler } from './util.js'
import * as products from '../repositories/products.js'
import * as employees from '../repositories/employees.js'
import * as customers from '../repositories/customers.js'
import * as sales from '../repositories/sales.js'
import * as ledgerTx from '../repositories/ledgerTx.js'
import * as purchases from '../repositories/purchases.js'
import * as settings from '../repositories/settings.js'

export const dataRouter = Router()

// key -> loader. 'ledger' maps to customers (frontend naming).
const loaders = {
  products: () => products.getAll(),
  sales: () => sales.getAll(),
  employees: () => employees.getAll(),
  ledger: () => customers.getAll(),
  ledgerTx: () => ledgerTx.getAll(),
  purchases: () => purchases.getAll(),
  settings: () => settings.getAll(),
} as const

type Key = keyof typeof loaders

dataRouter.get(
  '/data',
  asyncHandler(async (_req, res) => {
    const keys = Object.keys(loaders) as Key[]
    const entries = await Promise.all(keys.map(async (k) => [k, await loaders[k]()] as const))
    res.json(Object.fromEntries(entries))
  }),
)

dataRouter.get(
  '/data/:key',
  asyncHandler(async (req, res) => {
    const key = req.params.key as Key
    if (!(key in loaders)) {
      res.status(404).json({ error: 'unknown key' })
      return
    }
    res.json({ key, value: await loaders[key]() })
  }),
)
