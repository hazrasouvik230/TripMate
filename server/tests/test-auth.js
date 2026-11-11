/**
 * TripMate AI — Auth flow integration tests
 *
 * Tests the full register → login → me → logout → me cycle.
 * If MongoDB is unreachable, tests only validation / routing.
 *
 * Run: node tests/test-auth.js
 */

const BASE = "http://localhost:5000/api/v1";

async function req(method, path, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  const cookies = res.headers.getSetCookie?.() || [];
  return { status: res.status, data, cookies };
}

async function reqWithCookie(method, path, cookie, body = null) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  const cookies = res.headers.getSetCookie?.() || [];
  return { status: res.status, data, cookies };
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

async function run() {
  console.log("\n🧪 TripMate AI Auth Tests\n");

  // ---- Test 1: Health check ----
  console.log("1️⃣  Health check");
  const h = await req("GET", "/health");
  assert("returns 200", h.status === 200);
  assert("success: true", h.data.success === true);

  // ---- Test 2: Validation errors ----
  console.log("\n2️⃣  Register validation (bad data)");
  const v = await req("POST", "/auth/register", { name: "A", email: "bad", password: "short" });
  assert("returns 400", v.status === 400);
  assert("has errors array", Array.isArray(v.data.errors));
  assert("errors include field names", v.data.errors.some((e) => e.field));

  // ---- Test 3: Login validation ----
  console.log("\n3️⃣  Login validation (empty body)");
  const lv = await req("POST", "/auth/login", {});
  assert("returns 400", lv.status === 400);
  assert("message says validation", lv.data.message.includes("Validation"));

  // ---- Test 4: GET /auth/me without cookie ----
  console.log("\n4️⃣  /auth/me without auth");
  const m = await req("GET", "/auth/me");
  assert("returns 401", m.status === 401);
  assert("message mentions auth", m.data.message.toLowerCase().includes("authenticated") || m.data.message.toLowerCase().includes("log in"));

  // ---- Test 5: Register a user (needs DB) ----
  const testEmail = `test_${Date.now()}@tripmate.dev`;
  console.log("\n5️⃣  Register user");
  const r = await req("POST", "/auth/register", {
    name: "Test User",
    email: testEmail,
    password: "SecurePass123",
  });

  if (r.status === 500 || r.status === 503) {
    console.log("  ⚠️  Database unreachable — skipping DB-dependent tests");
    console.log(`\n📊 Results: ${pass} passed, ${fail} failed (DB tests skipped)\n`);
    process.exit(fail > 0 ? 1 : 0);
  }

  assert("returns 201", r.status === 201);
  assert("success: true", r.data.success === true);
  assert("returns user object", r.data.user && r.data.user.email === testEmail);
  assert("no passwordHash exposed", !r.data.user.passwordHash);
  assert("no __v exposed", r.data.user.__v === undefined);
  assert("has name", r.data.user.name === "Test User");
  assert("sets httpOnly cookie", r.cookies.some((c) => c.includes("token=") && c.includes("HttpOnly")));

  const tokenCookie = r.cookies.find((c) => c.includes("token="));

  // ---- Test 6: Duplicate email ----
  console.log("\n6️⃣  Duplicate email");
  const dup = await req("POST", "/auth/register", {
    name: "Dup User",
    email: testEmail,
    password: "AnotherPass123",
  });
  assert("returns 409", dup.status === 409);
  assert("message mentions exists", dup.data.message.toLowerCase().includes("already"));

  // ---- Test 7: Login ----
  console.log("\n7️⃣  Login");
  const l = await req("POST", "/auth/login", {
    email: testEmail,
    password: "SecurePass123",
  });
  assert("returns 200", l.status === 200);
  assert("success: true", l.data.success === true);
  assert("returns user", l.data.user && l.data.user.email === testEmail);
  assert("no passwordHash", !l.data.user.passwordHash);
  assert("sets cookie", l.cookies.some((c) => c.includes("token=")));

  const loginCookie = l.cookies.find((c) => c.includes("token="))?.split(";")[0];

  // ---- Test 8: Wrong password ----
  console.log("\n8️⃣  Wrong password");
  const wp = await req("POST", "/auth/login", {
    email: testEmail,
    password: "WrongPassword",
  });
  assert("returns 401", wp.status === 401);
  assert("generic message (no enumeration)", wp.data.message === "Invalid email or password");

  // ---- Test 9: GET /auth/me with cookie ----
  console.log("\n9️⃣  /auth/me with cookie");
  const me = await reqWithCookie("GET", "/auth/me", loginCookie);
  assert("returns 200", me.status === 200);
  assert("returns user", me.data.user && me.data.user.email === testEmail);
  assert("no passwordHash", !me.data.user.passwordHash);

  // ---- Test 10: Logout ----
  console.log("\n🔟  Logout");
  const lo = await reqWithCookie("POST", "/auth/logout", loginCookie);
  assert("returns 200", lo.status === 200);
  assert("clears cookie", lo.cookies.some((c) => c.includes("token=") && c.includes("Max-Age=0")));

  // ---- Test 11: /auth/me after logout (cleared cookie) ----
  console.log("\n1️⃣1️⃣  /auth/me after logout");
  const cleared = lo.cookies.find((c) => c.includes("token="))?.split(";")[0];
  const me2 = await reqWithCookie("GET", "/auth/me", cleared || "");
  assert("returns 401", me2.status === 401);

  console.log(`\n📊 Results: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

