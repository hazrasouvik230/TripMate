import { providerConfig } from "../../config/providers.js";
import { fetchJson, cacheGet, cacheSet, ProviderError } from "../geo/geoHttp.js";

/**
 * fxService — currency exchange rates for optional display conversion.
 * Default provider: Frankfurter (ECB reference rates, keyless).
 *
 * Reliability: rates are cached (1h) and failures/unsupported currencies throw
 * a typed ProviderError so callers can degrade gracefully (show base-currency
 * amounts and say conversion is unavailable) rather than fabricate a rate.
 */
const cfg = providerConfig.fx;

/**
 * @returns {Promise<{rate, date, provider, source}>}
 * @throws {ProviderError} when a rate can't be obtained (unsupported/unavailable)
 */
export const getRate = async (from, to) => {
  const f = String(from || "").toUpperCase();
  const t = String(to || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(f) || !/^[A-Z]{3}$/.test(t)) {
    throw new ProviderError("Currencies must be 3-letter ISO codes.", {
      statusCode: 400,
      code: "invalid_currency",
    });
  }
  if (f === t) return { rate: 1, date: null, provider: "none", source: "identity" };

  if (cfg.provider !== "frankfurter") {
    throw new ProviderError(`Unsupported FX provider "${cfg.provider}".`, {
      statusCode: 503,
      code: "provider_unconfigured",
    });
  }

  const cacheKey = `fx:${f}:${t}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { ...cached, source: "cache" };

  let data;
  try {
    data = await fetchJson(`${cfg.baseUrl}/latest?from=${f}&to=${t}`, { label: "Frankfurter" });
  } catch (e) {
    // 404 from Frankfurter => unsupported currency pair.
    if (e.statusCode === 404) {
      throw new ProviderError(`Exchange rate ${f}→${t} is not available from the provider.`, {
        statusCode: 422,
        code: "rate_unavailable",
      });
    }
    throw e;
  }

  const rate = data?.rates?.[t];
  if (!Number.isFinite(rate)) {
    throw new ProviderError(`Exchange rate ${f}→${t} is not available.`, {
      statusCode: 422,
      code: "rate_unavailable",
    });
  }

  const payload = { rate, date: data.date || null, provider: cfg.provider };
  cacheSet(cacheKey, payload, cfg.cacheTtlMs);
  return { ...payload, source: "api" };
};

export default { getRate };
