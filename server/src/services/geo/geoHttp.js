import { providerConfig } from "../../config/providers.js";

/**
 * Shared HTTP helpers for external providers: typed errors, timeouts, an
 * ephemeral TTL cache, and a per-key throttle (for Nominatim's 1 req/s policy).
 */

export class ProviderError extends Error {
  constructor(message, { statusCode = 502, code = "provider_error", retryable = false } = {}) {
    super(message);
    this.name = "ProviderError";
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }
}

/* ---------- Ephemeral TTL cache (not persisted) ---------- */
const cache = new Map();
export const cacheGet = (key) => {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
};
export const cacheSet = (key, value, ttl = providerConfig.cacheTtlMs) => {
  cache.set(key, { value, expires: Date.now() + ttl });
  if (cache.size > 1000) cache.delete(cache.keys().next().value);
};

/* ---------- Simple per-key throttle (respect provider rate policy) ---------- */
const lastCallAt = new Map();
const waiters = new Map();
export const throttle = async (key, minIntervalMs) => {
  if (!minIntervalMs) return;
  const prev = waiters.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((r) => (release = r));
  waiters.set(key, prev.then(() => gate));
  await prev;
  const since = Date.now() - (lastCallAt.get(key) || 0);
  if (since < minIntervalMs) await new Promise((r) => setTimeout(r, minIntervalMs - since));
  lastCallAt.set(key, Date.now());
  release();
};

/* ---------- fetch JSON with timeout + provider-aware errors ---------- */
export const fetchJson = async (url, { headers = {}, label = "provider" } = {}) => {
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": providerConfig.userAgent, Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(providerConfig.timeoutMs),
    });
  } catch (e) {
    if (e?.name === "AbortError" || e?.name === "TimeoutError") {
      throw new ProviderError(`${label} timed out.`, { statusCode: 504, code: "timeout", retryable: true });
    }
    throw new ProviderError(`Could not reach ${label}.`, { statusCode: 502, code: "connection_error", retryable: true });
  }

  if (res.status === 429) {
    throw new ProviderError(`${label} is rate limiting. Try again shortly.`, {
      statusCode: 429,
      code: "provider_rate_limited",
      retryable: true,
    });
  }
  if (!res.ok) {
    throw new ProviderError(`${label} returned ${res.status}.`, {
      statusCode: res.status >= 500 ? 502 : res.status,
      code: "provider_error",
      retryable: res.status >= 500,
    });
  }
  try {
    return await res.json();
  } catch {
    throw new ProviderError(`${label} returned invalid JSON.`, { statusCode: 502, code: "invalid_response" });
  }
};
