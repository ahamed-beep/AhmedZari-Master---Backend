// ============================================================
// AgroPoint POS — Node.js + Express + TypeScript backend
// Replaces the plain-PHP backend. Same MySQL database.
//
// Public:   GET  /api/health,  POST /api/login
// Auth'd:   GET  /api/data[/:key]  (bootstrap read)
//           POST/PUT/DELETE  /api/products, /api/employees, ...
//           POST /api/sales, /api/purchases, /api/ledger-tx (transactional)
// ============================================================
import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { config } from './config.js'
import { requireAuth } from './auth/middleware.js'
import { authRouter } from './auth/routes.js'
import { dataRouter } from './routes/data.js'
import { productsRouter } from './routes/products.js'
import { employeesRouter } from './routes/employees.js'
import { customersRouter } from './routes/customers.js'
import { settingsRouter } from './routes/settings.js'
import { salesRouter } from './routes/sales.js'
import { returnsRouter } from './routes/returns.js'
import { purchasesRouter } from './routes/purchases.js'
import { ledgerTxRouter } from './routes/ledgerTx.js'

const app = express()

app.use(
  cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
  }),
)
app.use(express.json({ limit: '5mb' }))

// ---- Public endpoints ----
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() })
})
app.use('/api', authRouter) // POST /api/login

// ---- Everything below requires a valid JWT ----
app.use('/api', requireAuth)
app.use('/api', dataRouter)
app.use('/api', productsRouter)
app.use('/api', employeesRouter)
app.use('/api', customersRouter)
app.use('/api', settingsRouter)
app.use('/api', salesRouter)
app.use('/api', returnsRouter)
app.use('/api', purchasesRouter)
app.use('/api', ledgerTxRouter)

// ---- 404 + error handling ----
app.use((_req, res) => {
  res.status(404).json({ error: 'not found' })
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Log the real error server-side; return a generic message to the client so
  // internal details (e.g. DB host/port) are never leaked.
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Server error — please try again' })
})

// Safety net: log (don't crash) on stray async errors. Route handlers are
// wrapped in asyncHandler so these should be rare, but a POS server should
// stay up rather than exit on one bad request.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})

app.listen(config.port, () => {
  console.log(`AgroPoint Node backend listening on http://localhost:${config.port}`)
})
