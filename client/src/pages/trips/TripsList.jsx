import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Plus, Luggage, Compass } from "lucide-react";
import { getTrips } from "../../services/trips";
import { TRIP_STATUSES } from "../../constants/trips";
import TripCard from "../../components/trips/TripCard";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../components/ui/States";

const TripsList = () => {
  const [trips, setTrips] = useState([]);
  const [status, setStatus] = useState(""); // "" = all
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { limit: 100 };
      if (status) params.status = status;
      const data = await getTrips(params);
      setTrips(data.trips || []);
    } catch (err) {
      setError(err.message || "Failed to load trips");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const hasFilter = status !== "";

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            My Trips
          </h1>
          <p className="text-slate-500 mt-1.5 dark:text-slate-400">
            Plan, review, and manage all your journeys in one place.
          </p>
        </div>
        <Link
          to="/trips/new"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/25 transition cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" /> New trip
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-8">
        <FilterChip active={!hasFilter} onClick={() => setStatus("")}>
          All
        </FilterChip>
        {TRIP_STATUSES.map((s) => (
          <FilterChip
            key={s.value}
            active={status === s.value}
            onClick={() => setStatus(s.value)}
          >
            {s.label}
          </FilterChip>
        ))}
      </div>

      {/* Content states */}
      {loading ? (
        <LoadingState label="Loading your trips…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : trips.length === 0 ? (
        hasFilter ? (
          <EmptyState
            icon={Compass}
            title="No trips with this status"
            message="Try a different filter, or create a new trip."
            action={
              <button
                onClick={() => setStatus("")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-indigo-600 border-2 border-indigo-600 hover:bg-indigo-50 transition cursor-pointer dark:text-indigo-400 dark:border-indigo-400 dark:hover:bg-indigo-500/10"
              >
                Clear filter
              </button>
            }
          />
        ) : (
          <EmptyState
            icon={Luggage}
            title="No trips yet"
            message="Start planning your first adventure — it only takes a minute."
            action={
              <Link
                to="/trips/new"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/25 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Create your first trip
              </Link>
            }
          />
        )
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <TripCard key={trip._id} trip={trip} />
          ))}
        </div>
      )}
    </section>
  );
};

const FilterChip = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-4 py-1.5 rounded-full text-sm font-medium border transition cursor-pointer ${
      active
        ? "bg-indigo-600 text-white border-indigo-600"
        : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:border-indigo-500"
    }`}
  >
    {children}
  </button>
);

export default TripsList;
