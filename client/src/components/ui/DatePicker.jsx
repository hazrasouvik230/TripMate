import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Custom, theme-aware date picker that replaces the native
 * `<input type="date">`. Values are plain `yyyy-mm-dd` strings (same shape the
 * form and API already use), displayed to the user as `dd-mm-yyyy`.
 *
 * Days outside the `min`/`max` range are rendered but disabled, so past dates
 * stay visible while remaining non-selectable.
 *
 * @param {string}   id          - Associates the trigger with a <label>
 * @param {string}   value       - Selected date as `yyyy-mm-dd` ("" when empty)
 * @param {function} onChange    - Called with the new `yyyy-mm-dd` string
 * @param {string}   [min]       - Earliest selectable date (`yyyy-mm-dd`)
 * @param {string}   [max]       - Latest selectable date (`yyyy-mm-dd`)
 * @param {string}   [error]     - Validation message (changes border styling)
 * @param {string}   [placeholder]
 */

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad = (n) => String(n).padStart(2, "0");

/** Local-timezone `yyyy-mm-dd` (avoids the UTC off-by-one of toISOString). */
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Parse `yyyy-mm-dd` into a local Date at midnight, or null. */
const parseISO = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDisplay = (s) => {
  const d = parseISO(s);
  return d ? `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}` : "";
};

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const DatePicker = ({
  id,
  value,
  onChange,
  min,
  max,
  error,
  placeholder = "dd-mm-yyyy",
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const selected = useMemo(() => parseISO(value), [value]);
  const minDate = useMemo(() => parseISO(min), [min]);
  const maxDate = useMemo(() => parseISO(max), [max]);
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  // Which month the grid is showing. Defaults to the selected date, the min
  // bound, or the current month.
  const [viewDate, setViewDate] = useState(
    () => selected || minDate || today
  );

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openPicker = () => {
    setViewDate(selected || minDate || today);
    setOpen((o) => !o);
  };

  const isDisabled = (d) =>
    (minDate && d < minDate) || (maxDate && d > maxDate);

  const selectDay = (d) => {
    if (isDisabled(d)) return;
    onChange(toISO(d));
    setOpen(false);
  };

  const goMonth = (delta) =>
    setViewDate((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  // Build a 6-row (42 cell) grid starting on the Sunday on/before the 1st.
  const days = useMemo(() => {
    const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const gridStart = new Date(monthStart);
    gridStart.setDate(1 - monthStart.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [viewDate]);

  const triggerClass = `flex w-full items-center gap-2 px-4 py-2.5 rounded-xl border text-sm text-left outline-none transition cursor-pointer focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
    error
      ? "border-red-400 bg-red-50 dark:border-red-500/50 dark:bg-red-500/10"
      : "border-slate-300 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
  } ${open ? "ring-2 ring-indigo-500/20 border-indigo-500" : ""}`;

  const display = formatDisplay(value);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        id={id}
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={triggerClass}
      >
        <span
          className={`flex-1 ${
            display
              ? "text-slate-900 dark:text-slate-100"
              : "text-slate-400 dark:text-slate-500"
          }`}
        >
          {display || placeholder}
        </span>
        <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose date"
          className="absolute z-50 mt-2 w-72 p-3 rounded-2xl border border-slate-200 bg-white shadow-xl animate-[fadeIn_0.12s_ease-out] dark:border-slate-700 dark:bg-slate-900"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                aria-label="Previous month"
                className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => goMonth(1)}
                aria-label="Next month"
                className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="text-center text-[11px] font-semibold text-slate-400 py-1 dark:text-slate-500"
              >
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((d) => {
              const inMonth = d.getMonth() === viewDate.getMonth();
              const disabled = isDisabled(d);
              const isSelected = selected && sameDay(d, selected);
              const isToday = sameDay(d, today);

              let cls =
                "flex items-center justify-center h-9 w-full rounded-lg text-sm transition cursor-pointer ";
              if (disabled) {
                cls +=
                  "text-slate-300 line-through cursor-not-allowed dark:text-slate-600";
              } else if (isSelected) {
                cls += "bg-indigo-600 text-white font-semibold hover:bg-indigo-500";
              } else if (inMonth) {
                cls +=
                  "text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 dark:text-slate-200 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300";
              } else {
                cls +=
                  "text-slate-400 hover:bg-slate-100 dark:text-slate-600 dark:hover:bg-slate-800";
              }
              if (isToday && !isSelected) {
                cls += " ring-1 ring-inset ring-indigo-400/60";
              }

              return (
                <button
                  type="button"
                  key={d.toISOString()}
                  disabled={disabled}
                  onClick={() => selectDay(d)}
                  className={cls}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition cursor-pointer dark:text-slate-400 dark:hover:text-slate-200"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => selectDay(today)}
              disabled={isDisabled(today)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 transition cursor-pointer disabled:text-slate-300 disabled:cursor-not-allowed dark:text-indigo-400 dark:disabled:text-slate-600"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePicker;
