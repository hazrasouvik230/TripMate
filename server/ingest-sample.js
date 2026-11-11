/**
 * TripMate AI — sample travel-document ingestion script.
 *
 * Connects to MongoDB, chunks + embeds the curated sample dataset, and stores
 * the chunks and vectors in the TravelDocument collection. Idempotent: re-runs
 * upsert by source, and identical chunks are not re-embedded.
 *
 * Requires GEMINI_API_KEY and MONGODB_URI in server/.env.
 *
 *   node ingest-sample.js
 *   CHUNK_SIZE=600 CHUNK_OVERLAP=100 node ingest-sample.js   # tune chunking
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "./src/config/db.js";
import { isLlmConfigured } from "./src/config/llm.js";
import { ingestMany } from "./src/services/ingestion/documentIngestion.js";
import { embeddingModel, embeddingDimensions } from "./src/services/llm/embeddingService.js";
import { sampleTravelDocs } from "./src/data/sampleTravelDocs.js";

async function main() {
  if (!isLlmConfigured()) {
    console.error("❌ GEMINI_API_KEY is not set in server/.env — cannot embed.");
    process.exit(1);
  }

  await connectDB();
  if (mongoose.connection.readyState !== 1) {
    console.error("❌ MongoDB is not connected — check MONGODB_URI.");
    process.exit(1);
  }

  console.log(
    `\n📥 Ingesting ${sampleTravelDocs.length} documents using ${embeddingModel()} (${embeddingDimensions()}d)\n`
  );

  const { results, totals } = await ingestMany(sampleTravelDocs);

  for (const r of results) {
    console.log(
      `  • ${r.title.padEnd(34)} ${r.chunks} chunk(s) · ${r.embedded} embedded · ${r.reused} reused`
    );
  }

  console.log(
    `\n✅ Done: ${totals.documents} documents → ${totals.chunks} chunks ` +
      `(${totals.embedded} embedded, ${totals.reused} reused from cache/DB)\n`
  );

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
