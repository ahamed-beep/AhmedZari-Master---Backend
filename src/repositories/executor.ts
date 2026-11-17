// A query executor is either the shared pool or a per-transaction
// connection. Both expose the same `.query()` used by the repositories.
import type { Pool, PoolConnection } from 'mysql2/promise'

export type Executor = Pool | PoolConnection
