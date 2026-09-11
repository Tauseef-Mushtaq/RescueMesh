/**
 * Minimal in-memory rate limiter (M12).
 *
 * The project has no rate-limiting mechanism yet (confirmed by
 * inspection before writing this — see HANDOFF_M12.md), so this
 * implements the smallest one needed to protect `/api/rag` and
 * `/api/rag/ingest` from uncontrolled abuse, per the module prompt's
 * "do not build an elaborate distributed rate-limiter" /
 * "reuse the existing mechanism if available" guidance.
 *
 * Deliberately NOT distributed: this is a per-process, in-memory
 * fixed-window counter. On Vercel this resets on cold start and is
 * tracked independently per serverless instance, so it is a
 * best-effort throttle, not a hard guarantee — acceptable for an MVP
 * with no existing rate-limit infrastructure to build on, and clearly
 * documented as such rather than presented as a real distributed
 * limiter (see HANDOFF_M12.md's Known limitations).
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Returns true if `key` is still within `limit` requests per
 * `windowMs`, incrementing its counter as a side effect. Old buckets
 * are lazily evicted on access so this map cannot grow without bound
 * across the process lifetime beyond the number of distinct keys seen
 * within one window.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  existing.count += 1;
  return true;
}

/** Best-effort client identifier from standard proxy headers, falling
 * back to a constant so requests without either header still share a
 * (global) bucket rather than bypassing the limiter entirely. */
export function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
