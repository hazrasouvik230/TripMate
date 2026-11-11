/**
 * packingService — deterministic packing-list generation (pure JS, no LLM).
 *
 * Builds a list from trip facts (length, travellers, interests, style) and,
 * when provided, the real weather forecast. Weather-driven items are flagged so
 * callers can distinguish them. Quantities are per traveller unless noted.
 */

const MS_DAY = 86_400_000;
const dayCount = (start, end) => {
  const a = new Date(start).setUTCHours(0, 0, 0, 0);
  const b = new Date(end).setUTCHours(0, 0, 0, 0);
  return Math.max(1, Math.round((b - a) / MS_DAY) + 1);
};

const hasInterest = (interests, ...keys) =>
  (interests || []).some((i) => keys.some((k) => i.toLowerCase().includes(k)));

/**
 * @param {object} trip
 * @param {Array|null} weatherDays - [{condition, tempMinC, tempMaxC, precipitationProbPct}]
 * @returns {object} structured packing list grouped by category
 */
export const generatePackingList = (trip, weatherDays = null) => {
  const days = dayCount(trip.startDate, trip.endDate);
  const interests = trip.interests || [];

  // Weather signals (only if a real forecast was supplied).
  let rainy = false,
    cold = false,
    hot = false,
    snowy = false;
  if (Array.isArray(weatherDays) && weatherDays.length) {
    for (const d of weatherDays) {
      const cond = `${d.condition || ""}`.toLowerCase();
      if ((d.precipitationProbPct ?? 0) >= 40 || /rain|drizzle|shower/.test(cond)) rainy = true;
      if ((d.tempMinC ?? 99) <= 8) cold = true;
      if ((d.tempMaxC ?? -99) >= 28) hot = true;
      if (/snow/.test(cond)) snowy = true;
    }
  }

  const item = (name, qty, weatherBased = false) => ({ item: name, qty, weatherBased });

  const essentials = [
    item("Passport / ID", 1),
    item("Phone + charger", 1),
    item("Travel adapter", 1),
    item("Payment cards / cash", 1),
    item("Reusable water bottle", 1),
    item("Toiletries kit", 1),
    item("Any medications", 1),
  ];

  const clothing = [
    item("Tops / shirts", Math.min(days, 7)),
    item("Underwear", days + 1),
    item("Socks", days + 1),
    item("Trousers / bottoms", Math.max(2, Math.ceil(days / 2))),
    item("Comfortable walking shoes", 1),
    item("Sleepwear", 1),
  ];

  const weather = [];
  if (rainy) { weather.push(item("Compact umbrella", 1, true), item("Waterproof jacket", 1, true)); }
  if (cold) { weather.push(item("Warm layers / sweater", 2, true), item("Hat & gloves", 1, true)); }
  if (snowy) weather.push(item("Insulated waterproof boots", 1, true));
  if (hot) { weather.push(item("Sunscreen", 1, true), item("Sunglasses", 1, true), item("Hat / cap", 1, true)); }

  const activities = [];
  if (hasInterest(interests, "beach")) activities.push(item("Swimwear", 2), item("Beach towel", 1));
  if (hasInterest(interests, "hik", "nature", "adventure")) activities.push(item("Hiking shoes", 1), item("Daypack", 1));
  if (hasInterest(interests, "photo")) activities.push(item("Camera + spare battery", 1));
  if (hasInterest(interests, "nightlife")) activities.push(item("Smart-casual outfit", 1));
  if (hasInterest(interests, "museum", "art", "history", "culture")) activities.push(item("Comfortable layers for indoor venues", 1));

  const weatherSummary =
    Array.isArray(weatherDays) && weatherDays.length
      ? { source: "api", rainy, cold, hot, snowy }
      : { source: "none", note: "No weather forecast available; packing is based on trip length and interests only." };

  return {
    destination: trip.destination,
    days,
    travellers: trip.travellers,
    quantitiesNote: "Quantities are per traveller unless stated otherwise.",
    weatherSummary,
    categories: {
      essentials,
      clothing,
      weather,
      activities,
    },
    disclaimer: "A suggested starting point — adjust for your own needs, laundry access, and airline baggage limits.",
  };
};

export default { generatePackingList };
