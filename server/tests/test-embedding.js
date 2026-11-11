/**
 * TripMate AI — embedding service tests.
 *
 * Empty-input handling runs without a key; vector/batch/dedupe/normalisation
 * checks need GEMINI_API_KEY.
 *
 *   node tests/test-embedding.js
 */
import "dotenv/config";
import {
  embedText,
  embedBatch,
  embeddingDimensions,
} from "./src/services/llm/embeddingService.js";
import { isLlmConfigured } from "../src/config/llm.js";
import { chunkText } from "../src/services/ingestion/documentIngestion.js";

let pass = 0,
  fail = 0;
const assert = (l, c) => {
  console.log(`  ${c ? "✅" : "❌"} ${l}`);
  c ? pass++ : fail++;
};

async function expectThrow(label, fn, code) {
  try {
    await fn();
    assert(`${label} (expected throw)`, false);
  } catch (e) {
    assert(`${label} → ${e.code || e.statusCode}`, code ? e.code === code : true);
  }
}

async function run() {
  console.log("\n🧪 TripMate AI — Embedding Tests\n");

  // ---- Chunking (pure, no API) ----
  console.log("0️⃣  Chunking");
  const short = chunkText("One short sentence.", { size: 900, overlap: 150 });
  assert("short text → single chunk", short.length === 1);
  const long = "Sentence number zero. " + Array.from({ length: 60 }, (_, i) => `This is sentence ${i + 1} about travel.`).join(" ");
  const chunks = chunkText(long, { size: 300, overlap: 60 });
  assert("long text → multiple chunks", chunks.length > 1);
  assert("chunks respect ~size bound", chunks.every((c) => c.length <= 320));
  // Overlap: consecutive chunks should share some trailing/leading text.
  const overlaps = chunks.slice(1).some((c, i) => {
    const prevTail = chunks[i].slice(-40);
    return prevTail.split(" ").some((w) => w.length > 3 && c.startsWith(w));
  });
  assert("consecutive chunks overlap", overlaps);
  assert("empty text → no chunks", chunkText("   ").length === 0);

  // ---- Empty input (no key needed) ----
  console.log("\n1️⃣  Empty-input handling");
  await expectThrow("embedText('') rejects", () => embedText(""), "empty_input");
  await expectThrow("embedText('   ') rejects", () => embedText("   "), "empty_input");
  await expectThrow("embedBatch([]) rejects", () => embedBatch([]), "empty_input");
  await expectThrow("embedBatch with empty entry rejects", () => embedBatch(["ok", ""]), "empty_input");

  if (!isLlmConfigured()) {
    console.log("\n  ⚠️  GEMINI_API_KEY not set — skipping live embedding checks");
    console.log(`\n📊 ${pass} passed, ${fail} failed (live skipped)\n`);
    process.exit(fail > 0 ? 1 : 0);
  }

  // ---- Single embedding ----
  console.log("\n2️⃣  Single embedding");
  const dim = embeddingDimensions();
  const v = await embedText("A quiet beach in Bali at sunset.");
  assert(`returns vector of ${dim} dims`, Array.isArray(v) && v.length === dim);
  assert("values are finite numbers", v.every((x) => Number.isFinite(x)));
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  assert("vector is L2-normalised (|v| ≈ 1)", Math.abs(mag - 1) < 1e-3);

  // ---- Cache (duplicate single request) ----
  console.log("\n3️⃣  De-duplication / cache");
  const v2 = await embedText("A quiet beach in Bali at sunset.");
  assert("identical text returns identical vector", JSON.stringify(v2) === JSON.stringify(v));

  // ---- Batch ----
  console.log("\n4️⃣  Batch embedding");
  const texts = ["Tokyo metro tips", "Best ramen in Shinjuku", "Tokyo metro tips"]; // dup on purpose
  const vecs = await embedBatch(texts);
  assert("returns one vector per input (order preserved)", vecs.length === 3);
  assert("all vectors have correct dims", vecs.every((x) => x.length === dim));
  assert("duplicate inputs share the same vector", JSON.stringify(vecs[0]) === JSON.stringify(vecs[2]));
  assert("distinct inputs differ", JSON.stringify(vecs[0]) !== JSON.stringify(vecs[1]));

  console.log(`\n📊 Results: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
