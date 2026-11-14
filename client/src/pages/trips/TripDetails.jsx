import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Calendar,
  Users,
  Wallet,
  MapPin,
  Plane,
  Gauge,
  Compass,
  Sparkles,
} from "lucide-react";
import { getTrip, deleteTrip } from "../../services/trips";
import { useToast } from "../../contexts/ToastContext";
import {
  STATUS_STYLES,
  TRIP_STATUSES,
  TRAVEL_STYLES,
  TRAVEL_PACES,
  labelFor,
} from "../../constants/trips";
import { formatDate, formatMoney, tripDuration } from "../../utils/format";
import { LoadingState, ErrorState } from "../../components/ui/States";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import ItinerarySection from "../../components/trips/ItinerarySection";
import ChatPanel from "../../components/trips/ChatPanel";

const TripDetails = () => {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [heroImage, setHeroImage] = useState("");

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

  // Fetch a representative PHOTO of the destination for the hero background.
  // Uses Wikipedia's public APIs (no API key, CORS-enabled); falls back
  // silently to the gradient only when every strategy comes up empty.
  //
  // Two problems we have to dodge:
  //   • Same-name non-places — searching "Puri" can surface a person/film. We
  //     bias towards articles that have COORDINATES (i.e. real locations).
  //   • Non-photo lead images — a place article's main image is often a locator
  //     MAP, flag or SVG diagram (e.g. "Bali"), not a tourist photo. We reject
  //     those by filename and instead pull a genuine photo from the article's
  //     media list.
  useEffect(() => {
    const destination = trip?.destination?.trim();
    if (!destination) return;
    let cancelled = false;
    const controller = new AbortController();
    const signal = controller.signal;
    setHeroImage("");

    // Maps, flags, coats of arms, locator diagrams, SVG icons, logos — anything
    // that isn't a real photograph of the place.
    const NON_PHOTO =
      /\.svg|locator|location[ _-]?map|\bmap\b|flag|coat[ _-]of[ _-]arms|\bseal\b|\bemblem\b|orthographic|\blogo\b|globe|\bicon\b/i;
    // Underscores are word chars, so normalise them to spaces first — otherwise
    // "\bseal\b" etc. wouldn't match "Official_seal_of_the_Province…".
    const isPhoto = (name) =>
      !!name && !NON_PHOTO.test(decodeURIComponent(name).replace(/_/g, " "));

    // Collect candidate article titles for the destination, most-likely first.
    // We return several (not just one) because the exact article can be a stub
    // whose only image is a map — e.g. "Bankura" has just an old map, while
    // "Bankura district" has real photos. We try each until one yields a photo.
    const candidateTitles = async () => {
      const titles = [];
      const push = (t) => t && !titles.includes(t) && titles.push(t);

      // 1) Exact title via REST summary (follows redirects), if geographic.
      try {
        const res = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
            destination
          )}?redirect=true`,
          { signal }
        );
        if (res.ok) {
          const d = await res.json();
          if (d?.type !== "disambiguation" && d?.coordinates) {
            push(d?.titles?.canonical || d?.title);
          }
        }
      } catch {
        if (signal.aborted) return titles;
      }

      // 2) Search matches — geographic pages first, then the rest as backup.
      try {
        const url =
          "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*" +
          "&prop=coordinates&generator=search&gsrnamespace=0&gsrlimit=8" +
          `&gsrsearch=${encodeURIComponent(destination)}`;
        const res = await fetch(url, { signal });
        if (res.ok) {
          const data = await res.json();
          const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
          pages.sort((a, b) => (a.index ?? 1e9) - (b.index ?? 1e9));
          pages.filter((p) => p?.coordinates?.length).forEach((p) => push(p.title));
          pages.filter((p) => !p?.coordinates?.length).forEach((p) => push(p.title));
        }
      } catch {
        if (signal.aborted) return titles;
      }
      return titles;
    };

    // Turn a "File:…" title into a banner-sized (1200px) image URL.
    const sizedUrl = async (fileTitle) => {
      const url =
        "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*" +
        "&prop=imageinfo&iiprop=url&iiurlwidth=1200" +
        `&titles=${encodeURIComponent(fileTitle)}`;
      const res = await fetch(url, { signal });
      if (!res.ok) return null;
      const data = await res.json();
      const info = Object.values(data?.query?.pages || {})[0]?.imageinfo?.[0];
      return info?.thumburl || info?.url || null;
    };

    // Pick a real photo from the article's media list (skips maps/flags/SVGs).
    const photoForTitle = async (title) => {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(
          title
        )}`,
        { signal }
      );
      if (!res.ok) return null;
      const items = (await res.json())?.items || [];
      const photo = items.find(
        (it) => it.type === "image" && isPhoto(it.title)
      );
      return photo ? sizedUrl(photo.title) : null;
    };

    (async () => {
      try {
        const titles = await candidateTitles();
        // Try each candidate until one has a usable photo (stop at first hit).
        for (const title of titles) {
          if (cancelled) return;
          const src = await photoForTitle(title);
          if (src) {
            if (!cancelled) setHeroImage(src);
            return;
          }
        }
      } catch {
        /* keep gradient fallback */
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [trip?.destination]);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteTrip(tripId);
      push("Trip deleted");
      navigate("/trips", { replace: true });
    } catch (err) {
      setDeleteError(err.message || "Failed to delete trip");
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  if (loading)
    return (
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <LoadingState label="Loading trip…" />
      </section>
    );

  if (error)
    return (
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <ErrorState message={error} onRetry={load} />
        <div className="text-center mt-6">
          <Link
            to="/trips"
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            ← Back to all trips
          </Link>
        </div>
      </section>
    );

  const days = tripDuration(trip.startDate, trip.endDate);
  const money = formatMoney(trip.budget, trip.currency);
  // Budget interpretation: "per_person" means the figure is per traveller.
  const isPerHead = trip.budgetType === "per_person" && trip.travellers > 1;
  const budgetTotal =
    trip.budget && isPerHead ? trip.budget * trip.travellers : null;

  // Traveller breakdown (age group → gender). May be absent on older trips.
  const comp = trip.composition;
  const groupTotal = (g) =>
    g ? (g.male || 0) + (g.female || 0) + (g.other || 0) : 0;
  const adultsTotal = groupTotal(comp?.adults);
  const childrenTotal = groupTotal(comp?.children);
  const hasBreakdown = adultsTotal + childrenTotal > 0;
  const travellerSub = hasBreakdown
    ? [
        adultsTotal
          ? `${adultsTotal} adult${adultsTotal === 1 ? "" : "s"}`
          : null,
        childrenTotal
          ? `${childrenTotal} child${childrenTotal === 1 ? "" : "ren"}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const genderLabel = { male: "Male", female: "Female", other: "Other" };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <Link
        to="/trips"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600 transition mb-6 dark:text-slate-400 dark:hover:text-indigo-400"
      >
        <ArrowLeft className="w-4 h-4" /> Back to trips
      </Link>

      {deleteError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-6 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">
          {deleteError}
        </div>
      )}

      {/* Hero header — destination photo background with gradient fallback */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white p-6 sm:p-8">
        {heroImage && (
          <>
            <img
              src={heroImage}
              alt={trip.destination}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              onError={() => setHeroImage("")}
            />
            {/* Dark overlay keeps the white text readable over any photo. */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950/80 via-slate-900/55 to-indigo-900/70" />
          </>
        )}
        <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm text-indigo-100 mb-1">
              <Plane className="w-4 h-4 shrink-0" />
              {trip.origin ? `${trip.origin} → ` : ""}
              {trip.stopover ? `${trip.stopover} → ` : ""}
              {trip.destination}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {trip.destination}
            </h1>
            <span
              className={`inline-block mt-3 text-xs font-semibold px-3 py-1 rounded-full ${
                STATUS_STYLES[trip.status] || STATUS_STYLES.draft
              }`}
            >
              {labelFor(TRIP_STATUSES, trip.status)}
            </span>
          </div>

          <div className="flex gap-2 shrink-0">
            <Link
              to={`/trips/${tripId}/map`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-white/15 hover:bg-white/25 backdrop-blur-sm transition cursor-pointer"
            >
              <MapPin className="w-4 h-4" /> Map
            </Link>
            <Link
              to={`/trips/${tripId}/budget`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-white/15 hover:bg-white/25 backdrop-blur-sm transition cursor-pointer"
            >
              <Wallet className="w-4 h-4" /> Budget
            </Link>
            <Link
              to={`/trips/${tripId}/edit`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-white/15 hover:bg-white/25 backdrop-blur-sm transition cursor-pointer"
            >
              <Pencil className="w-4 h-4" /> Edit
            </Link>
            <button
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-white/15 hover:bg-red-500 backdrop-blur-sm transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* Two-column layout: info cards (left) · AI itinerary & assistant (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 items-start">
        {/* Left column: info cards (1/3) */}
        <div className="lg:col-span-1 space-y-6">
      {/* Key facts */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-4">
        <InfoTile
          icon={Calendar}
          label="Dates"
          value={`${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`}
          sub={days != null ? `${days} ${days === 1 ? "day" : "days"}` : null}
        />
        <InfoTile
          icon={Users}
          label="Travellers"
          value={`${trip.travellers} ${
            trip.travellers === 1 ? "person" : "people"
          }`}
          sub={hasBreakdown ? null : travellerSub}
        >
          {hasBreakdown && (
            <div className="mt-3 space-y-2">
              {[
                { key: "adults", label: "Adults", group: comp?.adults, total: adultsTotal },
                { key: "children", label: "Children", group: comp?.children, total: childrenTotal },
              ]
                .filter((row) => row.total > 0)
                .map((row) => (
                  <div key={row.key}>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {row.label}{" "}
                      <span className="font-normal text-slate-400">({row.total})</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {["male", "female", "other"]
                        .filter((gn) => (row.group?.[gn] || 0) > 0)
                        .map((gn) => (
                          <span
                            key={gn}
                            className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium dark:bg-slate-800 dark:text-slate-300"
                          >
                            {genderLabel[gn]}: {row.group[gn]}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </InfoTile>
        <InfoTile
          icon={Wallet}
          label="Budget"
          value={money || "Not set"}
          sub={
            money
              ? isPerHead
                ? `Per head · ${formatMoney(budgetTotal, trip.currency)} total`
                : "Overall"
              : null
          }
        />
        {trip.origin && (
          <InfoTile icon={MapPin} label="Origin" value={trip.origin} />
        )}
        {trip.stopover && (
          <InfoTile icon={MapPin} label="Halt / Stopover" value={trip.stopover} />
        )}
        <InfoTile
          icon={Compass}
          label="Travel style"
          value={labelFor(TRAVEL_STYLES, trip.travelStyle)}
        />
        <InfoTile
          icon={Gauge}
          label="Pace"
          value={labelFor(TRAVEL_PACES, trip.travelPace)}
        />
      </div>

      {/* Interests */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 dark:bg-slate-900 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3 dark:text-slate-200">
          <Sparkles className="w-4 h-4 text-indigo-500" /> Interests
        </h2>
        {trip.interests?.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {trip.interests.map((i) => (
              <span
                key={i}
                className="text-sm px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium dark:bg-indigo-500/15 dark:text-indigo-300"
              >
                {i}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No interests added yet.</p>
        )}
      </div>
        </div>
        {/* End left column */}

        {/* Right column: AI itinerary (2/3). Fixed height so the itinerary
            card owns its own internal scroll (fixed header + footer). */}
        <div className="lg:col-span-2 lg:sticky lg:top-6 h-[70vh] lg:h-[calc(100vh-3rem)]">
          <ItinerarySection
            tripId={tripId}
            onOpenAssistant={() => setAssistantOpen(true)}
            onTripRefresh={load}
          />
        </div>
        {/* End right column */}
      </div>

      {/* Trip Assistant — hidden until opened from the itinerary footer. */}
      <ChatPanel
        tripId={tripId}
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
      />

      <p className="text-xs text-slate-400 mt-6">
        Created {formatDate(trip.createdAt)} · Last updated{" "}
        {formatDate(trip.updatedAt)}
      </p>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete this trip?"
        message={`"${trip.destination}" will be permanently removed. This action cannot be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete trip"}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
};

const InfoTile = ({ icon: Icon, label, value, sub, children }) => (
  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 dark:bg-slate-900 dark:border-slate-800">
    <div className="flex items-center gap-2 text-slate-400 mb-2">
      <Icon className="w-4 h-4" />
      <span className="text-xs font-semibold uppercase tracking-wide">
        {label}
      </span>
    </div>
    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    {children}
  </div>
);

export default TripDetails;
