import { useState, useEffect, useCallback } from "react";
import {
  Wallet,
  CheckCircle2,
  Receipt,
  Users,
  Luggage,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Trophy,
} from "lucide-react";
import { getAnalytics, getTransactions } from "../../services/admin";
import { formatMoney, formatDate, formatTime } from "../../utils/format";
import { LoadingState, ErrorState, EmptyState } from "../../components/ui/States";
import Select from "../../components/ui/Select";
import { DailyBars } from "../../components/trips/BudgetCharts";

/** Transaction amounts are stored in minor units (e.g. paise) → major. */
const toMajor = (minor) => (minor || 0) / 100;

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "paid", label: "Paid" },
  { value: "created", label: "Created" },
  { value: "failed", label: "Failed" },
];

const STATUS_BADGE = {
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  created: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
};

const PAGE_SIZE = 20;

/* ---------- Small presentational pieces ---------- */

const Card = ({ icon: Icon, label, value, sub, tone = "slate" }) => {
  const tones = {
    slate: "text-slate-900 dark:text-slate-100",
    green: "text-emerald-600 dark:text-emerald-400",
    indigo: "text-indigo-600 dark:text-indigo-400",
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

const Panel = ({ title, children, action, className = "", bodyClassName = "" }) => (
  <div
    className={`bg-white border border-slate-200 rounded-2xl shadow-sm p-5 dark:bg-slate-900 dark:border-slate-800 ${className}`}
  >
    <div className="flex items-center justify-between gap-2 mb-4">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
      {action}
    </div>
    <div className={bodyClassName}>{children}</div>
  </div>
);

const StatusBadge = ({ status }) => (
  <span
    className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
      STATUS_BADGE[status] || "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
    }`}
  >
    {status}
  </span>
);

/* ---------- Page ---------- */

const AdminDashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Transactions table state.
  const [tx, setTx] = useState([]);
  const [txPagination, setTxPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAnalytics();
      setAnalytics(data.analytics);
    } catch (err) {
      setError(err.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    setTxError("");
    try {
      const params = { page, limit: PAGE_SIZE, sort: "-createdAt" };
      if (status) params.status = status;
      if (search.trim()) params.search = search.trim();
      const data = await getTransactions(params);
      setTx(data.transactions);
      setTxPagination(data.pagination);
    } catch (err) {
      setTxError(err.message || "Failed to load transactions");
    } finally {
      setTxLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Status change / search reset to page 1.
  const onStatusChange = (v) => {
    setStatus(v);
    setPage(1);
  };
  const onSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadTransactions();
  };

  /** Download the current transactions view as CSV. */
  const exportCsv = () => {
    const header = ["Date", "Payer", "Email", "Trip", "Purpose", "Days", "Amount", "Currency", "Status", "Order ID", "Payment ID"];
    const rows = tx.map((t) => [
      new Date(t.createdAt).toISOString(),
      t.userId?.name || "",
      t.userId?.email || "",
      t.tripId ? `${t.tripId.origin} -> ${t.tripId.destination}` : "",
      t.purpose || "",
      t.extraDays ?? "",
      toMajor(t.amount),
      t.currency,
      t.status,
      t.orderId,
      t.paymentId || "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading)
    return (
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <LoadingState label="Loading admin dashboard…" />
      </section>
    );
  if (error)
    return (
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <ErrorState message={error} onRetry={loadAnalytics} />
      </section>
    );

  const { totals, payments, revenue, topUsers } = analytics;
  const cur = revenue.primaryCurrency;
  const primaryRevenue = revenue.byCurrency.find((r) => r.currency === cur);
  const money = (n) => formatMoney(n, cur) || `${n} ${cur}`;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Admin dashboard
        </h1>
        <p className="text-slate-500 mt-1 text-sm dark:text-slate-400">
          Platform-wide transactions and analytics across all users.
        </p>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-7">
        <Card
          icon={Wallet}
          label="Revenue"
          value={money(primaryRevenue?.total || 0)}
          sub={`${cur} · ${primaryRevenue?.count || 0} paid`}
          tone="green"
        />
        <Card
          icon={CheckCircle2}
          label="Success rate"
          value={`${payments.successRate}%`}
          sub={`${payments.byStatus.paid} paid · ${payments.byStatus.failed} failed`}
        />
        <Card icon={Receipt} label="Transactions" value={totals.transactions} sub={`${payments.byStatus.created} pending`} />
        <Card icon={Users} label="Users" value={totals.users} tone="indigo" />
        <Card icon={Luggage} label="Trips" value={totals.trips} tone="indigo" />
      </div>

      {/* Revenue trend + breakdowns */}
      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        {/* Revenue trend — stretches to match the right column's height. */}
        <Panel
          className="lg:col-span-2 h-full flex flex-col"
          bodyClassName="flex-1 flex flex-col"
          title={`Revenue · last 14 days (${cur})`}
        >
          {revenue.byDay.some((d) => d.amount > 0) ? (
            <DailyBars days={revenue.byDay} currency={cur} className="flex-1" />
          ) : (
            <p className="text-sm text-slate-400">No revenue in the last 14 days.</p>
          )}
          {revenue.byCurrency.length > 1 && (
            <p className="text-[11px] text-slate-400 mt-3">
              Other currencies:{" "}
              {revenue.byCurrency
                .filter((r) => r.currency !== cur)
                .map((r) => `${formatMoney(r.total, r.currency) || r.total} ${r.currency}`)
                .join(" · ")}
            </p>
          )}
        </Panel>

        <div className="space-y-5">
          {/* Payment status */}
          <Panel title="Payments by status">
            <ul className="space-y-2.5">
              {["paid", "created", "failed"].map((s) => (
                <li key={s} className="flex items-center justify-between text-sm">
                  <StatusBadge status={s} />
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {payments.byStatus[s]}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          {/* Top paying users */}
          <Panel title="Top paying users">
            {topUsers.length === 0 ? (
              <p className="text-sm text-slate-400">No paid transactions yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {topUsers.map((u, i) => (
                  <li key={u.userId || i} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold shrink-0 dark:bg-indigo-500/15 dark:text-indigo-400">
                        {i === 0 ? <Trophy className="w-3.5 h-3.5" /> : i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate dark:text-slate-200">
                          {u.name || "Unknown user"}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{u.email || "—"}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {formatMoney(u.total, cur) || `${u.total} ${cur}`}
                      </p>
                      <p className="text-[11px] text-slate-400">{u.count} payment{u.count === 1 ? "" : "s"}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* Transactions */}
      <div className="mt-5">
        <Panel
          title="All transactions"
          action={
            <button
              onClick={exportCsv}
              disabled={tx.length === 0}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-500 disabled:text-slate-300 transition cursor-pointer disabled:cursor-not-allowed dark:text-indigo-400"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          }
        >
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Select
              className="w-40"
              ariaLabel="Filter by status"
              value={status}
              onChange={onStatusChange}
              options={STATUS_OPTIONS}
            />
            <form onSubmit={onSearchSubmit} className="flex-1 min-w-[12rem] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order / payment / receipt id…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
              />
            </form>
          </div>

          {txError ? (
            <ErrorState message={txError} onRetry={loadTransactions} />
          ) : txLoading ? (
            <LoadingState label="Loading transactions…" />
          ) : tx.length === 0 ? (
            <EmptyState icon={Receipt} title="No transactions" message="No payments match the current filters." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2.5 pr-3 font-semibold">Date</th>
                      <th className="py-2.5 pr-3 font-semibold">Payer</th>
                      <th className="py-2.5 pr-3 font-semibold">Trip</th>
                      <th className="py-2.5 pr-3 font-semibold text-right">Amount</th>
                      <th className="py-2.5 pr-3 font-semibold">Status</th>
                      <th className="py-2.5 font-semibold">Order ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {tx.map((t) => (
                      <tr key={t._id} className="text-slate-700 dark:text-slate-300">
                        <td className="py-2.5 pr-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                          <p>{formatDate(t.createdAt)}</p>
                          <p className="text-xs text-slate-400">{formatTime(t.createdAt)}</p>
                        </td>
                        <td className="py-2.5 pr-3 min-w-[10rem]">
                          <p className="font-medium text-slate-800 truncate dark:text-slate-200">
                            {t.userId?.name || "—"}
                          </p>
                          <p className="text-xs text-slate-400 truncate">{t.userId?.email || "—"}</p>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-500 dark:text-slate-400 min-w-[10rem]">
                          {t.tripId ? (
                            <span className="truncate block max-w-[14rem]">
                              {t.tripId.origin} → {t.tripId.destination}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-right whitespace-nowrap font-medium">
                          {formatMoney(toMajor(t.amount), t.currency) || `${toMajor(t.amount)} ${t.currency}`}
                        </td>
                        <td className="py-2.5 pr-3">
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="py-2.5 font-mono text-xs text-slate-400 truncate max-w-[10rem]">
                          {t.orderId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between gap-3 mt-4 text-sm">
                <p className="text-slate-400">
                  {txPagination.total} transaction{txPagination.total === 1 ? "" : "s"} · page {txPagination.page} of{" "}
                  {txPagination.totalPages}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ChevronLeft className="w-4 h-4" /> Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(txPagination.totalPages, p + 1))}
                    disabled={page >= txPagination.totalPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>
    </section>
  );
};

export default AdminDashboard;
