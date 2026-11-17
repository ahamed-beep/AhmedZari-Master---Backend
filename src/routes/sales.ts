// ------------------------------------------------------------------
// POST /api/sales — transactional checkout. In one transaction:
//   1. decrement stock for each cart item
//   2. insert the sale (+ its items)
//   3. for a credit (ledger) sale: bump the customer's balance and
//      upsert-merge ONE 'udhaar' entry per customer per day (multiple
//      same-day bills merge into a single entry with combined saleIds)
//
// This replicates SaleScreen.checkout() exactly, but atomically and
// server-authoritatively. Returns:
//   { sale, products: [...updated], customer?, ledgerTx? }
// ------------------------------------------------------------------
import { Router } from 'express'
import { asyncHandler } from './util.js'
import { withTransaction } from '../db.js'
import { uid } from '../utils/id.js'
import * as sales from '../repositories/sales.js'
import * as products from '../repositories/products.js'
import * as customers from '../repositories/customers.js'
import * as ledgerTx from '../repositories/ledgerTx.js'
import type { Sale, Product, Customer, LedgerTx } from '../types.js'

export const salesRouter = Router()

salesRouter.post(
  '/sales',
  asyncHandler(async (req, res) => {
    const input = req.body as Sale
    if (!input?.id || !Array.isArray(input.items) || input.items.length === 0) {
      res.status(400).json({ error: 'id and at least one item are required' })
      return
    }
    if (!input.customerName?.trim()) {
      res.status(400).json({ error: 'customerName is required' })
      return
    }
    const isCredit = input.paymentType === 'ledger' && !!input.customerId
    if (isCredit && !input.customerId) {
      res.status(400).json({ error: 'customerId is required for a ledger sale' })
      return
    }

    const result = await withTransaction(async (conn) => {
      // 1) Decrement stock per item (sum qty per product first).
      const qtyByProduct = new Map<string, number>()
      for (const it of input.items) {
        if (!it.productId) continue
        qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) ?? 0) + Number(it.qty || 0))
      }
      const updatedProducts: Product[] = []
      for (const [productId, qty] of qtyByProduct) {
        const p = await products.adjustStock(productId, -qty, conn)
        if (p) updatedProducts.push(p)
      }

      // 2) Insert the sale.
      const sale = await sales.create(input, conn)

      // 3) Credit-sale ledger handling.
      let customer: Customer | undefined
      let tx: LedgerTx | undefined
      if (isCredit) {
        customer = (await customers.adjustBalance(input.customerId!, input.total, conn)) ?? undefined

        const isoDayKey = sale.date.slice(0, 10)
        const existing = await ledgerTx.findSaleUdhaarForDay(input.customerId!, isoDayKey, conn)
               if (existing) {
          const saleIds = [...existing.saleIds, sale.id]

          // Same-day bills ke references jama karo (duplicate na ho).
          const newRef = (input.reference ?? '').trim()
          const mergedRef =
            newRef && !existing.ref.split(', ').includes(newRef)
              ? [existing.ref, newRef].filter(Boolean).join(', ')
              : existing.ref

          tx =
            (await ledgerTx.updateMerge(
              existing.id,
              {
                amount: existing.amount + input.total,
                date: sale.date,
                saleIds,
                note: 'Sale Bills #' + saleIds.map((id) => id.slice(-5)).join(', #'),
                ref: mergedRef,
              },
              conn,
            )) ?? undefined
        } else {
          tx = await ledgerTx.create(
            {
              id: uid(),
              customerId: input.customerId!,
              type: 'udhaar',
              amount: input.total,
              note: 'Sale Bill #' + sale.id.slice(-5),
              ref: input.reference,
              saleIds: [sale.id],
              date: sale.date,
            },
            conn,
          )
        }
      }

      return { sale, products: updatedProducts, customer, ledgerTx: tx }
    })

    res.status(201).json(result)
  }),
)
