// Postgres error code 42P01 = undefined_table. Returned when the chat tables
// haven't been migrated yet. Every chat API path checks for this and returns
// { migrationPending: true } instead of 500ing.
export function isMissingTable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: string }).code
  return code === '42P01'
}

export interface MigrationPendingResponse {
  migrationPending: true
}
