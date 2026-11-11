/**
 * Minimal in-memory rate limiter (no external dependency).
 *
 * Keyed by authenticated user id (falls back to IP). Suitable for a single
 * process / the AI test endpoint; for multi-instance deployments swap the
 * store for Redis. Keeps AI spend and abuse in check.
 */
const buckets = new Map();

export const rateLimit = ({ windowMs, max }) => (req, res, next) => {
  const key = req.user?._id?.toString() || req.ip;
  const now = Date.now();

  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (entry.count >= max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({
      success: false,
      message: `Too many requests. Try again in ${retryAfter}s.`,
    });
  }

  entry.count += 1;
  next();
};

// Periodically evict stale buckets so the map doesn't grow unbounded.
const SWEEP_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}, SWEEP_MS).unref?.();
