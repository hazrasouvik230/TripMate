/**
 * TripMate AI — places / routes / weather endpoint tests (live providers).
 *   node tests/test-geo.js   (server must be running)
 */
const BASE = "http://localhost:5000/api/v1";

async function req(method, path, { cookie, body } = {}) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (cookie) opts.headers.Cookie = cookie;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* none */
  }
  const token = (res.headers.getSetCookie?.() || []).find((c) => c.includes("token="))?.split(";")[0];
  return { status: res.status, data, token };
}
let pass = 0, fail = 0;
const assert = (l, c) => { console.log(`  ${c ? "✅" : "❌"} ${l}`); c ? pass++ : fail++; };
const plusDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function run() {
  console.log("\n🧪 TripMate AI — Geo (places/routes/weather) Tests\n");

  console.log("0️⃣  Auth & validation");
  assert("search requires auth (401)", (await req("GET", "/places/search?q=x")).status === 401);
  const A = (await req("POST", "/auth/register", { body: { name: "Geo", email: `geo_${Date.now()}@tm.dev`, password: "SecurePass123" } })).token;
  if (!A) { console.log("  ⚠️  DB down — skipping"); process.exit(0); }
  assert("missing q → 400", (await req("GET", "/places/search", { cookie: A })).status === 400);
  assert("bad placeId → 400", (await req("GET", "/places/details?placeId=bad", { cookie: A })).status === 400);
  assert("<2 waypoints → 400", (await req("POST", "/routes/estimate", { cookie: A, body: { waypoints: [{ lat: 1, lon: 1 }] } })).status === 400);
  assert("bad lat → 400", (await req("GET", "/weather/forecast?lat=999&lon=0", { cookie: A })).status === 400);

  console.log("\n1️⃣  Places search (live)");
  const s = await req("GET", "/places/search?q=museums&near=Rome&limit=3", { cookie: A });
  if (s.status === 502 || s.status === 503 || s.status === 504) {
    console.log("  ⚠️  Provider unreachable — skipping live geo checks:", s.data?.message);
    console.log(`\n📊 ${pass} passed, ${fail} failed (live skipped)\n`);
    process.exit(fail > 0 ? 1 : 0);
  }
  assert("returns 200", s.status === 200);
  assert("source = api (verified live)", s.data.source === "api");
  assert("has results with coordinates", s.data.results.length > 0 && Number.isFinite(s.data.results[0].coordinates.lat));
  const place = s.data.results[0];
  console.log(`     ↳ ${s.data.results.map((r) => r.name).slice(0, 3).join(" | ")}`);

  // cache on repeat
  const s2 = await req("GET", "/places/search?q=museums&near=Rome&limit=3", { cookie: A });
  assert("repeat search served from cache", s2.data.source === "cache");

  console.log("\n2️⃣  Place details (live)");
  const det = await req("GET", `/places/details?placeId=${encodeURIComponent(place.id)}`, { cookie: A });
  assert("returns 200 with coordinates", det.status === 200 && Number.isFinite(det.data.place.coordinates.lat));

  console.log("\n3️⃣  Route estimate (live)");
  // Rome: Colosseum → Vatican, roughly.
  const rt = await req("POST", "/routes/estimate", {
    cookie: A,
    body: { waypoints: [{ lat: 41.8902, lon: 12.4922 }, { lat: 41.9029, lon: 12.4534 }], profile: "driving" },
  });
  assert("returns 200", rt.status === 200);
  assert("distance > 0 and duration > 0", rt.data.distanceMeters > 0 && rt.data.durationSeconds > 0);
  assert("source = api", rt.data.source === "api");
  console.log(`     ↳ ${(rt.data.distanceMeters / 1000).toFixed(1)} km, ~${Math.round(rt.data.durationSeconds / 60)} min`);

  console.log("\n4️⃣  Weather forecast (live)");
  const w = await req("GET", `/weather/forecast?lat=41.9&lon=12.5&startDate=${plusDays(1)}&endDate=${plusDays(4)}`, { cookie: A });
  assert("returns 200", w.status === 200);
  assert("inForecastRange = true for near dates", w.data.inForecastRange === true);
  assert("has daily forecast with temps + condition", w.data.days.length > 0 && w.data.days[0].condition && Number.isFinite(w.data.days[0].tempMaxC));
  console.log(`     ↳ ${w.data.days.map((d) => `${d.date}:${d.condition} ${d.tempMaxC}°`).slice(0, 3).join(" | ")}`);

  // Beyond forecast horizon → honest unavailable
  const wFar = await req("GET", `/weather/forecast?lat=41.9&lon=12.5&startDate=${plusDays(60)}&endDate=${plusDays(63)}`, { cookie: A });
  assert("far-future dates → inForecastRange false + note", wFar.data.inForecastRange === false && !!wFar.data.note);

  console.log(`\n📊 Results: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}
run().catch((e) => { console.error("Fatal:", e); process.exit(1); });
