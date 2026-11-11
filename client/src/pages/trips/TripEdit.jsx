import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getTrip, updateTrip } from "../../services/trips";
import { useToast } from "../../contexts/ToastContext";
import TripForm from "../../components/trips/TripForm";
import { LoadingState, ErrorState } from "../../components/ui/States";

const TripEdit = () => {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getTrip(tripId);
      setTrip(data.trip);
    } catch (err) {
      setError(err.message || "Failed to load trip");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (payload) => {
    await updateTrip(tripId, payload); // may throw → handled by TripForm
    push("Trip updated successfully");
    navigate(`/trips/${tripId}`, { replace: true });
  };

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <Link
        to={`/trips/${tripId}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600 transition mb-6 dark:text-slate-400 dark:hover:text-indigo-400"
      >
        <ArrowLeft className="w-4 h-4" /> Back to trip
      </Link>

      {loading ? (
        <LoadingState label="Loading trip…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Edit trip
            </h1>
            <p className="text-slate-500 mt-1.5 dark:text-slate-400">
              Update the details of your trip to {trip.destination}.
            </p>
          </div>

          <TripForm
            initialValues={trip}
            submitLabel="Save changes"
            onSubmit={handleSubmit}
            onCancel={() => navigate(`/trips/${tripId}`)}
          />
        </>
      )}
    </section>
  );
};

export default TripEdit;
