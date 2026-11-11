import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  ArrowLeft,
  Search,
  Route as RouteIcon,
  Loader2,
  AlertCircle,
  MapPin,
  CloudSun,
} from "lucide-react";
import { getTrip } from "../../services/trips";
import { getItinerary } from "../../services/ai";
import { searchPlaces, estimateRoute, weatherForecast } from "../../services/geo";
import { LoadingState, ErrorState } from "../../components/ui/States";

/* Colour markers/badges by data provenance. */
const SOURCE_STYLE = {
  api: { color: "#059669", label: "Verified (live API)" },
  cache: { color: "#d97706", label: "Cached (recent API)" },
  search: { color: "#4f46e5", label: "Search result" },
};
const Badge = ({ source }) => {
  const s = SOURCE_STYLE[source] || SOURCE_STYLE.search;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
      style={{ color: s.color, backgroundColor: `${s.color}1a` }}
    >
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
      {s.label}
    </span>
  );
};

// Imperatively recenter the map when the center changes.
const Recenter = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.lat, center.lon], map.getZoom());
  }, [center, map]);
  return null;
};

const MapPage = () => {
  const { tripId } = useParams();

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [center, setCenter] = useState(null); // {lat,lon}
  const [markers, setMarkers] = useState([]); // {id,name,coordinates,source,category}
  const [weather, setWeather] = useState(null); // {source, days}
  const [route, setRoute] = useState(null); // {distanceMeters,durationSeconds,geometry,source}

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [routing, setRouting] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const tData = await getTrip(tripId);
      const t = tData.trip;
      setTrip(t);

      // Prefer the itinerary's verified enrichment (coordinates/places/weather).
      let enrichment = null;
      try {
        const it = await getItinerary(tripId);
        enrichment = it.itinerary?.enrichment || null;
      } catch {
        /* no itinerary yet */
      }

      let c = enrichment?.coordinates || null;
      const initialMarkers = [];
      if (enrichment?.places?.length) {
        const src = enrichment.placesSource || "api";
        enrichment.places.forEach((p) =>
          initialMarkers.push({ ...p, source: src })
        );
      }

      // Fallback: geocode the destination if no verified coordinates.
      if (!c) {
        try {
          const r = await searchPlaces(t.destination, undefined, 1);
          if (r.results?.[0]) {
            c = r.results[0].coordinates;
            initialMarkers.push({ ...r.results[0], source: r.source });
          }
        } catch {
          /* ignore */
        }
      }
      setCenter(c);
      setMarkers(initialMarkers);

      // Weather: verified enrichment first, else fetch for the center.
      if (enrichment?.weather?.length) {
        setWeather({ source: "api", days: enrichment.weather });
      } else if (c) {
        try {
          const w = await weatherForecast(
            c.lat,
            c.lon,
            t.startDate?.slice(0, 10),
            t.endDate?.slice(0, 10)
          );
          setWeather({ source: w.source, days: w.days, inRange: w.inForecastRange, note: w.note });
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      setError(err.message || "Failed to load map");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  const runSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim() || searching) return;
    setSearching(true);
    setNotice("");
    try {
      const r = await searchPlaces(query.trim(), trip.destination, 6);
      setSearchResults(r.results.map((x) => ({ ...x, source: r.source })));
      if (r.results.length === 0) setNotice("No places found for that search.");
    } catch (err) {
      setNotice(err.message || "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const addMarker = (place) => {
    if (markers.some((m) => m.id === place.id)) return;
    setMarkers((m) => [...m, place]);
    setCenter(place.coordinates);
    setRoute(null); // invalidate stale route
  };

  const estimate = async () => {
    if (markers.length < 2 || routing) return;
    setRouting(true);
    setNotice("");
    try {
      const waypoints = markers.map((m) => ({ lat: m.coordinates.lat, lon: m.coordinates.lon }));
      const r = await estimateRoute(waypoints, "walking", true);
      setRoute(r);
    } catch (err) {
      setNotice(err.message || "Could not estimate a route.");
    } finally {
      setRouting(false);
    }
  };

  if (loading)
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <LoadingState label="Loading map…" />
      </section>
    );
  if (error)
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <ErrorState message={error} onRetry={load} />
      </section>
    );

  const polyline = route?.geometry?.coordinates?.map(([lon, lat]) => [lat, lon]);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <Link
        to={`/trips/${tripId}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600 transition mb-4 dark:text-slate-400 dark:hover:text-indigo-400"
      >
        <ArrowLeft className="w-4 h-4" /> Back to trip
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {trip.destination} — Map
          </h1>
          <p className="text-slate-500 mt-1 text-sm dark:text-slate-400">
            Verified coordinates, attraction markers, and route estimates from live map data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge source="api" />
          <Badge source="cache" />
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-400" /> AI estimates (itinerary text/costs)
          </span>
        </div>
      </div>

      {!center ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center dark:bg-slate-900 dark:border-slate-800">
          <MapPin className="w-10 h-10 text-slate-300 mx-auto mb-3 dark:text-slate-600" />
          <p className="text-slate-500 dark:text-slate-400">
            We couldn't locate this destination on the map. Try generating an
            itinerary first, or search for a place below.
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Map */}
          <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-slate-200 shadow-sm h-[60vh] lg:h-[70vh] dark:border-slate-800">
            <MapContainer
              center={[center.lat, center.lon]}
              zoom={13}
              scrollWheelZoom
              style={{ height: "100%", width: "100%" }}
            >
              <Recenter center={center} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {markers.map((m, i) => (
                <CircleMarker
                  key={m.id || i}
                  center={[m.coordinates.lat, m.coordinates.lon]}
                  radius={9}
                  pathOptions={{
                    color: (SOURCE_STYLE[m.source] || SOURCE_STYLE.search).color,
                    fillOpacity: 0.7,
                  }}
                >
                  <Popup>
                    <strong>{m.name}</strong>
                    <br />
                    <span style={{ fontSize: 11 }}>
                      {m.coordinates.lat.toFixed(4)}, {m.coordinates.lon.toFixed(4)}
                    </span>
                    <br />
                    <span style={{ fontSize: 11, color: "#64748b" }}>
                      {(SOURCE_STYLE[m.source] || SOURCE_STYLE.search).label}
                    </span>
                  </Popup>
                </CircleMarker>
              ))}
              {polyline?.length > 1 && (
                <Polyline positions={polyline} pathOptions={{ color: "#4f46e5", weight: 4, opacity: 0.8 }} />
              )}
            </MapContainer>
          </div>

          {/* Side panel */}
          <div className="space-y-5">
            {notice && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-sm dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{notice}</span>
              </div>
            )}

            {/* Route estimate */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <RouteIcon className="w-4 h-4 text-indigo-600" /> Route estimate
                </h2>
                <button
                  onClick={estimate}
                  disabled={markers.length < 2 || routing}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {routing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RouteIcon className="w-3.5 h-3.5" />}
                  Walking route
                </button>
              </div>
              {route ? (
                <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {(route.distanceMeters / 1000).toFixed(1)} km
                  </span>{" "}
                  · ~{Math.round(route.durationSeconds / 60)} min walking across {markers.length} stops
                  <div className="mt-1"><Badge source={route.source} /></div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-400">
                  Add at least two markers, then estimate a walking route between them.
                </p>
              )}
            </div>

            {/* Weather */}
            {weather?.days?.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 dark:bg-slate-900 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <CloudSun className="w-4 h-4 text-amber-500" /> Forecast
                  </h2>
                  <Badge source={weather.source} />
                </div>
                <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
                  {weather.days.slice(0, 7).map((d) => (
                    <li key={d.date} className="flex justify-between gap-2">
                      <span className="text-slate-500">{d.date}</span>
                      <span>{d.condition}</span>
                      <span className="text-slate-400">
                        {d.tempMinC}–{d.tempMaxC}°C
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Place search */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 dark:bg-slate-900 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Find attractions</h2>
              <form onSubmit={runSearch} className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. museums, parks…"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                />
                <button
                  type="submit"
                  disabled={searching || !query.trim()}
                  className="flex items-center justify-center w-10 h-10 rounded-xl text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 transition cursor-pointer shrink-0"
                  aria-label="Search"
                >
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </form>
              {searchResults.length > 0 && (
                <ul className="mt-3 space-y-1.5 max-h-56 overflow-y-auto">
                  {searchResults.map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => addMarker(r)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-50 transition cursor-pointer dark:hover:bg-indigo-500/10"
                      >
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{r.name}</span>
                        <span className="block text-[11px] text-slate-400">
                          {r.coordinates.lat.toFixed(3)}, {r.coordinates.lon.toFixed(3)} · tap to add
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Marker list */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 dark:bg-slate-900 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                Markers ({markers.length})
              </h2>
              {markers.length === 0 ? (
                <p className="text-xs text-slate-400">No markers yet — search to add some.</p>
              ) : (
                <ul className="space-y-1.5">
                  {markers.map((m, i) => (
                    <li key={m.id || i} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-slate-700 truncate dark:text-slate-300">{m.name}</span>
                      <Badge source={m.source} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default MapPage;
