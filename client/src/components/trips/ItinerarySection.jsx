import { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  RefreshCw,
  Map,
  MessageCircle,
  Lock,
} from "lucide-react";
import {
  getItinerary,
  streamGenerateItinerary,
  streamExtendItinerary,
  updateItinerary,
  regenerateItineraryDay,
} from "../../services/ai";
import { getItineraryQuote, unlockItineraryDays } from "../../services/payments";
import ItineraryView from "./ItineraryView";
import ActivityEditModal from "./ActivityEditModal";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import { formatMoney } from "../../utils/format";

const SLOT_ORDER = ["morning", "afternoon", "evening"];
const SLOT_LABELS = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

// Reduce an itinerary's days to the editable PATCH payload (server owns
// dates/dayNumbers/costs, so we don't send them).
const toEditableDays = (days) =>
  days.map((d) => ({
    dayNumber: d.dayNumber,
    summary: d.summary,
    morning: d.morning || null,
    afternoon: d.afternoon || null,
    evening: d.evening || null,
    food: d.food || [],
    transportation: d.transportation || "",
    accommodation: d.accommodation || [],
    tips: d.tips || [],
  }));

const ItinerarySection = ({ tripId, onOpenAssistant, onTripRefresh }) => {
  const [itinerary, setItinerary] = useState(null);
  const [loading, setLoading] = useState(true); // initial fetch
  const [generating, setGenerating] = useState(false); // full (re)generate
  // Live preview while streaming a fresh plan: { currency, numDays, disclaimer, days[] }
  const [stream, setStream] = useState(null);
  const [regeneratingDay, setRegeneratingDay] = useState(null);
  const [busy, setBusy] = useState(false); // a PATCH is in flight
  const [error, setError] = useState("");
  // Free-text guidance the user gives before (re)generating the whole plan.
  const [instructions, setInstructions] = useState("");

  const [editTarget, setEditTarget] = useState(null); // { dayNumber, slotKey }
  const [confirmTarget, setConfirmTarget] = useState(null); // { dayNumber, slotKey }

  // Unlock quote for trips longer than the free limit + in-flight payment.
  const [quote, setQuote] = useState(null);
  const [unlocking, setUnlocking] = useState(false);

  const { push } = useToast();
  const { user } = useAuth();

  // Scrollable body + "stick to bottom" flag so generation auto-scrolls to
  // follow new content, unless the user has scrolled up to read something.
  const bodyRef = useRef(null);
  const stickRef = useRef(true);
  // Last observed scrollTop — lets us tell a user's upward scroll apart from
  // the programmatic (smooth) auto-scroll, which only ever moves downward.
  const lastScrollTopRef = useRef(0);

  const handleBodyScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    // Scrolling UP is a deliberate user action → detach from the bottom.
    // (The smooth auto-scroll and growing content only increase scrollTop, so
    // they never falsely detach and stall the follow behaviour.)
    const userScrolledUp = el.scrollTop < lastScrollTopRef.current - 2;
    if (atBottom) stickRef.current = true;
    else if (userScrolledUp) stickRef.current = false;
    lastScrollTopRef.current = el.scrollTop;
  };

  // Follow streaming/generation progress by keeping the body pinned to the
  // bottom as each day fills in. Smooth scrolling animates toward the (moving)
  // bottom instead of hard-jumping on every token, so it glides rather than
  // snapping robotically.
  useEffect(() => {
    if (!generating && !stream) return;
    const el = bodyRef.current;
    if (el && stickRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [generating, stream]);

  /* ---- Initial load ---- */
  const loadExisting = useCallback(async () => {
    setLoading(true);
    setError("");
    setStream(null); // existing itineraries show in full, no streaming preview
    try {
      const data = await getItinerary(tripId);
      setItinerary(data.itinerary);
    } catch (err) {
      if (err.status !== 404) setError(err.message || "Failed to load itinerary");
      setItinerary(null);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  /* ---- Unlock quote (how many days are locked behind payment) ---- */
  const loadQuote = useCallback(async () => {
    try {
      const data = await getItineraryQuote(tripId);
      setQuote(data.quote);
    } catch {
      setQuote(null); // best-effort; the unlock prompt just won't show
    }
  }, [tripId]);

  useEffect(() => {
    loadExisting();
    loadQuote();
  }, [loadExisting, loadQuote]);

  /* ---- Full (re)generate (streamed day-by-day) ---- */
  const handleGenerate = async () => {
    const guidance = instructions.trim();
    stickRef.current = true; // follow the new generation from the top
    setGenerating(true);
    setError("");
    setStream(null);
    try {
      await streamGenerateItinerary(tripId, {
        instructions: guidance,
        onMeta: (meta) => {
          // First signal from the server: switch from the spinner to the live
          // preview that fills in as each day streams.
          setGenerating(false);
          setStream({ ...meta, days: [], completed: 0 });
        },
        onDay: (day, index, complete) => {
          // Upsert the day at its index so an in-progress day updates in place
          // (text fills in live) rather than appending a duplicate.
          setGenerating(false);
          setStream((s) => {
            const base = s ?? { days: [], completed: 0 };
            const days = base.days.slice();
            days[index] = day;
            const completed = complete
              ? Math.max(base.completed ?? 0, index + 1)
              : base.completed ?? 0;
            return { ...base, days, completed };
          });
        },
        onDone: (saved) => {
          setItinerary(saved); // authoritative, validated, persisted result
          setStream(null);
          setInstructions(""); // consumed — reset so the button disables again
        },
      });
      push("Itinerary generated");
    } catch (err) {
      setError(err.message || "Failed to generate itinerary");
      push(err.message || "Failed to generate itinerary", "error");
    } finally {
      setGenerating(false);
      setStream(null);
    }
  };

  /* ---- Extend the plan with unlocked days (keeps days 1..N, adds the rest) ---- */
  const handleGenerateRemaining = async () => {
    if (!itinerary || generating || stream || busy) return;
    const existing = itinerary.days;
    stickRef.current = true;
    setError("");
    // Seed the live preview with the already-planned days so they stay put and
    // only the new days stream in below them (no regeneration from day 1).
    setStream({
      currency: itinerary.currency,
      numDays: quote?.coveredDays || existing.length,
      days: existing.slice(),
      completed: existing.length,
    });
    try {
      await streamExtendItinerary(tripId, {
        onMeta: (meta) => {
          setStream((s) => ({
            ...(s ?? { days: existing.slice(), completed: existing.length }),
            numDays: meta.numDays,
            currency: meta.currency || s?.currency,
          }));
        },
        onDay: (day, index, complete) => {
          setStream((s) => {
            const base = s ?? { days: existing.slice(), completed: existing.length };
            const days = base.days.slice();
            days[index] = day; // absolute index — appends after existing days
            const completed = complete
              ? Math.max(base.completed ?? 0, index + 1)
              : base.completed ?? 0;
            return { ...base, days, completed };
          });
        },
        onDone: (saved) => {
          setItinerary(saved);
          setStream(null);
        },
      });
      push("Remaining days generated");
      await loadQuote();
    } catch (err) {
      setError(err.message || "Failed to generate the remaining days");
      push(err.message || "Failed to generate the remaining days", "error");
    } finally {
      setStream(null);
    }
  };

  /* ---- Unlock extra days (Razorpay). Generation stays a separate step: ----
     once paid, a "Generate for remaining days" button appears for the user to
     click when they're ready. */
  const handleUnlock = async () => {
    if (unlocking || !quote?.lockedDays) return;
    setUnlocking(true);
    try {
      const result = await unlockItineraryDays(tripId, {
        name: user?.name,
        email: user?.email,
      });
      push(result?.message || "Extra days unlocked — you can generate them now");
      // Refresh the owning trip (its unlocked-day count changed) and our quote
      // so the prompt flips from "pay" to "generate".
      await onTripRefresh?.();
      await loadQuote();
    } catch (err) {
      const msg = err?.message || "Payment could not be completed";
      // A user closing the Razorpay popup isn't an error worth shouting about.
      if (msg !== "Payment cancelled") push(msg, "error");
    } finally {
      setUnlocking(false);
    }
  };

  /* ---- Persist an edit via PATCH (server recomputes totals) ---- */
  const persist = async (newDays, successMsg) => {
    if (!itinerary) return;
    setBusy(true);
    try {
      const data = await updateItinerary(itinerary._id, newDays);
      setItinerary(data.itinerary); // authoritative (server-recomputed) state
      if (successMsg) push(successMsg);
    } catch (err) {
      push(err.message || "Could not save changes", "error");
      // Re-sync from server so the UI doesn't drift from persisted state.
      loadExisting();
    } finally {
      setBusy(false);
    }
  };

  /* ---- Per-day regenerate ---- */
  const handleRegenerateDay = async (dayNumber) => {
    if (!itinerary) return;
    setRegeneratingDay(dayNumber);
    try {
      const data = await regenerateItineraryDay(itinerary._id, dayNumber);
      setItinerary(data.itinerary);
      push(`Day ${dayNumber} regenerated`);
    } catch (err) {
      push(err.message || `Could not regenerate day ${dayNumber}`, "error");
    } finally {
      setRegeneratingDay(null);
    }
  };

  /* ---- Edit activity ---- */
  const handleSaveActivity = (values) => {
    const { dayNumber, slotKey } = editTarget;
    const days = toEditableDays(itinerary.days).map((d) =>
      d.dayNumber === dayNumber ? { ...d, [slotKey]: values } : d
    );
    setEditTarget(null);
    persist(days, "Activity updated");
  };

  /* ---- Reorder activity (swap adjacent time slots) ---- */
  const handleMoveActivity = (dayNumber, slotKey, dir) => {
    const idx = SLOT_ORDER.indexOf(slotKey);
    const targetIdx = dir === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= SLOT_ORDER.length) return;
    const targetKey = SLOT_ORDER[targetIdx];

    const days = toEditableDays(itinerary.days).map((d) => {
      if (d.dayNumber !== dayNumber) return d;
      return { ...d, [slotKey]: d[targetKey], [targetKey]: d[slotKey] };
    });
    persist(days, "Activities reordered");
  };

  /* ---- Delete activity (with confirmation) ---- */
  const handleConfirmDelete = () => {
    const { dayNumber, slotKey } = confirmTarget;
    const days = toEditableDays(itinerary.days).map((d) =>
      d.dayNumber === dayNumber ? { ...d, [slotKey]: null } : d
    );
    setConfirmTarget(null);
    persist(days, "Activity deleted");
  };

  /* ---- Current activity for the edit modal ---- */
  const editActivity =
    editTarget &&
    itinerary?.days.find((d) => d.dayNumber === editTarget.dayNumber)?.[editTarget.slotKey];

  /* ---- Live preview assembled from streamed days ---- */
  const streamDays = stream ? stream.days.filter(Boolean) : [];
  const streamPreview = stream && {
    days: streamDays,
    currency: stream.currency,
    estimatedTotalCost: streamDays.reduce((s, d) => s + (d.estimatedDayCost || 0), 0),
    disclaimer: stream.disclaimer,
    notes: "",
  };

  const streamStatus = stream
    ? stream.numDays && stream.completed >= stream.numDays
      ? "Finalising your plan…"
      : stream.numDays
        ? `Planning day ${Math.min(stream.completed + 1, stream.numDays)} of ${stream.numDays}…`
        : "Crafting your day-by-day plan…"
    : "";

  // Nothing to regenerate until there's a saved plan and the app is idle.
  const canRegenerate =
    !!itinerary && !generating && !stream && !busy && regeneratingDay === null;

  // Days that are unlocked (free + paid) but not yet in the generated plan.
  // After a successful payment this goes positive, surfacing the "Generate for
  // remaining days" button so the user chooses when to extend the plan.
  const generatedDays = itinerary?.days?.length || 0;
  const pendingGenerateDays =
    quote ? Math.max(0, quote.coveredDays - generatedDays) : 0;

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden dark:bg-slate-900 dark:border-slate-800">
      {/* Fixed header */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100">
          <Sparkles className="w-5 h-5 text-indigo-600" /> AI Itinerary
        </h2>
      </div>

      {/* Scrollable body */}
      <div
        ref={bodyRef}
        onScroll={handleBodyScroll}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-5"
      >
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Full-generation overlay (until the first streamed day arrives) */}
      {generating && !stream && (
        <div className="flex flex-col items-center justify-center py-14">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Crafting your day-by-day plan… this can take a few seconds.
          </p>
        </div>
      )}

      {/* Live streaming preview — days appear as the model produces them */}
      {stream && (
        <div className="space-y-5">
          {streamDays.length > 0 && (
            <ItineraryView itinerary={streamPreview} revealCards />
          )}
          <div className="flex items-center gap-3 text-slate-400 py-2 px-1">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
            <span className="text-sm">{streamStatus}</span>
          </div>
        </div>
      )}

      {/* Initial load */}
      {!generating && !stream && loading && (
        <div className="flex items-center gap-3 text-slate-400 py-6 px-1">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
          <span className="text-sm">Loading itinerary…</span>
        </div>
      )}

      {/* Itinerary (editable) */}
      {!generating && !stream && !loading && itinerary && (
        <>
          <ItineraryView
            itinerary={itinerary}
            editable
            busy={busy}
            regeneratingDay={regeneratingDay}
            handlers={{
              onRegenerateDay: handleRegenerateDay,
              onEditActivity: (dayNumber, slotKey) => setEditTarget({ dayNumber, slotKey }),
              onMoveActivity: handleMoveActivity,
              onDeleteActivity: (dayNumber, slotKey) => setConfirmTarget({ dayNumber, slotKey }),
            }}
          />

          {/* Below the plan: either a "pay to unlock" prompt (days still locked)
              or — once paid — a "generate for remaining days" button. */}
          {(pendingGenerateDays > 0 || quote?.lockedDays > 0) && (
            <div className="mt-5 flex flex-col gap-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl px-4 py-4 text-sm dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-200">
              {pendingGenerateDays > 0 ? (
                /* ---- Paid: days are unlocked, ready to generate ---- */
                <>
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400" />
                    <p className="font-semibold">
                      You've unlocked {pendingGenerateDays} more day
                      {pendingGenerateDays === 1 ? "" : "s"}. Generate the plan to
                      cover all {quote.coveredDays} of {quote.totalDays} days.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateRemaining}
                    disabled={!canRegenerate}
                    className="self-start inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Sparkles className="w-4 h-4" /> Generate for remaining days
                  </button>
                </>
              ) : (
                /* ---- Still locked: pay to unlock the remaining days ---- */
                <>
                  <div className="flex items-start gap-3">
                    <Lock className="w-5 h-5 shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <p className="font-semibold">
                        This plan covers the first {quote.coveredDays} of{" "}
                        {quote.totalDays} days.
                      </p>
                      <p className="mt-0.5">
                        Let the AI plan the remaining {quote.lockedDays} day
                        {quote.lockedDays === 1 ? "" : "s"} for{" "}
                        {formatMoney(quote.pricePerDay, quote.currency) ||
                          `${quote.pricePerDay} ${quote.currency}`}{" "}
                        per day
                        {quote.amount > 0 && (
                          <>
                            {" "}
                            (total{" "}
                            <span className="font-semibold">
                              {formatMoney(quote.amount, quote.currency) ||
                                `${quote.amount} ${quote.currency}`}
                            </span>
                            )
                          </>
                        )}
                        .
                      </p>
                    </div>
                  </div>
                  {quote.paymentConfigured ? (
                    <button
                      type="button"
                      onClick={handleUnlock}
                      disabled={unlocking}
                      className="self-start inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {unlocking ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Processing
                          payment…
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" /> Pay to unlock remaining days
                        </>
                      )}
                    </button>
                  ) : (
                    <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80">
                      Paid unlock is currently unavailable.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Empty */}
      {!generating && !stream && !loading && !itinerary && (
        <div className="flex flex-col items-center justify-center text-center py-14 px-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 mb-4 dark:bg-indigo-500/15 dark:text-indigo-400">
            <Map className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">No itinerary yet</h3>
          <p className="text-slate-500 mt-1 max-w-sm dark:text-slate-400">
            Generate an AI day-by-day plan with activities, food, transport and
            estimated costs for this trip.
          </p>
          <button
            onClick={handleGenerate}
            className="mt-5 inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/25 transition cursor-pointer"
          >
            <Sparkles className="w-4 h-4" /> Generate itinerary
          </button>
        </div>
      )}
      </div>
      {/* End scrollable body */}

      {/* Fixed footer: search box · regenerate · trip assistant */}
      <div className="shrink-0 border-t border-slate-200 p-3 sm:p-4 dark:border-slate-800">
        <div className="flex items-center gap-2">
          {/* Search box = custom guidance that drives a full regeneration. */}
          <input
            type="text"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && instructions.trim() && canRegenerate) {
                handleGenerate();
              }
            }}
            disabled={!canRegenerate}
            placeholder={
              itinerary
                ? "Tell the AI what to change (e.g. more food, cheaper stays)…"
                : "Generate an itinerary first to refine it here…"
            }
            className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl text-sm bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition disabled:opacity-50 disabled:cursor-not-allowed dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          />

          {/* Regenerate — enabled only when there's input to act on. */}
          <button
            onClick={handleGenerate}
            disabled={!instructions.trim() || !canRegenerate}
            title={
              !instructions.trim()
                ? "Add instructions to regenerate"
                : "Regenerate the whole plan with your instructions"
            }
            className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-indigo-600 border-2 border-indigo-600 hover:bg-indigo-50 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed dark:text-indigo-400 dark:border-indigo-400 dark:hover:bg-indigo-500/10"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Regenerate</span>
          </button>

          {/* Trip assistant — opens the chat modal. */}
          <button
            onClick={onOpenAssistant}
            title="Open the Trip Assistant"
            className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm transition cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Trip assistant</span>
          </button>
        </div>
      </div>

      {/* Edit modal */}
      <ActivityEditModal
        open={!!editTarget}
        activity={editActivity}
        slotLabel={editTarget ? SLOT_LABELS[editTarget.slotKey] : ""}
        currency={itinerary?.currency}
        saving={busy}
        onSave={handleSaveActivity}
        onCancel={() => setEditTarget(null)}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!confirmTarget}
        title="Delete this activity?"
        message={
          confirmTarget
            ? `The ${SLOT_LABELS[confirmTarget.slotKey].toLowerCase()} activity on day ${confirmTarget.dayNumber} will be removed from your itinerary.`
            : ""
        }
        confirmLabel={busy ? "Deleting…" : "Delete"}
        loading={busy}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
};

export default ItinerarySection;
