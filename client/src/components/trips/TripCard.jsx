import { Link } from "react-router-dom";
import {
  MapPin,
  Calendar,
  Users,
  Wallet,
  ArrowRight,
  Plane,
} from "lucide-react";
import {
  STATUS_STYLES,
  TRIP_STATUSES,
  labelFor,
} from "../../constants/trips";
import { formatRange, formatMoney, tripDuration } from "../../utils/format";

/**
 * Reusable summary card for a single trip. Links through to the details page.
 */
const TripCard = ({ trip }) => {
  const days = tripDuration(trip.startDate, trip.endDate);
  const money = formatMoney(trip.budget, trip.currency);

  return (
    <Link
      to={`/trips/${trip._id}`}
      className="group flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-300 transition-all duration-200 overflow-hidden dark:bg-slate-900 dark:border-slate-800 dark:hover:border-indigo-500/50"
    >
      {/* Header strip */}
      <div className="relative bg-gradient-to-br from-indigo-600 to-indigo-500 p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs text-indigo-100 mb-1">
              <Plane className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {trip.origin ? `${trip.origin} → ` : ""}
                {trip.stopover ? `${trip.stopover} → ` : ""}
                {trip.destination}
              </span>
            </p>
            <h3 className="text-xl font-bold truncate">{trip.destination}</h3>
          </div>
          <span
            className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
              STATUS_STYLES[trip.status] || STATUS_STYLES.draft
            }`}
          >
            {labelFor(TRIP_STATUSES, trip.status)}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="truncate">
            {formatRange(trip.startDate, trip.endDate)}
          </span>
          {days != null && (
            <span className="ml-auto text-xs font-medium text-slate-400 shrink-0">
              {days} {days === 1 ? "day" : "days"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Users className="w-4 h-4 text-slate-400 shrink-0" />
          {trip.travellers} {trip.travellers === 1 ? "traveller" : "travellers"}
        </div>

        {money && (
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Wallet className="w-4 h-4 text-slate-400 shrink-0" />
            {money}
            {trip.budgetType === "per_person" && trip.travellers > 1 && (
              <span className="text-xs text-slate-400">/head</span>
            )}
          </div>
        )}

        {trip.interests?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {trip.interests.slice(0, 3).map((i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                {i}
              </span>
            ))}
            {trip.interests.length > 3 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                +{trip.interests.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-sm font-medium text-indigo-600 dark:border-slate-800 dark:text-indigo-400">
        <span className="flex items-center gap-1 text-slate-400">
          <MapPin className="w-3.5 h-3.5" /> View details
        </span>
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </div>
    </Link>
  );
};

export default TripCard;
