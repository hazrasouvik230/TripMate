/**
 * budgetService — deterministic trip budget calculations (pure JS, no LLM).
 *
 * `calculateBudget` is the compact summary used by the MCP tool.
 * `summarize` is the full category/daily breakdown used by the budget dashboard.
 * All arithmetic here is deterministic; currency conversion (if any) is applied
 * with a rate the caller fetched, so this module performs no I/O.
 */
import { BUDGET_CATEGORIES } from "../../models/Budget.js";

const MS_DAY = 86_400_000;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Resolve a trip's budget to an overall figure. When `budgetType` is
// "per_person" the stored `budget` is per traveller, so multiply by headcount.
const effectiveBudget = (trip) => {
  const b = Number(trip.budget) || 0;
  if (trip.budgetType === "per_person") return round2(b * (trip.travellers || 1));
  return b;
};

const dayCount = (start, end) => {
  const a = new Date(start).setUTCHours(0, 0, 0, 0);
  const b = new Date(end).setUTCHours(0, 0, 0, 0);
  return Math.max(1, Math.round((b - a) / MS_DAY) + 1);
};

// A common rough allocation of a travel budget (guideline only, not advice).
const ALLOCATION = {
  accommodation: 0.35,
  food: 0.25,
  activities: 0.2,
  localTransport: 0.1,
  misc: 0.1,
};

/**
 * @param {object} trip       - Mongoose trip (destination, dates, travellers, budget, currency)
 * @param {object|null} itinerary - latest itinerary (optional; provides estimatedTotalCost)
 * @returns {object} structured, fully-computed budget breakdown
 */
export const calculateBudget = (trip, itinerary = null) => {
  const days = dayCount(trip.startDate, trip.endDate);
  const travellers = trip.travellers || 1;
  const currency = trip.currency || "INR";
  const userBudget = effectiveBudget(trip);

  const aiActivitiesTotal =
    itinerary && Number.isFinite(itinerary.estimatedTotalCost)
      ? round2(itinerary.estimatedTotalCost)
      : null;

  const guideline = userBudget
    ? Object.fromEntries(
        Object.entries(ALLOCATION).map(([k, pct]) => [k, round2(userBudget * pct)])
      )
    : null;

  return {
    currency,
    days,
    travellers,
    userBudget: { amount: userBudget, label: "user-set total budget", type: "user-set" },
    estimatedActivitiesCost:
      aiActivitiesTotal == null
        ? { amount: null, note: "No itinerary generated yet.", type: "ai-estimated" }
        : {
            amount: aiActivitiesTotal,
            perDay: round2(aiActivitiesTotal / days),
            perPerson: round2(aiActivitiesTotal / travellers),
            label: "estimated activity + food cost from the itinerary",
            type: "ai-estimated",
          },
    remainingAgainstBudget:
      userBudget && aiActivitiesTotal != null
        ? {
            amount: round2(userBudget - aiActivitiesTotal),
            overBudget: aiActivitiesTotal > userBudget,
            note: "User budget minus the itinerary's estimated activity cost.",
          }
        : null,
    allocationGuideline: guideline
      ? { ...guideline, type: "guideline", note: "Generic allocation of your total budget — a rough guide, not verified or personalised." }
      : null,
    disclaimer:
      "All amounts are estimates. Activity costs come from AI suggestions; the allocation guideline is a generic rule of thumb. Verify real prices before booking.",
  };
};

/* ------------------------------------------------------------------ */
/*  Full breakdown (dashboard)                                         */
/* ------------------------------------------------------------------ */
const nonNeg = (n) => Math.max(0, Number(n) || 0);

/**
 * Build budget line items from a saved itinerary (activities + food costs).
 * Used to seed a new budget so it reflects the plan the user already generated.
 */
