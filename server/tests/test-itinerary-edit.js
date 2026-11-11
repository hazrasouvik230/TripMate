/**
 * TripMate AI — Itinerary edit / reorder / delete / regenerate-day tests
 *
 * Auth + validation run without a key; the edit/regenerate correctness checks
 * need GEMINI_API_KEY (to first generate an itinerary).
 *
 * Run (server must be running):  node tests/test-itinerary-edit.js
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
  const token = (res.headers.getSetCookie?.() || [])
    .find((c) => c.includes("token="))
    ?.split(";")[0];
  return { status: res.status, data, token };
}

let pass = 0,
  fail = 0;
const assert = (l, c) => {
  console.log(`  ${c ? "✅" : "❌"} ${l}`);
  c ? pass++ : fail++;
};

const register = async () => {
  const email = `edit_${Date.now()}_${Math.random().toString(36).slice(2)}@tm.dev`;
  const r = await req("POST", "/auth/register", {
    body: { name: "Editor", email, password: "SecurePass123" },
  });
  return r.token;
};

// Strip server-owned fields to build a PATCH payload from an itinerary's days.
const toEditable = (days) =>
  days.map((d) => ({
    dayNumber: d.dayNumber,
    summary: d.summary,
    morning: d.morning,
    afternoon: d.afternoon,
    evening: d.evening,
    food: d.food,
    transportation: d.transportation,
    tips: d.tips,
  }));

const sumDay = (d) =>
  [d.morning, d.afternoon, d.evening]
    .filter(Boolean)
    .reduce((s, a) => s + (a.estimatedCost || 0), 0) +
  (d.food || []).reduce((s, f) => s + (f.estimatedCost || 0), 0);

async function run() {
  console.log("\n🧪 TripMate AI — Itinerary Edit Tests\n");

  console.log("0️⃣  Auth & validation");
  assert(
    "PATCH requires auth (401)",
    (await req("PATCH", "/ai/itinerary/507f1f77bcf86cd799439011", { body: { days: [] } })).status === 401
  );

  const A = await register();
  if (!A) {
    console.log("  ⚠️  DB down — skipping");
    process.exit(0);
  }
  assert(
    "PATCH bad id → 400",
    (await req("PATCH", "/ai/itinerary/not-an-id", { cookie: A, body: { days: [{ dayNumber: 1 }] } })).status === 400
  );
  assert(
    "PATCH empty days → 400",
    (await req("PATCH", "/ai/itinerary/507f1f77bcf86cd799439011", { cookie: A, body: { days: [] } })).status === 400
  );
  assert(
    "PATCH unknown field (strict) → 400",
    (await req("PATCH", "/ai/itinerary/507f1f77bcf86cd799439011", { cookie: A, body: { days: [{ dayNumber: 1 }], estimatedTotalCost: 999 } })).status === 400
  );
  assert(
    "PATCH negative cost → 400",
    (await req("PATCH", "/ai/itinerary/507f1f77bcf86cd799439011", {
      cookie: A,
      body: { days: [{ dayNumber: 1, morning: { name: "x", durationMinutes: 10, estimatedCost: -5 } }] },
    })).status === 400
  );
  assert(
    "PATCH non-existent itinerary → 404",
    (await req("PATCH", "/ai/itinerary/507f1f77bcf86cd799439011", { cookie: A, body: { days: [{ dayNumber: 1 }] } })).status === 404
  );

  // Need a trip + generated itinerary for the rest.
  const trip = (
    await req("POST", "/trips", {
      cookie: A,
      body: {
        destination: "Barcelona",
        startDate: "2027-09-01",
        endDate: "2027-09-03",
        travellers: 2,
        currency: "EUR",
        interests: ["Food & Dining", "Art & Culture"],
      },
    })
  ).data.trip;

  console.log("\n1️⃣  Generate base itinerary  [needs GEMINI_API_KEY]");
  const gen = await req("POST", "/ai/generate-itinerary", { cookie: A, body: { tripId: trip._id } });
  if (gen.status === 503) {
    console.log("  ⚠️  GEMINI_API_KEY not set — skipping edit/regenerate checks");
    console.log(`\n📊 ${pass} passed, ${fail} failed (live skipped)\n`);
    process.exit(fail > 0 ? 1 : 0);
  }
  assert("generate 201", gen.status === 201);
  const itin = gen.data.itinerary;
  const itinId = itin._id;

  // ---- Edit + reorder + delete ----
  console.log("\n2️⃣  Edit / reorder / delete persist with server-recomputed totals");
  const days = toEditable(itin.days);
  // Edit: change day 1 morning cost + name.
  days[0].morning = { ...days[0].morning, name: "Custom Museum Visit", estimatedCost: 42 };
  // Reorder: swap morning/afternoon on day 1.
  const tmp = days[0].morning;
  days[0].morning = days[0].afternoon;
  days[0].afternoon = tmp;
  // Delete: remove evening on day 2.
  days[1].evening = null;

  const upd = await req("PATCH", `/ai/itinerary/${itinId}`, { cookie: A, body: { days } });
  assert("PATCH 200", upd.status === 200);
  const u = upd.data.itinerary;
  assert("day 2 evening deleted (null)", u.days[1].evening == null);
  assert("edited activity persisted (afternoon = Custom Museum Visit @42)", u.days[0].afternoon?.name === "Custom Museum Visit" && u.days[0].afternoon?.estimatedCost === 42);
  assert("dates & dayNumbers preserved", u.days.every((d, i) => d.dayNumber === i + 1 && d.date.slice(0, 10) === itin.days[i].date.slice(0, 10)));
  const totalsOk = u.days.every((d) => Math.abs(sumDay(d) - d.estimatedDayCost) < 0.011);
  assert("server recomputed each day cost", totalsOk);
  assert(
    "server recomputed grand total",
    Math.abs(u.days.reduce((s, d) => s + d.estimatedDayCost, 0) - u.estimatedTotalCost) < 0.02
  );
  assert("version unchanged by edit", u.version === itin.version);

  // ---- Ownership ----
  console.log("\n3️⃣  Ownership");
  const B = await register();
  assert("another user cannot PATCH (404)", (await req("PATCH", `/ai/itinerary/${itinId}`, { cookie: B, body: { days } })).status === 404);
  assert("another user cannot regenerate day (404)", (await req("POST", `/ai/itinerary/${itinId}/day/1/regenerate`, { cookie: B })).status === 404);

  // ---- Regenerate single day ----
  console.log("\n4️⃣  Regenerate single day");
  const before = u.days[1];
  const rd = await req("POST", `/ai/itinerary/${itinId}/day/2/regenerate`, { cookie: A });
  assert("regenerate day 200", rd.status === 200);
  const r = rd.data.itinerary;
  assert("day 2 number & date preserved", r.days[1].dayNumber === 2 && r.days[1].date.slice(0, 10) === before.date.slice(0, 10));
  assert("day 2 has fresh morning/afternoon/evening", !!(r.days[1].morning?.name && r.days[1].afternoon?.name && r.days[1].evening?.name));
  assert("day 1 unchanged (date)", r.days[0].date.slice(0, 10) === u.days[0].date.slice(0, 10));
  assert("totals recomputed after regenerate", Math.abs(r.days.reduce((s, d) => s + d.estimatedDayCost, 0) - r.estimatedTotalCost) < 0.02);
  assert("bad day number → 404", (await req("POST", `/ai/itinerary/${itinId}/day/99/regenerate`, { cookie: A })).status === 404);

  console.log(`\n📊 Results: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
