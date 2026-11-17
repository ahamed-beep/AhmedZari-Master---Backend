// ------------------------------------------------------------------
// Shared types — these mirror the shapes the React frontend actually
// produces/consumes (the JSON contract). The client-generated `id`
// (uid()) is stored as `pos_id` in MySQL.
// ------------------------------------------------------------------

export interface Product {
  id: string
  name: string
  barcode: string
  category: string
  purchase: number
  price: number
  stock: number
  unit: string
}

export interface Employee {
  id: string
  username: string
  name: string
  role: 'admin' | 'employee'
}

/** Employee create/update payload — may carry a plaintext password to hash. */
export interface EmployeeInput extends Employee {
  password?: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  balance: number
}

export interface Purchase {
  id: string
  productId: string
  productName: string
  qty: number
  cost: number
  total: number
  note: string
  date: string
}

export interface LedgerTx {
  id: string
  customerId: string
  type: 'udhaar' | 'wasooli'
  amount: number
  note: string
  ref: string
  saleIds: string[]
  date: string
}

export interface SaleItem {
  productId: string
  name: string
  price: number
  cost: number
  qty: number
}

export interface Sale {
  id: string
  date: string
  cashier: string
  items: SaleItem[]
  subtotal: number
  discount: number
  total: number
  paymentType: string // 'cash' | 'ledger'
  settledImmediately: boolean
  customerId: string | null
  customerName: string
  customerPhone: string
  reference: string
  /** If set, this sale row is a RETURN of the referenced sale's pos_id
   *  (its items/amounts are stored negative). Absent on normal sales. */
  returnOf?: string | null
}

export type Settings = Record<string, unknown>

/** JWT payload / authenticated user attached to the request. */
export interface AuthUser {
  id: string
  username: string
  name: string
  role: 'admin' | 'employee'
}
