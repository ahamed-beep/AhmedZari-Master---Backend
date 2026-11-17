// ------------------------------------------------------------------
// Products CRUD. Create/edit/delete require admin (matches the frontend,
// where only admins see these actions). Reads happen via /api/data.
// ------------------------------------------------------------------
import { Router } from 'express'
import { asyncHandler } from './util.js'
import { requireAdmin } from '../auth/middleware.js'
import * as products from '../repositories/products.js'
import type { Product } from '../types.js'

export const productsRouter = Router()

productsRouter.post(
  '/products',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = req.body as Product
    if (!input?.id || !input.name?.trim()) {
      res.status(400).json({ error: 'id and name are required' })
      return
    }
    res.status(201).json(await products.create(input))
  }),
)

productsRouter.put(
  '/products/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const updated = await products.update(req.params.id, req.body as Partial<Product>)
    if (!updated) {
      res.status(404).json({ error: 'product not found' })
      return
    }
    res.json(updated)
  }),
)

productsRouter.delete(
  '/products/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await products.remove(req.params.id)
    res.json({ ok: true })
  }),
)
