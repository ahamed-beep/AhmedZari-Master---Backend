// ------------------------------------------------------------------
// POST /api/returns — record a return/refund against an existing sale.
//
// A return is stored as a NEGATIVE sale row linked to the original via
// `return_of`, so it flows through Sales History and Reports untouched
// (revenue and cost both net down automatically). In one transaction:
//   1. add the returned quantities back to stock
//   2. insert the negative sale row (+ its negative items)
//   3. for a still-owed CREDIT (ledger) sale: reduce the customer's
//      balance and record a 'wasooli' ledger entry for the refund
//
// All money is derived from the ORIGINAL sale server-side (the client's
// prices are ignored) and each item is capped at qty-sold minus qty
// already-returned. Returns:
//   { return: Sale, products: [...updated], customer?, ledgerTx? }
// ------------------------------------------------------------------
import { Router } from 'express'
import { asyncHandler } from './util.js'
import { withTransaction } from '../db.js'
import { uid } from '../utils/id.js'
import * as sales from '../repositories/sales.js'
import * as products from '../repositories/products.js'
import * as customers from '../repositories/customers.js'
import * as ledgerTx from '../repositories/ledgerTx.js'
import type { Sale, SaleItem, Product, Customer, LedgerTx } from '../types.js'

export const returnsRouter = Router()

const round2 = (n: number) => Math.round(n * 100) / 100

interface ReturnItemInput {
  productId: string
  qty: number
}

returnsRouter.post(
  '/returns',
  asyncHandler(async (req, res) => {
    const input = req.body as {
      id?: string
      saleId?: string
      date?: string
      cashier?: string
      note?: string
      items?: ReturnItemInput[]
    }

    if (!input?.saleId || !Array.isArray(input.items) || input.items.length === 0) {
      res.status(400).json({ error: 'saleId and at least one return item are required' })
      return
    }

    // ---- Validate + compute against the ORIGINAL sale (reads) ----
    const original = await sales.getById(input.saleId)
    if (!original) {
      res.status(404).json({ error: 'Original sale not found' })
      return
    }
    if (original.returnOf) {
      res.status(400).json({ error: 'Cannot return a return' })
      return
    }

    // Aggregate the original lines by product (one line per product normally).
    const soldByProduct = new Map<string, SaleItem>()
    for (const it of original.items) {
      if (!it.productId) continue
      const prev = soldByProduct.get(it.productId)
      if (prev) prev.qty += it.qty
      else soldByProduct.set(it.productId, { ...it })
    }
    const alreadyReturned = await sales.returnedQtyByProduct(original.id)

    const returnItems: SaleItem[] = []
    let lineValue = 0
    for (const reqItem of input.items) {
      const qty = Math.floor(Number(reqItem.qty) || 0)
      if (qty <= 0) continue
      const sold = soldByProduct.get(reqItem.productId)
      if (!sold) {
        res.status(400).json({ error: `Product ${reqItem.productId} was not part of this sale` })
        return
      }
      const remaining = sold.qty - (alreadyReturned.get(reqItem.productId) ?? 0)
      if (qty > remaining) {
        res.status(400).json({
          error: `Cannot return ${qty} of "${sold.name}" — only ${remaining} left to return`,
        })
        return
      }
      // Stored negative; price/cost are the authoritative original values.
      returnItems.push({ productId: sold.productId, name: sold.name, price: sold.price, cost: sold.cost, qty: -qty })
      lineValue += sold.price * qty
    }

    if (returnItems.length === 0 || lineValue <= 0) {
      res.status(400).json({ error: 'Nothing to return — set a quantity greater than zero' })
      return
    }

    // Refund honours any overall discount on the original bill (prorated).
    const refund =
      original.subtotal > 0 ? round2(lineValue * (original.total / original.subtotal)) : round2(lineValue)

    const returnSale: Sale = {
      id: input.id || uid(),
      date: input.date || new Date().toISOString(),
      cashier: input.cashier || original.cashier,
      items: returnItems,
      subtotal: -round2(lineValue),
      discount: round2(refund - lineValue), // ≤ 0, keeps subtotal - discount === total
      total: -refund,
      paymentType: original.paymentType,
      settledImmediately: false,
      customerId: original.customerId,
      customerName: original.customerName,
      customerPhone: original.customerPhone,
      reference: (input.note?.trim() ? input.note.trim() + ' — ' : '') + 'Return of Bill #' + original.id.slice(-5),
      returnOf: original.id,
    }

    // A refund touches the ledger only for a sale that is still on credit.
    const affectsLedger = original.paymentType === 'ledger' && !!original.customerId

    // ---- Writes (one transaction) ----
    const result = await withTransaction(async (conn) => {
      const saved = await sales.create(returnSale, conn)

      const updatedProducts: Product[] = []
      for (const it of returnItems) {
        const p = await products.adjustStock(it.productId, -it.qty, conn) // -(-qty) = +qty back to stock
        if (p) updatedProducts.push(p)
      }

      let customer: Customer | undefined
      let tx: LedgerTx | undefined
      if (affectsLedger) {
        customer = (await customers.adjustBalance(original.customerId!, -refund, conn)) ?? undefined
        tx = await ledgerTx.create(
          {
            id: uid(),
            customerId: original.customerId!,
            type: 'wasooli', // reduces what the customer owes
            amount: refund,
            note: 'Return — Bill #' + original.id.slice(-5),
            saleIds: [saved.id],
            date: saved.date,
          },
          conn,
        )
      }

      return { return: saved, products: updatedProducts, customer, ledgerTx: tx }
    })

    res.status(201).json(result)
  }),
)
