/**
 * TripMate AI — Itinerary generation integration tests
 *
 * Covers auth/validation/ownership (no LLM) and, when GEMINI_API_KEY is set,
 * real generation across several trip scenarios with server-side verification
 * of dates, non-negative costs, JS-computed totals, and versioning.
 *
 * Run (server must be running):
 *   node tests/test-itinerary.js
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
    /* no body */
  }
  const token = (res.headers.getSetCookie?.() || [])
    .find((c) => c.includes("token="))
    ?.split(";")[0];
  return { status: res.status, data, token };
}

let pass = 0;
let fail = 0;
const assert = (label, cond) => {
  console.log(`  ${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const register = async () => {
  const email = `itin_${Date.now()}_${Math.random().toString(36).slice(2)}@tripmate.dev`;
  const r = await req("POST", "/auth/register", {
    body: { name: "Itin Tester", email, password: "SecurePass123" },
  });
  return r.token;
};

const makeTrip = (cookie, overrides) =>
  req("POST", "/trips", {
    cookie,
    body: {
      destination: "Rome",
      startDate: "2027-03-01",
      endDate: "2027-03-03",
      travellers: 2,
      currency: "EUR",
      interests: ["Food & Dining", "History"],
      travelStyle: "balanced",
      travelPace: "moderate",
      ...overrides,
    },
  });

const daysBetween = (a, b) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

// Server-side re-verification of a generated itinerary.
function verifyItinerary(label, itin, trip, expectedDays) {
  assert(`${label}: days length = ${expectedDays}`, itin.days.length === expectedDays);

  const start = trip.startDate.slice(0, 10);
  assert(`${label}: day 1 date = trip start`, itin.days[0].date.slice(0, 10) === start);

  // Dates sequential and within trip window.
  let datesOk = true;
  let costsNonNeg = true;
  let dayTotalsOk = true;
  let runningTotal = 0;
  itin.days.forEach((d, i) => {
    const expected = new Date(Date.parse(start + "T00:00:00Z") + i * 86400000)
      .toISOString()
      .slice(0, 10);
    if (d.date.slice(0, 10) !== expected) datesOk = false;
    if (d.dayNumber !== i + 1) datesOk = false;

    const acts = [d.morning, d.afternoon, d.evening].filter(Boolean);
    for (const a of acts) if ((a.estimatedCost ?? 0) < 0) costsNonNeg = false;
    for (const f of d.food || []) if ((f.estimatedCost ?? 0) < 0) costsNonNeg = false;

    const sum =
      acts.reduce((s, a) => s + (a.estimatedCost || 0), 0) +
      (d.food || []).reduce((s, f) => s + (f.estimatedCost || 0), 0);
    if (Math.abs(sum - d.estimatedDayCost) > 0.011) dayTotalsOk = false;
    runningTotal += d.estimatedDayCost;
  });
  assert(`${label}: dates sequential & day numbers correct`, datesOk);
  assert(`${label}: last date within trip end`, itin.days.at(-1).date.slice(0, 10) <= trip.endDate.slice(0, 10));
  assert(`${label}: all costs non-negative`, costsNonNeg);
  assert(`${label}: day totals = sum of activity+food costs`, dayTotalsOk);
  assert(
    `${label}: estimatedTotalCost = sum of day costs (JS)`,
    Math.abs(runningTotal - itin.estimatedTotalCost) < 0.02
  );
  assert(`${label}: currency matches trip`, itin.currency === trip.currency);
  assert(`${label}: has disclaimer`, typeof itin.disclaimer === "string" && itin.disclaimer.length > 20);
  // Each day has the required structure.
  const structured = itin.days.every(
    (d) => d.morning?.name && d.afternoon?.name && d.evening?.name && Array.isArray(d.tips)
  );
  assert(`${label}: every day has morning/afternoon/evening + tips`, structured);
}

async function run() {
  console.log("\n🧪 TripMate AI — Itinerary Tests\n");

  // ---- Auth + validation (no LLM) ----
  console.log("0️⃣  Auth & validation");
  assert("POST generate requires auth (401)", (await req("POST", "/ai/generate-itinerary", { body: { tripId: "x" } })).status === 401);

  const A = await register();
  if (!A) {
    console.log("  ⚠️  Could not register (DB down?) — skipping");
    console.log(`\n📊 ${pass} passed, ${fail} failed (skipped)\n`);
    process.exit(fail > 0 ? 1 : 0);
  }
  assert("bad tripId → 400", (await req("POST", "/ai/generate-itinerary", { cookie: A, body: { tripId: "not-an-id" } })).status === 400);
  assert("missing tripId → 400", (await req("POST", "/ai/generate-itinerary", { cookie: A, body: {} })).status === 400);
  assert("non-existent trip → 404", (await req("POST", "/ai/generate-itinerary", { cookie: A, body: { tripId: "507f1f77bcf86cd799439011" } })).status === 404);

  // ---- Ownership (no LLM needed if it 404s before generating) ----
  console.log("\n1️⃣  Ownership");
  const tripAres = await makeTrip(A, {});
  const tripA = tripAres.data.trip;
  const B = await register();
  assert("another user cannot generate for A's trip (404)", (await req("POST", "/ai/generate-itinerary", { cookie: B, body: { tripId: tripA._id } })).status === 404);
  assert("another user cannot read A's itinerary (404)", (await req("GET", `/ai/itinerary/${tripA._id}`, { cookie: B })).status === 404);
  assert("no itinerary yet → 404", (await req("GET", `/ai/itinerary/${tripA._id}`, { cookie: A })).status === 404);

  // ---- Live generation ----
  console.log("\n2️⃣  Generate (3-day trip)  [needs GEMINI_API_KEY]");
  const gen = await req("POST", "/ai/generate-itinerary", { cookie: A, body: { tripId: tripA._id } });
  if (gen.status === 503) {
    console.log("  ⚠️  GEMINI_API_KEY not set — skipping live generation");
    console.log(`\n📊 ${pass} passed, ${fail} failed (live skipped)\n`);
    process.exit(fail > 0 ? 1 : 0);
  }
  assert("returns 201", gen.status === 201);
  assert("version 1", gen.data?.itinerary?.version === 1);
  if (gen.data?.itinerary) verifyItinerary("3-day", gen.data.itinerary, tripA, daysBetween(tripA.startDate, tripA.endDate));

  // GET latest returns it
  const got = await req("GET", `/ai/itinerary/${tripA._id}`, { cookie: A });
  assert("GET latest returns 200", got.status === 200);
  assert("GET latest is version 1", got.data?.itinerary?.version === 1);

  // Regenerate → version 2
  console.log("\n3️⃣  Regenerate increments version");
  const gen2 = await req("POST", "/ai/generate-itinerary", { cookie: A, body: { tripId: tripA._id } });
  assert("returns 201", gen2.status === 201);
  assert("version 2", gen2.data?.itinerary?.version === 2);
  assert("GET latest now version 2", (await req("GET", `/ai/itinerary/${tripA._id}`, { cookie: A })).data?.itinerary?.version === 2);

  // ---- Scenario: 1-day trip ----
  console.log("\n4️⃣  1-day trip");
  const t1 = (await makeTrip(A, { destination: "Lisbon", startDate: "2027-05-10", endDate: "2027-05-10", currency: "USD", travellers: 1 })).data.trip;
  const g1 = await req("POST", "/ai/generate-itinerary", { cookie: A, body: { tripId: t1._id } });
  assert("returns 201", g1.status === 201);
  if (g1.data?.itinerary) verifyItinerary("1-day", g1.data.itinerary, t1, 1);

  // ---- Scenario: long trip capped ----
  console.log("\n5️⃣  Long trip (12 days → capped)");
  const t2 = (await makeTrip(A, { destination: "Tokyo", startDate: "2027-07-01", endDate: "2027-07-12", currency: "JPY", travellers: 3 })).data.trip;
  const g2 = await req("POST", "/ai/generate-itinerary", { cookie: A, body: { tripId: t2._id } });
  assert("returns 201", g2.status === 201);
  if (g2.data?.itinerary) {
    const capped = Math.min(12, g2.data.itinerary.days.length);
    verifyItinerary("long", g2.data.itinerary, t2, capped);
    assert("long: capped at <= 7 days", g2.data.itinerary.days.length <= 7);
    assert("long: has 'covers first N' note", /covers the first/i.test(g2.data.itinerary.notes || ""));
  }

  console.log(`\n📊 Results: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
