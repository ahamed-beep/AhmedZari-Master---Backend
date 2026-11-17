import type { NextFunction, Request, RequestHandler, Response } from 'express'

/** Wrap an async route so thrown/rejected errors reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}

/** First value of a query param (Express gives arrays for repeated params). */
export function queryStr(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

/**
 * Parse ?page=&pageSize= into a safe { page, pageSize, offset }. Bad or
 * missing values fall back to page 1 / `defaultSize`; pageSize is capped so a
 * client can't ask for the whole table by accident.
 */
export function parsePaging(
  query: Request['query'],
  defaultSize: number,
  maxSize = 500,
): { page: number; pageSize: number; offset: number } {
  const rawPage = Number(queryStr(query.page))
  const rawSize = Number(queryStr(query.pageSize))
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const size = Number.isFinite(rawSize) && rawSize >= 1 ? Math.floor(rawSize) : defaultSize
  const pageSize = Math.min(size, maxSize)
  return { page, pageSize, offset: (page - 1) * pageSize }
}

/** 'YYYY-MM-DD' or '' — guards the value going into a date comparison. */
export function queryDay(value: unknown): string {
  const s = queryStr(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}
