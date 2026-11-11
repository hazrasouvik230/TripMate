/**
 * TripMate AI — semantic search (Atlas Vector Search) tests.
 *
 * Needs: server running, GEMINI_API_KEY set, the sample data ingested
 * (node ingest-sample.js), and the vector index created + queryable
 * (node create-vector-index.js).
 *
 *   node tests/test-search.js
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

const search = (cookie, body) => req("POST", "/ai/search-knowledge", { cookie, body });

async function run() {
  console.log("\n🧪 TripMate AI — Semantic Search Tests\n");

  console.log("0️⃣  Auth & validation");
  assert("requires auth (401)", (await search(null, { query: "x" })).status === 401);

  const reg = await req("POST", "/auth/register", {
    body: { name: "Search", email: `search_${Date.now()}@tm.dev`, password: "SecurePass123" },
  });
  if (reg.status !== 201 || !reg.token) {
    console.log("  ⚠️  DB down — skipping");
    process.exit(0);
  }
  const A = reg.token;

  assert("missing query → 400", (await search(A, {})).status === 400);
  assert("empty query → 400", (await search(A, { query: "   " })).status === 400);
  assert("unknown field (strict) → 400", (await search(A, { query: "hi", foo: 1 })).status === 400);

  // ---- Relevance ----
  console.log("\n1️⃣  Relevance  [needs key + ingested data + index]");
  const s1 = await search(A, { query: "How do I get around the city on the subway and trains?" });
  if (s1.status === 503) {
    console.log("  ⚠️  Not ready (no key / index not built):", s1.data?.message);
    console.log(`\n📊 ${pass} passed, ${fail} failed (search skipped)\n`);
    process.exit(fail > 0 ? 1 : 0);
  }
  assert("returns 200", s1.status === 200);
  assert("has results", Array.isArray(s1.data.results) && s1.data.results.length > 0);
  const top = s1.data.results[0];
  assert("top result includes title/source/metadata", !!(top.title && top.source && top.metadata));
  assert("top result has a similarity score (0..1]", typeof top.score === "number" && top.score > 0 && top.score <= 1.0001);
  assert("results ranked by descending score", s1.data.results.every((r, i, a) => i === 0 || a[i - 1].score >= r.score));
  assert("transport query → top result is a transport doc", top.category === "transport");
  console.log(`     ↳ top: "${top.title}" (score ${top.score.toFixed(4)})`);

  const s2 = await search(A, { query: "Where can I eat great ramen and sushi?" });
  assert("food query → top result is a food doc", s2.data.results[0]?.category === "food");
  console.log(`     ↳ top: "${s2.data.results[0]?.title}" (score ${s2.data.results[0]?.score.toFixed(4)})`);

  const s3 = await search(A, { query: "ancient Roman ruins and historic sights" });
  assert("history query → top result is about Rome", s3.data.results[0]?.destination === "Rome");
  console.log(`     ↳ top: "${s3.data.results[0]?.title}" (score ${s3.data.results[0]?.score.toFixed(4)})`);

  // ---- Filters ---- (fresh user to stay under the per-user rate limit)
  console.log("\n2️⃣  Filters");
  const regB = await req("POST", "/auth/register", {
    body: { name: "Search2", email: `search2_${Date.now()}@tm.dev`, password: "SecurePass123" },
  });
  const B = regB.token;
  const fDest = await search(B, { query: "what should I know?", destination: "Tokyo" });
  assert("destination filter → all results are Tokyo", fDest.data.results.length > 0 && fDest.data.results.every((r) => r.destination === "Tokyo"));

  const fCat = await search(B, { query: "tips for my trip", category: "food" });
  assert("category filter → all results are food", fCat.data.results.length > 0 && fCat.data.results.every((r) => r.category === "food"));

  const fBoth = await search(B, { query: "tips", destination: "Tokyo", category: "transport" });
  assert("destination+category filter → Tokyo transport only", fBoth.data.results.every((r) => r.destination === "Tokyo" && r.category === "transport"));

  // ---- Empty results ----
  console.log("\n3️⃣  Empty results");
  const empty = await search(B, { query: "anything", destination: "Atlantis" });
  assert("no matching docs → 200 with empty results", empty.status === 200 && empty.data.count === 0 && empty.data.results.length === 0);

  // ---- limit ----
  const lim = await search(B, { query: "travel tips", limit: 2 });
  assert("limit respected", lim.data.results.length <= 2);

  console.log(`\n📊 Results: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
