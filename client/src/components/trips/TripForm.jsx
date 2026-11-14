import { useRef, useState, useEffect } from "react";
import {
  MapPin,
  Calendar,
  Wallet,
  Sparkles,
  Loader2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Plane,
} from "lucide-react";
import {
  TRAVEL_STYLES,
  TRAVEL_PACES,
  TRIP_STATUSES,
  BUDGET_TYPES,
  INTEREST_OPTIONS,
} from "../../constants/trips";

// All trips are denominated in Indian Rupees.
const TRIP_CURRENCY = "INR";
import { toDateInput } from "../../utils/format";
import { suggestInterests } from "../../services/ai";
import DatePicker from "../ui/DatePicker";
import Select from "../ui/Select";

/* ------------------------------------------------------------------ */
/*  Step definitions                                                  */
/* ------------------------------------------------------------------ */
const STEPS = [
  { id: "route", title: "Route", icon: Plane, fields: ["origin", "stopover", "destination"] },
  {
    id: "dates",
    title: "Dates & Travellers",
    icon: Calendar,
    fields: ["startDate", "endDate", "travellers", "composition"],
  },
  { id: "budget", title: "Budget", icon: Wallet, fields: ["budget", "budgetType", "status"] },
  {
    id: "prefs",
    title: "Preferences",
    icon: Sparkles,
    fields: ["interests", "travelStyle", "travelPace"],
  },
];

// Traveller breakdown: age group → gender → count.
const EMPTY_COMPOSITION = {
  adults: { male: 0, female: 0, other: 0 },
  children: { male: 0, female: 0, other: 0 },
};

// Age groups and genders used to render the breakdown grid.
const COMPOSITION_GROUPS = [
  { key: "adults", label: "Adults" },
  { key: "children", label: "Children" },
];
const COMPOSITION_GENDERS = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "other", label: "Other" },
];

// Sum of every count in a composition object.
const compositionTotal = (c) =>
  COMPOSITION_GROUPS.reduce(
    (sum, g) =>
      sum +
      COMPOSITION_GENDERS.reduce(
        (s, gn) => s + (Number(c?.[g.key]?.[gn.key]) || 0),
        0
      ),
    0
  );

const EMPTY = {
  origin: "",
  stopover: "",
  destination: "",
  startDate: "",
  endDate: "",
  travellers: 1,
  composition: EMPTY_COMPOSITION,
  budget: "",
  budgetType: "total",
  currency: TRIP_CURRENCY,
  interests: [],
  travelStyle: "balanced",
  travelPace: "moderate",
  status: "draft",
};

/* ------------------------------------------------------------------ */
/*  Per-step client validation                                        */
/* ------------------------------------------------------------------ */
const validateStep = (stepId, form) => {
  const errors = {};
  if (stepId === "route") {
    if (!form.origin.trim()) errors.origin = "Origin is required";
    else if (form.origin.trim().length > 120)
      errors.origin = "Origin cannot exceed 120 characters";
    if (form.stopover && form.stopover.trim().length > 120)
      errors.stopover = "Stopover cannot exceed 120 characters";
    if (!form.destination.trim())
      errors.destination = "Destination is required";
    else if (form.destination.trim().length > 120)
      errors.destination = "Destination cannot exceed 120 characters";
  }
  if (stepId === "dates") {
    if (!form.startDate) errors.startDate = "Start date is required";
    if (!form.endDate) errors.endDate = "End date is required";
    if (
      form.startDate &&
      form.endDate &&
      new Date(form.endDate) < new Date(form.startDate)
    )
      errors.endDate = "End date cannot be earlier than start date";
    const total = compositionTotal(form.composition);
    if (total < 1)
      errors.composition = "Add at least 1 traveller to the breakdown";
    else if (total > 50) errors.composition = "Cannot exceed 50 travellers";
  }
  if (stepId === "budget") {
    if (form.budget !== "" && Number(form.budget) < 0)
      errors.budget = "Budget cannot be negative";
  }
  return errors;
};

