import { formatMoney } from "../../utils/format";

/**
 * Lightweight, dependency-free budget charts.
 *
 * These are single-measure charts (amount) where the axis already names each
 * category/day, so per the dataviz method they use ONE hue with direct value
 * labels — not a categorical rainbow. Values are shown as text (identity/
 * magnitude never color-alone), bars have 4px rounded data-ends and sit on a
 * recessive baseline, and each mark has a hover tooltip.
 */

const BAR = "#4f46e5"; // indigo-600 — the app's single brand hue

/* Horizontal bars: amount by category (sorted desc). */
export const CategoryBars = ({ categories, currency }) => {
  const rows = [...categories].sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <ul className="space-y-3" aria-label="Spending by category">
      {rows.map((r) => (
        <li key={r.category}>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{r.label}</span>
            <span className="text-sm text-slate-500">
              {formatMoney(r.total, currency) || `${r.total} ${currency}`}
              <span className="text-slate-400"> · {r.pct}%</span>
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${(r.total / max) * 100}%`, backgroundColor: BAR, minWidth: r.total > 0 ? 6 : 0 }}
              title={`${r.label}: ${formatMoney(r.total, currency) || r.total} (${r.pct}%)`}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

/* Vertical bars: amount by day. */
export const DailyBars = ({ days, currency, className = "" }) => {
  if (!days?.length) return <p className="text-sm text-slate-400">No dated expenses yet.</p>;
  const max = Math.max(1, ...days.map((d) => d.amount));
  const shortDate = (d) => (d === "unscheduled" ? "N/A" : d.slice(5)); // MM-DD

  return (
    <div className={`overflow-x-auto pb-1 flex flex-col ${className}`} aria-label="Spending by day">
      {/* Bars share one baseline (the bottom of this track). Grows to fill a
          taller parent, but never shorter than a readable minimum. */}
      <div className="flex items-end gap-2 flex-1 min-h-[10rem]">
        {days.map((d) => (
          <div key={d.date} className="flex flex-col items-center justify-end gap-1 min-w-[2.5rem] flex-1 h-full">
            <span className="text-[11px] text-slate-500">
              {formatMoney(d.amount, currency)?.replace(/\.00$/, "") || d.amount}
            </span>
            <div
              className="w-full rounded-t-md transition-[height] duration-300"
              style={{ height: `${Math.max(2, (d.amount / max) * 100)}%`, backgroundColor: BAR }}
              title={`${shortDate(d.date)}: ${formatMoney(d.amount, currency) || d.amount}`}
            />
          </div>
        ))}
      </div>
      {/* Date labels in a parallel row so they line up under each bar. */}
      <div className="flex gap-2 mt-1">
        {days.map((d) => (
          <span
            key={d.date}
            className="text-[11px] text-slate-400 whitespace-nowrap text-center min-w-[2.5rem] flex-1"
          >
            {shortDate(d.date)}
          </span>
        ))}
      </div>
    </div>
  );
};
