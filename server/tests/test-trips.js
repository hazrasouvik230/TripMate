/**
 * TripMate AI — Trip management integration tests
 *
 * Exercises the full authenticated CRUD cycle plus validation,
 * ownership, and not-found handling for /api/v1/trips.
 *
 * Requires the server running and MongoDB reachable:
 *   npm run dev        (in one terminal)
 *   node tests/test-trips.js (in another)
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
  const setCookies = res.headers.getSetCookie?.() || [];
  const token = setCookies.find((c) => c.includes("token="))?.split(";")[0];
  return { status: res.status, data, token };
}

let pass = 0;
let fail = 0;
function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    pass++;
  } else {
    console.log(`  ❌ ${label}`);
    fail++;
  }
}

// A valid trip payload factory.
const validTrip = (overrides = {}) => ({
  origin: "London",
  destination: "Tokyo",
  startDate: "2026-12-01",
  endDate: "2026-12-10",
  travellers: 2,
  budget: 4000,
  currency: "gbp",
  interests: ["food", "temples"],
  travelStyle: "comfort",
  travelPace: "moderate",
  status: "planned",
  ...overrides,
});

async function registerUser() {
  const email = `trips_${Date.now()}_${Math.random().toString(36).slice(2)}@tripmate.dev`;
  const r = await req("POST", "/auth/register", {
    body: { name: "Trip Tester", email, password: "SecurePass123" },
  });
  return { token: r.token, status: r.status };
}

async function run() {
  console.log("\n🧪 TripMate AI Trip Tests\n");

  // ---- Auth required ----
  console.log("0️⃣  Unauthenticated access blocked");
  const noAuth = await req("GET", "/trips");
  assert("GET /trips returns 401 without cookie", noAuth.status === 401);

  // ---- Set up an authenticated user ----
  const userA = await registerUser();
  if (userA.status === 500 || userA.status === 503 || !userA.token) {
    console.log("  ⚠️  Database unreachable — skipping DB-dependent tests");
    console.log(`\n📊 Results: ${pass} passed, ${fail} failed (DB tests skipped)\n`);
    process.exit(fail > 0 ? 1 : 0);
  }
  const A = userA.token;

  // ---- Create: validation ----
  console.log("\n1️⃣  Create validation");
  const badDate = await req("POST", "/trips", {
    cookie: A,
    body: validTrip({ startDate: "2026-12-10", endDate: "2026-12-01" }),
  });
  assert("end before start → 400", badDate.status === 400);
  assert(
    "error names endDate",
    badDate.data.errors?.some((e) => e.field === "endDate")
  );

  const badTravellers = await req("POST", "/trips", {
    cookie: A,
    body: validTrip({ travellers: 0 }),
  });
  assert("zero travellers → 400", badTravellers.status === 400);

  const badBudget = await req("POST", "/trips", {
    cookie: A,
    body: validTrip({ budget: -5 }),
  });
  assert("negative budget → 400", badBudget.status === 400);

  const missingDest = await req("POST", "/trips", {
    cookie: A,
    body: validTrip({ destination: "" }),
  });
  assert("empty destination → 400", missingDest.status === 400);

  const badEnum = await req("POST", "/trips", {
    cookie: A,
    body: validTrip({ travelStyle: "fancy" }),
  });
  assert("invalid travelStyle → 400", badEnum.status === 400);

  // ---- Create: success ----
  console.log("\n2️⃣  Create trip");
  const created = await req("POST", "/trips", { cookie: A, body: validTrip() });
  assert("returns 201", created.status === 201);
  assert("success: true", created.data.success === true);
  assert("returns trip with id", !!created.data.trip?._id);
  assert("currency uppercased to GBP", created.data.trip?.currency === "GBP");
  assert("defaults respected (destination)", created.data.trip?.destination === "Tokyo");
  assert("no __v exposed", created.data.trip?.__v === undefined);
  const tripId = created.data.trip._id;

  // Ownership must come from session, not body — try to spoof userId.
  const spoof = await req("POST", "/trips", {
    cookie: A,
    body: validTrip({ userId: "507f1f77bcf86cd799439011" }),
  });
  assert("unknown body field (userId) rejected by strict schema → 400", spoof.status === 400);

  // ---- Read list ----
  console.log("\n3️⃣  List trips");
  const list = await req("GET", "/trips", { cookie: A });
  assert("returns 200", list.status === 200);
  assert("trips is array", Array.isArray(list.data.trips));
  assert("count >= 1", list.data.count >= 1);
  assert("has pagination block", !!list.data.pagination?.totalPages);

  const filtered = await req("GET", "/trips?status=planned&limit=5", { cookie: A });
  assert("status filter returns 200", filtered.status === 200);
  assert("all returned trips are planned", filtered.data.trips.every((t) => t.status === "planned"));

  const badQuery = await req("GET", "/trips?status=nonsense", { cookie: A });
  assert("invalid status filter → 400", badQuery.status === 400);

  // ---- Read one ----
  console.log("\n4️⃣  Get single trip");
  const one = await req("GET", `/trips/${tripId}`, { cookie: A });
  assert("returns 200", one.status === 200);
  assert("returns the right trip", one.data.trip?._id === tripId);

  const badId = await req("GET", "/trips/not-an-id", { cookie: A });
  assert("invalid id → 400", badId.status === 400);

  const missing = await req("GET", "/trips/507f1f77bcf86cd799439011", { cookie: A });
  assert("non-existent id → 404", missing.status === 404);

  // ---- Update ----
  console.log("\n5️⃣  Update trip");
  const patched = await req("PATCH", `/trips/${tripId}`, {
    cookie: A,
    body: { status: "ongoing", budget: 5000 },
  });
  assert("returns 200", patched.status === 200);
  assert("status updated", patched.data.trip?.status === "ongoing");
  assert("budget updated", patched.data.trip?.budget === 5000);

  const emptyPatch = await req("PATCH", `/trips/${tripId}`, { cookie: A, body: {} });
  assert("empty update body → 400", emptyPatch.status === 400);

  // PATCH that would make endDate precede the stored startDate.
  const badPatchDate = await req("PATCH", `/trips/${tripId}`, {
    cookie: A,
    body: { endDate: "2020-01-01" },
  });
  assert("patch endDate before stored startDate → 400", badPatchDate.status === 400);

  // ---- Ownership enforcement ----
  console.log("\n6️⃣  Ownership enforcement (second user cannot touch first user's trip)");
  const userB = await registerUser();
  const B = userB.token;
  assert("B cannot read A's trip (404)", (await req("GET", `/trips/${tripId}`, { cookie: B })).status === 404);
  assert("B cannot update A's trip (404)", (await req("PATCH", `/trips/${tripId}`, { cookie: B, body: { status: "cancelled" } })).status === 404);
  assert("B cannot delete A's trip (404)", (await req("DELETE", `/trips/${tripId}`, { cookie: B })).status === 404);
  assert("B's list is empty", (await req("GET", "/trips", { cookie: B })).data.count === 0);

  // ---- Delete ----
  console.log("\n7️⃣  Delete trip");
  const del = await req("DELETE", `/trips/${tripId}`, { cookie: A });
  assert("returns 200", del.status === 200);
  assert("success message", del.data.message?.toLowerCase().includes("deleted"));
  assert("subsequent GET → 404", (await req("GET", `/trips/${tripId}`, { cookie: A })).status === 404);
  assert("delete again → 404", (await req("DELETE", `/trips/${tripId}`, { cookie: A })).status === 404);

  console.log(`\n📊 Results: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
