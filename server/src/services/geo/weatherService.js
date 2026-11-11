import { providerConfig } from "../../config/providers.js";
import { fetchJson, cacheGet, cacheSet, ProviderError } from "./geoHttp.js";

/**
 * weatherService — daily weather forecast by coordinates.
 * Default provider: Open-Meteo (keyless). Provider-switchable via env.
 *
 * Open-Meteo forecasts ~16 days ahead; dates outside that window are reported
 * as unavailable (so callers never present a guess as a real forecast).
 */
const cfg = providerConfig.weather;
const MAX_FORECAST_DAYS = 16;

// WMO weather codes → short labels.
const WMO = {
  0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Rain showers", 81: "Rain showers", 82: "Violent rain showers",
  85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm", 96: "Thunderstorm w/ hail", 99: "Thunderstorm w/ hail",
};

const daysFromToday = (iso) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z")) / 86400000);

/**
 * @param {object} opts { lat, lon, startDate?, endDate? } (YYYY-MM-DD)
 * @returns {Promise<{source, provider, coordinates, inForecastRange, days, note?}>}
 */
export const getForecast = async ({ lat, lon, startDate, endDate } = {}) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new ProviderError("Valid lat and lon are required.", { statusCode: 400, code: "invalid_coords" });
  }
  if (cfg.provider !== "open-meteo") {
    throw new ProviderError(`Unsupported weather provider "${cfg.provider}".`, {
      statusCode: 503,
      code: "provider_unconfigured",
    });
  }

  // Decide if the requested window is within the forecastable range.
  let startOffset = startDate ? daysFromToday(startDate) : 0;
  const endOffset = endDate ? daysFromToday(endDate) : startOffset + 6;
  const inForecastRange = !startDate || (endOffset >= 0 && startOffset <= MAX_FORECAST_DAYS);

  const cacheKey = `weather:${lat.toFixed(3)},${lon.toFixed(3)}:${startDate || "now"}:${endDate || ""}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { source: "cache", provider: cfg.provider, ...cached };

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
    timezone: "auto",
  });
  if (startDate && endDate && inForecastRange) {
    // Clamp to the forecastable window.
    const clampStart = daysFromToday(startDate) < 0 ? new Date().toISOString().slice(0, 10) : startDate;
    params.set("start_date", clampStart);
    params.set("end_date", endDate);
  } else {
    params.set("forecast_days", "7");
  }

  const data = await fetchJson(`${cfg.baseUrl}/v1/forecast?${params.toString()}`, { label: "Open-Meteo" });
  const d = data.daily || {};
  const days = (d.time || []).map((date, i) => ({
    date,
    condition: WMO[d.weather_code?.[i]] ?? "Unknown",
    weatherCode: d.weather_code?.[i] ?? null,
    tempMaxC: d.temperature_2m_max?.[i] ?? null,
    tempMinC: d.temperature_2m_min?.[i] ?? null,
    precipitationMm: d.precipitation_sum?.[i] ?? null,
    precipitationProbPct: d.precipitation_probability_max?.[i] ?? null,
    windMaxKph: d.wind_speed_10m_max?.[i] ?? null,
  }));

  const payload = {
    coordinates: { lat: data.latitude, lon: data.longitude },
    timezone: data.timezone,
    inForecastRange,
    days,
    ...(startDate && !inForecastRange
      ? { note: `Trip dates are beyond the ~${MAX_FORECAST_DAYS}-day forecast horizon; no reliable forecast is available.` }
      : {}),
  };
  cacheSet(cacheKey, payload);
  return { source: "api", provider: cfg.provider, ...payload };
};

export default { getForecast };
