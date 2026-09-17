// Per-serverless-function in-memory rate limiter. Not global (each Vercel
// lambda has its own memory), but catches accidental runaway loops and
// drive-by spam. Generous limits — trusted internal team, this is a
// safety net for cost-DoS, not throttling.

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

// Trim occasionally so the map doesn't grow unbounded per lambda.
let lastSweep = 0
function sweep() {
  const now = Date.now()
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k)
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetInSeconds: number
}

// Check + consume one token. Returns ok=false if the caller is over the limit.
export function rateLimit(key: string, max: number, windowSeconds: number): RateLimitResult {
  sweep()
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return { ok: true, remaining: max - 1, resetInSeconds: windowSeconds }
  }
  b.count++
  if (b.count > max) {
    return { ok: false, remaining: 0, resetInSeconds: Math.ceil((b.resetAt - now) / 1000) }
  }
  return { ok: true, remaining: max - b.count, resetInSeconds: Math.ceil((b.resetAt - now) / 1000) }
}
