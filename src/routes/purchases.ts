// ------------------------------------------------------------------
// POST /api/purchases — transactional stock-in.
// Inserts a purchase and increments the product's stock in one
// transaction. `setProductCost: true` (Reports "Add Purchase") also
// updates the product's purchase cost; the ProductsScreen "+Stock"
// quick-add omits it. Returns { purchase, product }.
// ------------------------------------------------------------------
import { Router } from 'express'
import { asyncHandler } from './util.js'
import { withTransaction } from '../db.js'
import * as purchases from '../repositories/purchases.js'
import * as products from '../repositories/products.js'
import type { Purchase } from '../types.js'

export const purchasesRouter = Router()

purchasesRouter.post(
  '/purchases',
  asyncHandler(async (req, res) => {
    const input = req.body as Purchase & { setProductCost?: boolean }
    if (!input?.id || !input.productId || !(Number(input.qty) > 0)) {
      res.status(400).json({ error: 'id, productId and a positive qty are required' })
      return
    }

    const result = await withTransaction(async (conn) => {
      const purchase = await purchases.create(input, conn)
      const product = await products.adjustStock(
        input.productId,
        Number(input.qty),
        conn,
        input.setProductCost ? Number(input.cost) : undefined,
      )
      return { purchase, product }
    })

    res.status(201).json(result)
  }),
)
