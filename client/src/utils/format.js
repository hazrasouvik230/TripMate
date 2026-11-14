/**
 * Formatting helpers for trip data.
 */

const DATE_FMT = { year: "numeric", month: "short", day: "numeric" };
const TIME_FMT = { hour: "2-digit", minute: "2-digit" };

export const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, DATE_FMT);
};

/** Locale-aware time of day (e.g. "11:58 PM"). */
export const formatTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString(undefined, TIME_FMT);
};

export const formatRange = (start, end) =>
  `${formatDate(start)} → ${formatDate(end)}`;

/** Inclusive day count between two dates. */
export const tripDuration = (start, end) => {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.round(ms / 86_400_000) + 1;
};

export const formatMoney = (amount, currency = "USD") => {
  if (amount == null || amount === "") return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(amount));
  } catch {
    return `${currency} ${Number(amount).toLocaleString()}`;
  }
};

/** Convert an ISO datetime to the yyyy-mm-dd a <input type="date"> expects. */
export const toDateInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
