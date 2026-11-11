import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { createTrip } from "../../services/trips";
import { useToast } from "../../contexts/ToastContext";
import TripForm from "../../components/trips/TripForm";

const TripCreate = () => {
  const navigate = useNavigate();
  const { push } = useToast();

  const handleSubmit = async (payload) => {
    const data = await createTrip(payload); // may throw → handled by TripForm
    push("Trip created successfully");
    navigate(`/trips/${data.trip._id}`, { replace: true });
  };

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <Link
        to="/trips"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600 transition mb-6 dark:text-slate-400 dark:hover:text-indigo-400"
      >
        <ArrowLeft className="w-4 h-4" /> Back to trips
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Plan a new trip
        </h1>
        <p className="text-slate-500 mt-1.5 dark:text-slate-400">
          Tell us about your journey — you can refine the details anytime.
        </p>
      </div>

      <TripForm
        submitLabel="Create trip"
        onSubmit={handleSubmit}
        onCancel={() => navigate("/trips")}
      />
    </section>
  );
};

export default TripCreate;
