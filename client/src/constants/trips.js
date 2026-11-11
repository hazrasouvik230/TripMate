/**
 * Shared trip option sets — kept in sync with the backend enums in
 * server/src/models/Trip.js. Used by the form, cards, and detail page.
 */

export const TRAVEL_STYLES = [
  { value: "budget", label: "Budget" },
  { value: "balanced", label: "Balanced" },
  { value: "comfort", label: "Comfort" },
  { value: "luxury", label: "Luxury" },
];

export const TRAVEL_PACES = [
  { value: "relaxed", label: "Relaxed" },
  { value: "moderate", label: "Moderate" },
  { value: "fast", label: "Fast-paced" },
];

export const TRIP_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "planned", label: "Planned" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// How a trip's budget figure should be interpreted. Only meaningful when there
// is more than one traveller; a single-traveller trip is always "total".
export const BUDGET_TYPES = [
  { value: "total", label: "Overall (whole trip)" },
  { value: "per_person", label: "Per head (per traveller)" },
];

// Tailwind classes per status for badges.
export const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200",
  planned: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  ongoing: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "INR",
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "SGD",
  "AED",
];

// A curated set of interests; the form also accepts free-form entries.
export const INTEREST_OPTIONS = [
  "Food & Dining",
  "Nature",
  "Beaches",
  "Museums",
  "Nightlife",
  "Shopping",
  "Adventure",
  "History",
  "Art & Culture",
  "Wildlife",
  "Relaxation",
  "Photography",
];

export const labelFor = (list, value) =>
  list.find((o) => o.value === value)?.label ?? value;
