/**
 * TripMate AI — AI test endpoint integration tests
 *
 * Verifies auth gating, validation, and (when ANTHROPIC_API_KEY is set on the
 * server) a real round-trip through llmService.
 *
 * Run (server must be running):
 *   node tests/test-ai.js
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
const assert = (label, cond) => {
  console.log(`  ${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

async function run() {
  console.log("\n🧪 TripMate AI — AI Endpoint Tests\n");

  // ---- Auth gating ----
  console.log("0️⃣  Auth required");
  const noAuth = await req("POST", "/ai/test", { body: { message: "hi" } });
  assert("POST /ai/test returns 401 without cookie", noAuth.status === 401);

  // ---- Register a user ----
  const email = `ai_${Date.now()}@tripmate.dev`;
  const reg = await req("POST", "/auth/register", {
    body: { name: "AI Tester", email, password: "SecurePass123" },
  });
  if (reg.status !== 201 || !reg.token) {
    console.log("  ⚠️  Could not register (DB down?) — skipping");
    console.log(`\n📊 Results: ${pass} passed, ${fail} failed (skipped)\n`);
    process.exit(fail > 0 ? 1 : 0);
  }
  const cookie = reg.token;

  // ---- Validation ----
  console.log("\n1️⃣  Validation");
  const empty = await req("POST", "/ai/test", { cookie, body: {} });
  assert("missing message → 400", empty.status === 400);
  const blank = await req("POST", "/ai/test", { cookie, body: { message: "   " } });
  assert("blank message → 400", blank.status === 400);
  const unknown = await req("POST", "/ai/test", {
    cookie,
    body: { message: "hi", foo: "bar" },
  });
  assert("unknown field (strict) → 400", unknown.status === 400);
  const badTemp = await req("POST", "/ai/test", {
    cookie,
    body: { message: "hi", temperature: 5 },
  });
  assert("invalid temperature → 400", badTemp.status === 400);

  // ---- Real call (needs server-side ANTHROPIC_API_KEY) ----
  console.log("\n2️⃣  Travel question");
  const r = await req("POST", "/ai/test", {
    cookie,
    body: { message: "Name one must-see sight in Paris. One sentence." },
  });

  if (r.status === 503) {
    console.log("  ⚠️  GEMINI_API_KEY not set on server — skipping live call");
    console.log("     (Set it in server/.env to test a real AI response.)");
    console.log(`\n📊 Results: ${pass} passed, ${fail} failed (live call skipped)\n`);
    process.exit(fail > 0 ? 1 : 0);
  }

  assert("returns 200", r.status === 200);
  assert("success: true", r.data?.success === true);
  assert("has non-empty reply", typeof r.data?.reply === "string" && r.data.reply.length > 0);
  assert("meta.model present", !!r.data?.meta?.model);
  assert("usage token counts present", typeof r.data?.meta?.usage?.outputTokens === "number");
  console.log("\n  💬 Reply:", r.data?.reply);

  console.log(`\n📊 Results: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
