import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Wallet,
  PiggyBank,
  TrendingDown,
  Users,
  CalendarDays,
  Plus,
  Trash2,
  AlertCircle,
  Info,
} from "lucide-react";
import {
  getBudget,
  addBudgetItem,
  deleteBudgetItem,
  BUDGET_CATEGORIES,
} from "../../services/budget";
import { formatMoney } from "../../utils/format";
import { useToast } from "../../contexts/ToastContext";
import { LoadingState, ErrorState } from "../../components/ui/States";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import DatePicker from "../../components/ui/DatePicker";
import Select from "../../components/ui/Select";
import { CategoryBars, DailyBars } from "../../components/trips/BudgetCharts";

const CURRENCIES = ["", "USD", "EUR", "GBP", "JPY", "INR", "AUD", "CAD"];
const catLabel = (k) => BUDGET_CATEGORIES.find((c) => c.key === k)?.label || k;

/** Local-timezone `yyyy-mm-dd` for today (used to block selecting past dates). */
const todayISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const Card = ({ icon: Icon, label, value, sub, tone = "slate" }) => {
  const tones = {
    slate: "text-slate-900 dark:text-slate-100",
    green: "text-emerald-600 dark:text-emerald-400",
    red: "text-red-600 dark:text-red-400",
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 dark:bg-slate-900 dark:border-slate-800">
      <div className="flex items-center gap-2 text-slate-400 mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${tones[tone]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
};

const BudgetDashboard = () => {
  const { tripId } = useParams();
  const { push } = useToast();

  const [budget, setBudget] = useState(null);
  const [summary, setSummary] = useState(null);
  const [display, setDisplay] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ category: "accommodation", label: "", amount: "", date: "" });
  const [formError, setFormError] = useState("");
  const [confirmItem, setConfirmItem] = useState(null);

  const load = useCallback(
    async (displayCur = display) => {
      setLoading(true);
      setError("");
      try {
        const data = await getBudget(tripId, displayCur || undefined);
        setBudget(data.budget);
        setSummary(data.summary);
      } catch (err) {
        setError(err.message || "Failed to load budget");
      } finally {
        setLoading(false);
      }
    },
    [tripId, display]
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const onDisplayChange = (cur) => {
    setDisplay(cur);
    load(cur);
  };

  const submitItem = async (e) => {
    e.preventDefault();
    setFormError("");
    const amount = Number(form.amount);
    if (!form.label.trim()) return setFormError("Label is required.");
    if (!Number.isFinite(amount) || amount < 0) return setFormError("Amount must be 0 or more.");
    setBusy(true);
    try {
      const body = { category: form.category, label: form.label.trim(), amount };
      if (form.date) body.date = form.date;
      const data = await addBudgetItem(tripId, body);
      setBudget(data.budget);
      // Re-fetch to honour the active display currency on the summary.
      if (display) await load(display);
      else setSummary(data.summary);
      setForm({ category: form.category, label: "", amount: "", date: "" });
      push("Expense added");
    } catch (err) {
      setFormError(err.errors?.[0]?.message || err.message || "Could not add item.");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    const id = confirmItem._id;
    setBusy(true);
    try {
      const data = await deleteBudgetItem(tripId, id);
      setBudget(data.budget);
      if (display) await load(display);
      else setSummary(data.summary);
      setConfirmItem(null);
      push("Expense deleted");
    } catch (err) {
      setError(err.message || "Could not delete item.");
      setConfirmItem(null);
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <LoadingState label="Loading budget…" />
      </section>
    );
  if (error)
    return (
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <ErrorState message={error} onRetry={() => load()} />
      </section>
    );

  // View in display currency if a conversion is available, else base currency.
  const conv = summary.conversion;
  const view =
    conv?.available && summary.converted
      ? { cur: summary.converted.currency, ...summary.converted }
      : {
          cur: summary.currency,
          totalEstimatedCost: summary.totalEstimatedCost,
          perDay: summary.perDay,
          perPerson: summary.perPerson,
          budget: summary.budget,
          remaining: summary.remaining,
          categoryTotals: summary.categoryTotals,
        };
  const money = (n) => (n == null ? "—" : formatMoney(n, view.cur) || `${n} ${view.cur}`);
  const categoriesView = summary.categoryList.map((c) => ({
    ...c,
    label: catLabel(c.category),
    total: view.categoryTotals[c.category] ?? c.total,
  }));
  const dailyView = summary.dailyTotals.map((d) => ({
    ...d,
    amount: conv?.available ? Math.round(d.amount * conv.rate * 100) / 100 : d.amount,
  }));

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <Link
        to={`/trips/${tripId}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600 transition mb-4 dark:text-slate-400 dark:hover:text-indigo-400"
      >
        <ArrowLeft className="w-4 h-4" /> Back to trip
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Budget</h1>
          <p className="text-slate-500 mt-1 text-sm dark:text-slate-400">
            Estimated expenses by category and day. Amounts are estimates, not booked prices.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          Display in
          <Select
            className="w-44"
            ariaLabel="Display currency"
            value={display}
            onChange={onDisplayChange}
            options={CURRENCIES.map((c) => ({
              value: c,
              label: c || `${summary.currency} (trip)`,
            }))}
          />
        </label>
      </div>

      {/* Conversion assumption / unavailable notice */}
      {conv?.available && (
        <div className="flex items-start gap-2 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-xl px-4 py-2.5 text-sm mb-5 dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-300">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{conv.disclaimer}</span>
        </div>
      )}
      {conv && !conv.available && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-2.5 text-sm mb-5 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Couldn't convert to {conv.requested}: {conv.note} Showing amounts in {summary.currency}.
          </span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-7">
        <Card icon={Wallet} label="Estimated total" value={money(view.totalEstimatedCost)} sub={`${view.cur} · ${summary.days} days`} />
        <Card
          icon={PiggyBank}
          label="Your budget"
          value={view.budget != null ? money(view.budget) : "Not set"}
          sub={
            view.budget != null && summary.budgetType === "per_person"
              ? `Per head × ${summary.travellers}`
              : undefined
          }
        />
        <Card
          icon={TrendingDown}
          label="Remaining"
          value={view.remaining != null ? money(view.remaining) : "—"}
          tone={view.remaining == null ? "slate" : summary.overBudget ? "red" : "green"}
          sub={summary.overBudget ? "Over budget" : view.remaining != null ? "Within budget" : "Set a trip budget"}
        />
        <Card icon={Users} label="Per person" value={money(view.perPerson)} sub={`${summary.travellers} travellers`} />
        <Card icon={CalendarDays} label="Per day" value={money(view.perDay)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Category breakdown */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 dark:bg-slate-900 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">By category</h2>
          {summary.totalEstimatedCost > 0 ? (
            <CategoryBars categories={categoriesView} currency={view.cur} />
          ) : (
            <p className="text-sm text-slate-400">No expenses yet — add some below.</p>
          )}
        </div>

        {/* Daily totals */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 dark:bg-slate-900 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">By day</h2>
          <DailyBars days={dailyView} currency={view.cur} />
        </div>
      </div>

      {/* Add item */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 dark:bg-slate-900 dark:border-slate-800 mt-5">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Add an estimated expense</h2>
        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-sm mb-3 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">{formError}</div>
        )}
        <form onSubmit={submitItem} className="grid sm:grid-cols-12 gap-2">
          <Select
            className="sm:col-span-3"
            ariaLabel="Expense category"
            value={form.category}
            onChange={(v) => setForm((f) => ({ ...f, category: v }))}
            options={BUDGET_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
          />
          <input
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Label (e.g. Hotel)"
            className="sm:col-span-4 px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
          />
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder={`Amount (${summary.currency})`}
            className="sm:col-span-2 px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
          />
          <div className="sm:col-span-2">
            <DatePicker
              id="expense-date"
              value={form.date}
              onChange={(date) => setForm((f) => ({ ...f, date }))}
              min={todayISO()}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="sm:col-span-1 flex items-center justify-center px-3 py-2.5 rounded-xl text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 transition cursor-pointer"
            aria-label="Add expense"
          >
            <Plus className="w-5 h-5" />
          </button>
        </form>
        <p className="text-[11px] text-slate-400 mt-1">Amounts entered in the trip currency ({summary.currency}).</p>
      </div>

      {/* Items list */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 dark:bg-slate-900 dark:border-slate-800 mt-5">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Expenses ({budget.items.length})</h2>
        {budget.items.length === 0 ? (
          <p className="text-sm text-slate-400">No expenses yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {budget.items.map((it) => (
              <li key={it._id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate dark:text-slate-200">
                    {it.label}
                    {it.source === "itinerary" && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-indigo-500">from itinerary</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400">
                    {catLabel(it.category)}
                    {it.date ? ` · ${new Date(it.date).toISOString().slice(0, 10)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {formatMoney(it.amount, summary.currency) || `${it.amount} ${summary.currency}`}
                  </span>
                  <button
                    onClick={() => setConfirmItem(it)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer dark:hover:text-red-400 dark:hover:bg-red-500/10"
                    aria-label="Delete expense"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Assumptions / disclaimer */}
      <div className="mt-5 text-xs text-slate-400 space-y-1">
        {summary.assumptions.map((a, i) => (
          <p key={i}>• {a}</p>
        ))}
      </div>

      <ConfirmDialog
        open={!!confirmItem}
        title="Delete this expense?"
        message={confirmItem ? `"${confirmItem.label}" will be removed from your budget.` : ""}
        confirmLabel={busy ? "Deleting…" : "Delete"}
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmItem(null)}
      />
    </section>
  );
};

export default BudgetDashboard;
