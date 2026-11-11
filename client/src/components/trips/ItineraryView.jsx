import { useState, useEffect } from "react";
import {
  Sun,
  CloudSun,
  Moon,
  Utensils,
  Bus,
  BedDouble,
  Lightbulb,
  Clock,
  Wallet,
  Info,
  AlertTriangle,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { formatDate, formatMoney } from "../../utils/format";

// Wraps freshly-revealed content so it fades + slides in on mount.
const Reveal = ({ children }) => {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      className={`transition-all duration-500 ease-out ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      }`}
    >
      {children}
    </div>
  );
};

const durationLabel = (min) => {
  if (!min || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}h` : null, m ? `${m}m` : null].filter(Boolean).join(" ");
};

const SLOTS = [
  { key: "morning", label: "Morning", icon: Sun, tint: "text-amber-500" },
  { key: "afternoon", label: "Afternoon", icon: CloudSun, tint: "text-orange-500" },
  { key: "evening", label: "Evening", icon: Moon, tint: "text-indigo-500" },
];

const IconBtn = ({ onClick, title, disabled, children, danger }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    className={`p-1.5 rounded-lg transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
      danger
        ? "text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10"
        : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-500/10"
    }`}
  >
    {children}
  </button>
);

const ActivityRow = ({ slot, slotIndex, activity, currency, edit }) => {
  if (!activity?.name) {
    if (!edit) return null;
    // Editable empty slot placeholder (after a deletion).
    return (
      <div className="flex items-center gap-3 text-sm text-slate-400">
        <div className="shrink-0">
          <slot.icon className="w-5 h-5 opacity-40" />
        </div>
        <span className="italic">No {slot.label.toLowerCase()} activity</span>
      </div>
    );
  }
  const Icon = slot.icon;
  const dur = durationLabel(activity.durationMinutes);
  const cost = formatMoney(activity.estimatedCost, currency);

  return (
    <div className="flex gap-3">
      <div className={`shrink-0 mt-0.5 ${slot.tint}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {slot.label}
          </p>
          {edit && (
            <div className="flex items-center -mt-1">
              <IconBtn
                title="Move earlier"
                disabled={edit.busy || slotIndex === 0}
                onClick={() => edit.onMove(slot.key, "up")}
              >
                <ChevronUp className="w-4 h-4" />
              </IconBtn>
              <IconBtn
                title="Move later"
                disabled={edit.busy || slotIndex === SLOTS.length - 1}
                onClick={() => edit.onMove(slot.key, "down")}
              >
                <ChevronDown className="w-4 h-4" />
              </IconBtn>
              <IconBtn title="Edit" disabled={edit.busy} onClick={() => edit.onEdit(slot.key)}>
                <Pencil className="w-4 h-4" />
              </IconBtn>
              <IconBtn title="Delete" danger disabled={edit.busy} onClick={() => edit.onDelete(slot.key)}>
                <Trash2 className="w-4 h-4" />
              </IconBtn>
            </div>
          )}
        </div>
        <p className="font-semibold text-slate-900 dark:text-slate-100">{activity.name}</p>
        {activity.description && (
          <p className="text-sm text-slate-600 mt-0.5 dark:text-slate-400">{activity.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
          {dur && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {dur}
            </span>
          )}
          {cost && (
            <span className="inline-flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5" /> {cost} <span className="text-slate-400">est.</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const DayCard = ({ day, currency, editable, handlers, regenerating, busy }) => (
  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden dark:bg-slate-900 dark:border-slate-800">
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40">
      <div>
        <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">
          Day {day.dayNumber}
        </span>
        <span className="text-xs text-slate-400 ml-2">{formatDate(day.date)}</span>
      </div>
      <div className="flex items-center gap-3">
        {formatMoney(day.estimatedDayCost, currency) && (
          <span className="text-xs font-medium text-slate-500">
            ~{formatMoney(day.estimatedDayCost, currency)}
          </span>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => handlers.onRegenerateDay(day.dayNumber)}
            disabled={busy || regenerating}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {regenerating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {regenerating ? "Regenerating…" : "Regenerate day"}
          </button>
        )}
      </div>
    </div>

    <div className="p-5 space-y-5 relative">
      {regenerating && (
        <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-[1px] z-10 rounded-b-2xl" />
      )}
      {day.summary && <p className="text-sm text-slate-600 italic dark:text-slate-400">{day.summary}</p>}

      <div className="space-y-4">
        {SLOTS.map((slot, i) => (
          <ActivityRow
            key={slot.key}
            slot={slot}
            slotIndex={i}
            activity={day[slot.key]}
            currency={currency}
            edit={
              editable
                ? {
                    busy,
                    onEdit: (k) => handlers.onEditActivity(day.dayNumber, k),
                    onMove: (k, dir) => handlers.onMoveActivity(day.dayNumber, k, dir),
                    onDelete: (k) => handlers.onDeleteActivity(day.dayNumber, k),
                  }
                : null
            }
          />
        ))}
      </div>

      {day.food?.length > 0 && (
        <div className="pt-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
            <Utensils className="w-3.5 h-3.5" /> Food
          </p>
          <ul className="space-y-1.5">
            {day.food.map((f, i) => (
              <li key={i} className="text-sm text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-800 dark:text-slate-200">{f.name}</span>
                <span className="text-slate-400"> · {f.type}</span>
                {formatMoney(f.estimatedCost, currency) && (
                  <span className="text-slate-400"> · {formatMoney(f.estimatedCost, currency)} est.</span>
                )}
                {f.description && <span className="block text-xs text-slate-500">{f.description}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {day.transportation && (
        <div className="flex gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Bus className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <span>{day.transportation}</span>
        </div>
      )}

      {day.accommodation?.length > 0 && (
        <div className="pt-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
            <BedDouble className="w-3.5 h-3.5" /> Where to stay
          </p>
          <ul className="space-y-1.5">
            {day.accommodation.map((stay, i) => (
              <li key={i} className="text-sm text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {stay.name}
                </span>
                {stay.area && <span className="text-slate-400"> · {stay.area}</span>}
                {stay.type && <span className="text-slate-400"> · {stay.type}</span>}
                {formatMoney(stay.pricePerNight, currency) && (
                  <span className="text-slate-400">
                    {" "}
                    · {formatMoney(stay.pricePerNight, currency)}/night est.
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {day.tips?.length > 0 && (
        <div className="flex gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside dark:text-slate-400">
            {day.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  </div>
);

/**
 * Renders a generated itinerary: disclaimer, totals, and a day-by-day plan.
 * When `editable` + `handlers` are passed, per-activity edit/move/delete and
 * per-day regenerate controls are shown. All prices are labelled as estimates.
 */
const ItineraryView = ({
  itinerary,
  editable = false,
  handlers = {},
  regeneratingDay = null,
  busy = false,
  revealCards = false,
}) => {
  if (!itinerary) return null;
  const {
    days = [],
    currency,
    estimatedTotalCost,
    version,
    notes,
    disclaimer,
    budgetAdvisory,
  } = itinerary;

  return (
    <div className="space-y-5">
      {/* Disclaimer — unverified / estimated */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <span>{disclaimer || "AI-generated suggestions — verify details and prices before booking."}</span>
      </div>

      {/* Totals summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl shadow-sm px-5 py-4 dark:bg-slate-900 dark:border-slate-800">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <Wallet className="w-5 h-5 text-indigo-600" />
          <span className="font-semibold">
            Estimated total: {formatMoney(estimatedTotalCost, currency) || `${estimatedTotalCost} ${currency}`}
          </span>
          <span className="text-xs text-slate-400">(all prices approximate)</span>
        </div>
        <span className="text-xs text-slate-400">
          {days.length} day{days.length === 1 ? "" : "s"}
          {version ? ` · v${version}` : ""}
        </span>
      </div>

      {notes && (
        <div className="flex items-start gap-2 text-sm text-slate-500 px-1">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{notes}</span>
        </div>
      )}

      <div className="space-y-5">
        {days.map((day) => {
          const card = (
            <DayCard
              day={day}
              currency={currency}
              editable={editable}
              handlers={handlers}
              regenerating={regeneratingDay === day.dayNumber}
              busy={busy}
            />
          );
          // During streaming, each day mounts as it arrives and fades in.
          return (
            <div key={day.dayNumber}>
              {revealCards ? <Reveal>{card}</Reveal> : card}
            </div>
          );
        })}
      </div>

      {/* Budget advisory — shown when the realistic plan exceeds the set budget. */}
      {budgetAdvisory && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl px-5 py-4 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200">
          <Wallet className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">Your budget may fall short</p>
            <p className="mt-1">
              This realistic plan is estimated at{" "}
              <span className="font-semibold">
                {formatMoney(budgetAdvisory.estimatedTotalCost, currency) ||
                  `${budgetAdvisory.estimatedTotalCost} ${currency}`}
              </span>
              , which is about{" "}
              <span className="font-semibold">
                {formatMoney(budgetAdvisory.shortfall, currency) ||
                  `${budgetAdvisory.shortfall} ${currency}`}
              </span>{" "}
              over your set budget of{" "}
              {formatMoney(budgetAdvisory.setBudget, currency) ||
                `${budgetAdvisory.setBudget} ${currency}`}
              . For a comfortable trip,               consider a budget of around{" "}
              <span className="font-semibold">
                {formatMoney(budgetAdvisory.recommendedBudget, currency) ||
                  `${budgetAdvisory.recommendedBudget} ${currency}`}
              </span>{" "}
              for the whole party.
            </p>
            {budgetAdvisory.suggestions?.length > 0 && (
              <>
                <p className="mt-2 font-semibold">Ways to stay on budget</p>
                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                  {budgetAdvisory.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ItineraryView;
