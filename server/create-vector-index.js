/**
 * TripMate AI — create the Atlas Vector Search index for TravelDocument.
 *
 * Creates the `travel_vector_index` (vectorSearch) on the `embedding` field,
 * with `destination` and `category` as filter fields, then polls until the
 * index is queryable. Idempotent: if the index already exists it just reports.
 *
 * Requires MONGODB_URI (an Atlas cluster) in server/.env.
 *
 *   node create-vector-index.js
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "./src/config/db.js";
import { llmConfig } from "./src/config/llm.js";
import {
  ensureVectorIndex,
  listVectorIndexes,
  buildIndexDefinition,
} from "./src/services/search/vectorSearchService.js";
import { embeddingDimensions } from "./src/services/llm/embeddingService.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await connectDB();
  if (mongoose.connection.readyState !== 1) {
    console.error("❌ MongoDB not connected — check MONGODB_URI (must be Atlas).");
    process.exit(1);
  }

  console.log(
    `\n🔎 Index "${llmConfig.search.indexName}" · ${embeddingDimensions()} dims · cosine`
  );
  console.log("   definition:", JSON.stringify(buildIndexDefinition()));

  let created;
  try {
    created = await ensureVectorIndex();
  } catch (err) {
    console.error(`\n❌ Could not create the index: ${err.message}`);
    console.error(
      "   Atlas Vector Search requires an Atlas cluster. On a local/standalone\n" +
        "   MongoDB, create the index in Atlas instead (see AI_INTEGRATION.md)."
    );
    await mongoose.connection.close();
    process.exit(1);
  }

  console.log(created.created ? "\n⏳ Index created — building…" : "\nℹ️  Index already exists.");

  // Poll until queryable (build can take ~30s–few minutes).
  for (let i = 0; i < 60; i++) {
    const indexes = await listVectorIndexes();
    const idx = indexes.find((x) => x.name === created.name);
    const status = idx?.status || "unknown";
    const queryable = idx?.queryable === true;
    process.stdout.write(`\r   status: ${status} · queryable: ${queryable}      `);
    if (queryable) {
      console.log("\n\n✅ Index is queryable. Semantic search is ready.\n");
      await mongoose.connection.close();
      process.exit(0);
    }
    await sleep(5000);
  }

  console.log("\n\n⚠️  Index still building after the wait window. Check Atlas; it will finish shortly.\n");
  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Fatal:", err.message || err);
  try {
    await mongoose.connection.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
