// Matches the frontend's uid() format so server-generated ids (e.g. the
// auto ledger entry created during checkout) look identical to client ids.
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}
