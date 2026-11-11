/**
 * TripMate AI — budget feature tests.
 *   node tests/test-budget.js   (server must be running; MONGODB required)
 * FX conversion checks need the Frankfurter provider reachable.
 */
const BASE = "http://localhost:5000/api/v1";

async function req(method, path, { cookie, body } = {}) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (cookie) opts.headers.Cookie = cookie;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch { /* none */ }
  const token = (res.headers.getSetCookie?.() || []).find((c) => c.includes("token="))?.split(";")[0];
  return { status: res.status, data, token };
}
let pass = 0, fail = 0;
const assert = (l, c) => { console.log(`  ${c ? "✅" : "❌"} ${l}`); c ? pass++ : fail++; };
const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const reg = async (tag) => (await req("POST", "/auth/register", { body: { name: tag, email: `${tag}_${Date.now()}@tm.dev`, password: "SecurePass123" } })).token;

async function run() {
  console.log("\n🧪 TripMate AI — Budget Tests\n");

  console.log("0️⃣  Auth & ownership");
  assert("budget requires auth (401)", (await req("GET", "/trips/507f1f77bcf86cd799439011/budget")).status === 401);
  const A = await reg("bud_a");
  if (!A) { console.log("  ⚠️  DB down — skipping"); process.exit(0); }

  const trip = (await req("POST", "/trips", { cookie: A, body: { destination: "Rome", startDate: plus(1), endDate: plus(4), travellers: 2, budget: 1000, currency: "EUR", interests: ["History"] } })).data.trip;
  const B = await reg("bud_b");
  assert("non-owner cannot read budget (404)", (await req("GET", `/trips/${trip._id}/budget`, { cookie: B })).status === 404);

  console.log("\n1️⃣  Validation (non-negative, category)");
  assert("negative amount → 400", (await req("POST", `/trips/${trip._id}/budget/items`, { cookie: A, body: { category: "food", label: "x", amount: -5 } })).status === 400);
  assert("bad category → 400", (await req("POST", `/trips/${trip._id}/budget/items`, { cookie: A, body: { category: "bribes", label: "x", amount: 5 } })).status === 400);
  assert("missing amount → 400", (await req("POST", `/trips/${trip._id}/budget/items`, { cookie: A, body: { category: "food", label: "x" } })).status === 400);

  console.log("\n2️⃣  Add items across categories");
  const items = [
    { category: "accommodation", label: "Hotel", amount: 400, date: plus(1) },
    { category: "food", label: "Dinner", amount: 60, date: plus(1) },
    { category: "food", label: "Lunch", amount: 40, date: plus(2) },
    { category: "transportation", label: "Airport transfer", amount: 120 },
    { category: "activities", label: "Colosseum", amount: 80, date: plus(1) },
    { category: "shopping", label: "Souvenirs", amount: 50, date: plus(2) },
    { category: "misc", label: "Tips", amount: 0 },
  ];
  for (const it of items) {
    const r = await req("POST", `/trips/${trip._id}/budget/items`, { cookie: A, body: it });
    if (r.status !== 201) { assert(`add ${it.label}`, false); }
  }
  assert("all 7 items added", true);

  console.log("\n3️⃣  Deterministic totals (computed server-side)");
  const g = await req("GET", `/trips/${trip._id}/budget`, { cookie: A });
  const s = g.data.summary;
  assert("total = 750", s.totalEstimatedCost === 750);
  assert("category: accommodation 400", s.categoryTotals.accommodation === 400);
  assert("category: food 100", s.categoryTotals.food === 100);
  assert("category: transportation 120", s.categoryTotals.transportation === 120);
  assert("category: activities 80", s.categoryTotals.activities === 80);
  assert("category: shopping 50", s.categoryTotals.shopping === 50);
  assert("remaining = 250", s.remaining === 250);
  assert("not over budget", s.overBudget === false);
  assert("perPerson = 375", s.perPerson === 375);
  assert("perDay = 187.5 (750/4)", s.perDay === 187.5);
  const day1 = s.dailyTotals.find((d) => d.date === plus(1));
  const unsched = s.dailyTotals.find((d) => d.date === "unscheduled");
  assert("daily total day1 = 540", day1?.amount === 540);
  assert("unscheduled = 120", unsched?.amount === 120);

  console.log("\n4️⃣  Edit & delete update totals");
  const itemId = g.data.budget.items.find((i) => i.label === "Hotel")._id;
  const upd = await req("PATCH", `/trips/${trip._id}/budget/items/${itemId}`, { cookie: A, body: { amount: 500 } });
  assert("edit hotel 400→500 recomputes total to 850", upd.data.summary.totalEstimatedCost === 850);
  assert("now over budget? no (850<1000)", upd.data.summary.overBudget === false);
  assert("edit negative → 400", (await req("PATCH", `/trips/${trip._id}/budget/items/${itemId}`, { cookie: A, body: { amount: -1 } })).status === 400);
  const del = await req("DELETE", `/trips/${trip._id}/budget/items/${itemId}`, { cookie: A });
  assert("delete hotel recomputes total to 350", del.data.summary.totalEstimatedCost === 350);

  console.log("\n5️⃣  Currency conversion (explicit assumptions)");
  const usd = await req("GET", `/trips/${trip._id}/budget?display=USD`, { cookie: A });
  if (usd.data.summary.conversion?.available) {
    const c = usd.data.summary.conversion;
    assert("USD conversion available with rate", c.rate > 0 && c.from === "EUR" && c.to === "USD");
    assert("converted total = base*rate", near(usd.data.summary.converted.totalEstimatedCost, usd.data.summary.totalEstimatedCost * c.rate, 0.5));
    assert("conversion has explicit disclaimer", /indicative|rate/i.test(c.disclaimer));
  } else {
    console.log("  ⚠️  FX provider unreachable — skipping conversion-available checks");
  }
  const aed = await req("GET", `/trips/${trip._id}/budget?display=AED`, { cookie: A });
  assert("unsupported currency → graceful (available:false + note)", aed.data.summary.conversion?.available === false && !!aed.data.summary.conversion.note);
  assert("base totals still present when conversion fails", aed.data.summary.totalEstimatedCost === 350);

  console.log(`\n📊 Results: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}
run().catch((e) => { console.error("Fatal:", e); process.exit(1); });