export const buildSeedItems = (itinerary) => {
  if (!itinerary?.days?.length) return [];
  const items = [];
  for (const d of itinerary.days) {
    for (const slot of ["morning", "afternoon", "evening"]) {
      const a = d[slot];
      if (a?.name && nonNeg(a.estimatedCost) > 0) {
        items.push({ category: "activities", label: a.name, amount: round2(a.estimatedCost), date: d.date, source: "itinerary" });
      }
    }
    for (const f of d.food || []) {
      if (f?.name && nonNeg(f.estimatedCost) > 0) {
        items.push({ category: "food", label: f.name, amount: round2(f.estimatedCost), date: d.date, source: "itinerary" });
      }
    }
  }
  return items;
};

/**
 * Deterministic category + daily + total breakdown for a trip's budget items.
 *
 * @param {object} opts
 * @param {object} opts.trip        - trip (dates, travellers, budget, currency)
 * @param {Array}  opts.items       - budget items [{category, amount, date, ...}]
 * @param {object|null} [opts.conversion] - optional display-currency conversion:
 *        { available:true, to, rate, provider, date } or { available:false, to, note }
 * @returns {object} fully-computed summary (never trusts item-provided totals)
 */
export const summarize = ({ trip, items = [], conversion = null }) => {
  const currency = trip.currency || "INR";
  const travellers = trip.travellers || 1;
  const days = dayCount(trip.startDate, trip.endDate);

  const categoryTotals = Object.fromEntries(BUDGET_CATEGORIES.map((c) => [c, 0]));
  const dailyMap = new Map();
  let total = 0;

  for (const it of items) {
    const amt = round2(nonNeg(it.amount));
    categoryTotals[it.category] = round2((categoryTotals[it.category] || 0) + amt);
    total = round2(total + amt);
    const key = it.date ? new Date(it.date).toISOString().slice(0, 10) : "unscheduled";
    dailyMap.set(key, round2((dailyMap.get(key) || 0) + amt));
  }

  const dailyTotals = [...dailyMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, amount]) => ({ date, amount }));

  const userBudget = nonNeg(effectiveBudget(trip));
  const remaining = userBudget ? round2(userBudget - total) : null;

  const base = {
    currency,
    days,
    travellers,
    totalEstimatedCost: total,
    categoryTotals,
    categoryList: BUDGET_CATEGORIES.map((category) => ({
      category,
      total: categoryTotals[category],
      pct: total ? round2((categoryTotals[category] / total) * 100) : 0,
    })),
    dailyTotals,
    perDay: round2(total / days),
    perPerson: round2(total / travellers),
    budget: userBudget || null,
    budgetType: trip.budgetType === "per_person" ? "per_person" : "total",
    remaining,
    overBudget: remaining != null && remaining < 0,
    assumptions: [
      "All amounts are user- or AI-estimated, not booked or quoted prices.",
      "Totals are computed deterministically in JavaScript (not by the AI).",
    ],
  };

  if (!conversion) return base;

  if (!conversion.available) {
    return {
      ...base,
      conversion: { available: false, requested: conversion.to, note: conversion.note },
    };
  }

  const r = conversion.rate;
  const conv = (n) => (n == null ? null : round2(n * r));
  return {
    ...base,
    converted: {
      currency: conversion.to,
      totalEstimatedCost: conv(total),
      categoryTotals: Object.fromEntries(
        Object.entries(categoryTotals).map(([k, v]) => [k, conv(v)])
      ),
      perDay: conv(base.perDay),
      perPerson: conv(base.perPerson),
      budget: conv(base.budget),
      remaining: conv(base.remaining),
    },
    conversion: {
      available: true,
      from: currency,
      to: conversion.to,
      rate: r,
      provider: conversion.provider,
      asOf: conversion.date,
      disclaimer:
        `Converted at 1 ${currency} = ${r} ${conversion.to}` +
        `${conversion.date ? ` (as of ${conversion.date})` : ""} via ${conversion.provider}. ` +
        "Indicative mid-market rate; your bank or card rate will differ.",
    },
  };
};

export { BUDGET_CATEGORIES };
export default { calculateBudget, summarize, buildSeedItems, BUDGET_CATEGORIES };
