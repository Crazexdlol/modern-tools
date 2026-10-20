// Escape a user-supplied string for safe interpolation into a PostgREST
// filter expression (as used by supabase-js `.or()` and `.ilike()` calls).
//
// Risks without escaping:
//   - `,` and `)` break out of the current or() clause and let callers
//     inject additional predicates
//   - `(` opens a nested filter group
//   - `*` is a wildcard inside ilike patterns
//   - `%` and `_` are LIKE/ILIKE pattern metacharacters — a user query of
//     `%` would match everything
//   - `\` escapes within LIKE patterns; must be doubled to stay literal
//
// This is NOT full SQL injection (supabase-js parameterises everything),
// but unescaped values can widen the WHERE clause beyond what the caller
// intended, which is enough to leak out-of-scope rows.
export function escapePostgrestLike(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, '\\,')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\*/g, '\\*')
}