/** Build the API payload, omitting empty optional fields. */
const buildPayload = (form) => {
  const payload = {
    origin: form.origin.trim(),
    destination: form.destination.trim(),
    startDate: form.startDate,
    endDate: form.endDate,
    travellers: compositionTotal(form.composition),
    composition: {
      adults: { ...form.composition.adults },
      children: { ...form.composition.children },
    },
    // Currency is fixed to INR for every trip.
    currency: TRIP_CURRENCY,
    interests: form.interests,
    travelStyle: form.travelStyle,
    travelPace: form.travelPace,
    status: form.status,
  };
  if (form.stopover.trim()) payload.stopover = form.stopover.trim();
  if (form.budget !== "" && form.budget != null) {
    payload.budget = Number(form.budget);
    // "Per head" only makes sense with more than one traveller; otherwise the
    // budget is always the overall figure.
    payload.budgetType =
      compositionTotal(form.composition) > 1 ? form.budgetType : "total";
  }
  return payload;
};

/* ------------------------------------------------------------------ */
/*  Small presentational field helpers                                */
/* ------------------------------------------------------------------ */
const Field = ({ label, error, children, htmlFor }) => (
  <div>
    <label
      htmlFor={htmlFor}
      className="block text-sm font-medium text-slate-700 mb-1.5 dark:text-slate-300"
    >
      {label}
    </label>
    {children}
    {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
  </div>
);

// Today's date as a `yyyy-mm-dd` string in the user's local timezone, used as
// the `min` for the date pickers so past days render visible-but-disabled.
const todayISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const inputClass = (error) =>
  `w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-slate-100 dark:placeholder-slate-500 ${
    error
      ? "border-red-400 bg-red-50 dark:border-red-500/50 dark:bg-red-500/10"
      : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800"
  }`;

/* ------------------------------------------------------------------ */
/*  TripForm                                                          */
/* ------------------------------------------------------------------ */
/**
 * Multi-step trip form used by both create and edit flows.
 *
 * @param {object}   initialValues  - Trip to prefill (edit mode)
 * @param {function} onSubmit       - async (payload) => void; may throw
 * @param {string}   submitLabel    - Label for the final submit button
 * @param {function} onCancel       - Optional cancel handler
 */
const TripForm = ({
  initialValues = null,
  onSubmit,
  submitLabel = "Save trip",
  onCancel,
}) => {
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    ...(initialValues
      ? {
          origin: initialValues.origin || "",
          stopover: initialValues.stopover || "",
          destination: initialValues.destination || "",
          startDate: toDateInput(initialValues.startDate),
          endDate: toDateInput(initialValues.endDate),
          travellers: initialValues.travellers ?? 1,
          composition: {
            adults: {
              male: initialValues.composition?.adults?.male ?? 0,
              female: initialValues.composition?.adults?.female ?? 0,
              other: initialValues.composition?.adults?.other ?? 0,
            },
            children: {
              male: initialValues.composition?.children?.male ?? 0,
              female: initialValues.composition?.children?.female ?? 0,
              other: initialValues.composition?.children?.other ?? 0,
            },
          },
          budget: initialValues.budget ?? "",
          budgetType: initialValues.budgetType || "total",
          currency: TRIP_CURRENCY,
          interests: initialValues.interests || [],
          travelStyle: initialValues.travelStyle || "balanced",
          travelPace: initialValues.travelPace || "moderate",
          status: initialValues.status || "draft",
        }
      : {}),
  }));

  const [step, setStep] = useState(0);
  // Timestamp (ms) of the moment we advanced onto the final step. Used to
  // ignore an accidental double-click on "Next" that would otherwise land on
  // the freshly-rendered "Create trip" submit button at the same position.
  const reachedLastStepAt = useRef(0);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Destination-aware interest options (fall back to the static list).
  const [interestOptions, setInterestOptions] = useState(INTEREST_OPTIONS);
  const [loadingInterests, setLoadingInterests] = useState(false);
  // Which "destination|stopover" we've already fetched for (avoid refetching).
  const fetchedInterestsFor = useRef("");

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  // Traveller count is derived from the breakdown table (no separate input).
  const travellersCount = compositionTotal(form.composition);

  // Fetch interest suggestions tailored to the destination (+ stopover) when
  // the user reaches the Preferences step. Best-effort: on any failure (e.g.
  // AI not configured) we keep the static list.
  useEffect(() => {
    if (current.id !== "prefs") return;
    const destination = form.destination.trim();
    if (!destination) return;

    const stopover = form.stopover.trim();
    const key = `${destination.toLowerCase()}|${stopover.toLowerCase()}`;
    if (fetchedInterestsFor.current === key) return;
    fetchedInterestsFor.current = key;

    let cancelled = false;
    setLoadingInterests(true);
    suggestInterests(destination, stopover || undefined)
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.interests) ? res.interests.filter(Boolean) : [];
        setInterestOptions(list.length ? list : INTEREST_OPTIONS);
      })
      .catch(() => {
        if (!cancelled) setInterestOptions(INTEREST_OPTIONS);
      })
      .finally(() => {
        if (!cancelled) setLoadingInterests(false);
      });

    return () => {
      cancelled = true;
    };
  }, [current.id, form.destination, form.stopover]);

  // Always show already-selected interests even if they're not in the
  // suggested set (e.g. custom tags or edit-mode values).
  const shownInterests = [
    ...interestOptions,
    ...form.interests.filter((i) => !interestOptions.includes(i)),
  ];

  const update = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
    setServerError("");
  };

  const updateComposition = (group, gender, value) => {
    const n = value === "" ? 0 : Math.max(0, Math.floor(Number(value)) || 0);
    setForm((prev) => ({
      ...prev,
      composition: {
        ...prev.composition,
        [group]: { ...prev.composition[group], [gender]: n },
      },
    }));
    setErrors((prev) => ({ ...prev, composition: "" }));
    setServerError("");
  };

  const toggleInterest = (value) => {
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(value)
        ? prev.interests.filter((i) => i !== value)
        : [...prev.interests, value],
    }));
  };

  const goNext = () => {
    const stepErrors = validateStep(current.id, form);
    if (Object.keys(stepErrors).length) {
      setErrors(stepErrors);
      return;
    }
    const next = Math.min(step + 1, STEPS.length - 1);
    if (next === STEPS.length - 1) reachedLastStepAt.current = Date.now();
    setStep(next);
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Guard against an accidental double-click on "Next": the first click
    // advances to the final step, and if a second click (or the tail of a
    // double-click) immediately hits the newly-rendered "Create trip" button
    // in the same spot, the form would submit with incomplete preferences.
    // Ignore any submit that arrives right after reaching the final step.
    if (Date.now() - reachedLastStepAt.current < 600) return;

    // Validate every step before final submit.
    const allErrors = STEPS.reduce(
      (acc, s) => ({ ...acc, ...validateStep(s.id, form) }),
      {}
    );
    if (Object.keys(allErrors).length) {
      setErrors(allErrors);
      // Jump to the first step with an error.
      const firstBad = STEPS.findIndex((s) =>
        s.fields.some((f) => allErrors[f])
      );
      if (firstBad !== -1) setStep(firstBad);
      return;
    }

    setSubmitting(true);
    setServerError("");
    try {
      await onSubmit(buildPayload(form));
    } catch (err) {
      // Surface backend field errors and jump to the relevant step.
      if (err.errors?.length) {
        const fe = {};
        err.errors.forEach((e) => {
          if (e.field) fe[e.field] = e.message;
        });
        setErrors(fe);
        const firstBad = STEPS.findIndex((s) =>
          s.fields.some((f) => fe[f])
        );
        if (firstBad !== -1) setStep(firstBad);
      }
      setServerError(err.message || "Failed to save trip");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* ---- Step indicator (horizontal, top) — tablet & below ---- */}
      <ol className="flex items-center lg:hidden">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <li key={s.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition ${
                    active
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : done
                        ? "border-indigo-600 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
                        : "border-slate-300 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                  }`}
                >
                  {done ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={`hidden sm:block text-xs font-medium ${
                    active ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {s.title}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 mb-5 sm:mb-5 ${
                    done ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* ---- Two-column body: steps (left) + form (right) ---- */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* ---- Step indicator (vertical, left) — desktop only ---- */}
        <ol className="hidden lg:flex lg:flex-col shrink-0 lg:w-52">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            const notLast = i < STEPS.length - 1;
            return (
              <li key={s.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition shrink-0 ${
                      active
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : done
                          ? "border-indigo-600 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
                          : "border-slate-300 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                    }`}
                  >
                    {done ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  {notLast && (
                    <div
                      className={`w-0.5 flex-1 min-h-[1.75rem] my-1.5 ${
                        done ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
                      }`}
                    />
                  )}
                </div>
                <span
                  className={`text-sm font-medium pt-2.5 ${notLast ? "pb-6" : ""} ${
                    active
                      ? "text-indigo-600 dark:text-indigo-400"
                      : done
                        ? "text-slate-700 dark:text-slate-300"
                        : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {s.title}
                </span>
              </li>
            );
          })}
        </ol>

        {/* ---- Right column: server error + step panels ---- */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* ---- Server error ---- */}
          {serverError && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          {/* ---- Step panels ---- */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 min-h-[320px] dark:bg-slate-900 dark:border-slate-800">
        {/* Step 1 — Route */}
        {current.id === "route" && (
          <div className="space-y-5">
            <Field label="Origin" htmlFor="origin" error={errors.origin}>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="origin"
                  type="text"
                  value={form.origin}
                  onChange={(e) => update("origin", e.target.value)}
                  placeholder="e.g. London"
                  className={inputClass(errors.origin).replace("px-4", "pl-11 pr-4")}
                />
              </div>
            </Field>
            <Field
              label="Halt / Stopover (optional)"
              htmlFor="stopover"
              error={errors.stopover}
            >
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="stopover"
                  type="text"
                  value={form.stopover}
                  onChange={(e) => update("stopover", e.target.value)}
                  placeholder="e.g. Hyderabad"
                  className={inputClass(errors.stopover).replace("px-4", "pl-11 pr-4")}
                />
              </div>
            </Field>
            <Field
              label="Destination"
              htmlFor="destination"
              error={errors.destination}
            >
              <div className="relative">
                <Plane className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="destination"
                  type="text"
                  value={form.destination}
                  onChange={(e) => update("destination", e.target.value)}
                  placeholder="e.g. Tokyo, Japan"
                  className={inputClass(errors.destination).replace(
                    "px-4",
                    "pl-11 pr-4"
                  )}
                />
              </div>
            </Field>
          </div>
        )}

        {/* Step 2 — Dates & travellers */}
        {current.id === "dates" && (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-5">
              <Field label="Start date" htmlFor="startDate" error={errors.startDate}>
                <DatePicker
                  id="startDate"
                  min={todayISO()}
                  value={form.startDate}
                  onChange={(v) => update("startDate", v)}
                  error={errors.startDate}
                />
              </Field>
              <Field label="End date" htmlFor="endDate" error={errors.endDate}>
                <DatePicker
                  id="endDate"
                  min={form.startDate || todayISO()}
                  value={form.endDate}
                  onChange={(v) => update("endDate", v)}
                  error={errors.endDate}
                />
              </Field>
            </div>
            {/* Traveller breakdown by age group & gender */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Traveller breakdown
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {travellersCount} traveller{travellersCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="grid grid-cols-4 bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <div className="px-3 py-2" />
                  {COMPOSITION_GENDERS.map((gn) => (
                    <div key={gn.key} className="px-3 py-2 text-center">
                      {gn.label}
                    </div>
                  ))}
                </div>
                {COMPOSITION_GROUPS.map((g) => (
                  <div
                    key={g.key}
                    className="grid grid-cols-4 items-center border-t border-slate-200 dark:border-slate-700"
                  >
                    <div className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                      {g.label}
                    </div>
                    {COMPOSITION_GENDERS.map((gn) => (
                      <div key={gn.key} className="p-1.5">
                        <label
                          className="sr-only"
                          htmlFor={`comp-${g.key}-${gn.key}`}
                        >
                          {`${g.label} ${gn.label}`}
                        </label>
                        <input
                          id={`comp-${g.key}-${gn.key}`}
                          type="number"
                          min={0}
                          max={50}
                          value={form.composition[g.key][gn.key]}
                          onChange={(e) =>
                            updateComposition(g.key, gn.key, e.target.value)
                          }
                          className="w-full px-2 py-2 rounded-lg border text-sm text-center outline-none transition focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {errors.composition && (
                <p className="text-red-500 text-xs mt-1.5">{errors.composition}</p>
              )}
            </div>
          </div>
        )}

        {/* Step 3 — Budget */}
        {current.id === "budget" && (
          <div className="space-y-5">
            <Field label="Budget (optional)" htmlFor="budget" error={errors.budget}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium pointer-events-none">
                  ₹
                </span>
                <input
                  id="budget"
                  type="number"
                  min={0}
                  value={form.budget}
                  onChange={(e) => update("budget", e.target.value)}
                  placeholder="e.g. 40000"
                  className={`${inputClass(errors.budget).replace(
                    "px-4",
                    "pl-9 pr-16"
                  )}`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 pointer-events-none">
                  INR
                </span>
              </div>
            </Field>

            {/* Budget interpretation — only relevant with 2+ travellers. */}
            {travellersCount > 1 && (
              <Field label="Is this budget per head or overall?">
                <div className="grid grid-cols-2 gap-3">
                  {BUDGET_TYPES.map((bt) => {
                    const selected = form.budgetType === bt.value;
                    return (
                      <button
                        key={bt.value}
                        type="button"
                        onClick={() => update("budgetType", bt.value)}
                        className={`px-4 py-3 rounded-xl border text-sm font-medium text-left transition cursor-pointer ${
                          selected
                            ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500"
                            : "border-slate-300 bg-white text-slate-600 hover:border-indigo-400 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:border-indigo-500"
                        }`}
                      >
                        {bt.label}
                      </button>
                    );
                  })}
                </div>
                {form.budget !== "" && Number(form.budget) > 0 && (
                  <p className="text-xs text-slate-500 mt-2 dark:text-slate-400">
                    {form.budgetType === "per_person" ? (
                      <>
                        ₹{Number(form.budget).toLocaleString("en-IN")} × {travellersCount} travellers ={" "}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          ₹{(Number(form.budget) * travellersCount).toLocaleString("en-IN")} total
                        </span>
                      </>
                    ) : (
                      <>
                        ₹{Number(form.budget).toLocaleString("en-IN")} for the whole trip (
                        ≈ ₹{Math.round(Number(form.budget) / travellersCount).toLocaleString("en-IN")} per head)
                      </>
                    )}
                  </p>
                )}
              </Field>
            )}

            <Field label="Status" htmlFor="status" error={errors.status}>
              <Select
                id="status"
                value={form.status}
                onChange={(v) => update("status", v)}
                options={TRIP_STATUSES}
                error={errors.status}
              />
            </Field>
          </div>
        )}

        {/* Step 4 — Preferences */}
        {current.id === "prefs" && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Interests
                </span>
                {loadingInterests && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Tailoring to {form.destination.trim() || "your destination"}…
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {shownInterests.map((i) => {
                  const selected = form.interests.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleInterest(i)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition cursor-pointer ${
                        selected
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:border-indigo-500"
                      }`}
                    >
                      {i}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <Field label="Travel style" htmlFor="travelStyle">
                <Select
                  id="travelStyle"
                  value={form.travelStyle}
                  onChange={(v) => update("travelStyle", v)}
                  options={TRAVEL_STYLES}
                />
              </Field>
              <Field label="Preferred pace" htmlFor="travelPace">
                <Select
                  id="travelPace"
                  value={form.travelPace}
                  onChange={(v) => update("travelPace", v)}
                  options={TRAVEL_PACES}
                />
              </Field>
            </div>
          </div>
        )}
          </div>
        </div>
      </div>

      {/* ---- Navigation (full-width, bottom) ---- */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-6 dark:border-slate-800">
        <div>
          {step > 0 ? (
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer dark:text-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            )
          )}
        </div>

        {isLast ? (
          <button
            key="submit"
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition cursor-pointer disabled:bg-indigo-400 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {submitting ? "Saving…" : submitLabel}
          </button>
        ) : (
          <button
            key="next"
            type="button"
            onClick={goNext}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition cursor-pointer"
          >
            Next <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </form>
  );
};

export default TripForm;
