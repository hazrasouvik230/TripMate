import mongoose from "mongoose";

/**
 * A single chunk of curated travel information with its embedding vector.
 * One source document becomes several TravelDocument rows (one per chunk).
 *
 * Note: vector *search* (Atlas $vectorSearch / an ANN index) is intentionally
 * out of scope here — this task only stores chunks + vectors. The `embedding`
 * array is a plain field ready for a vector index to be added later.
 */
const travelDocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },

    // The chunk's text (what was embedded).
    content: { type: String, required: true, trim: true },

    // Position of this chunk within its source document.
    chunk: {
      index: { type: Number, required: true, min: 0 },
      total: { type: Number, required: true, min: 1 },
    },

    destination: { type: String, trim: true, default: "", index: true },
    category: { type: String, trim: true, default: "general", index: true },
    source: { type: String, trim: true, default: "" },

    // Arbitrary preserved metadata (tags, language, author, url, …).
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    // The embedding vector and its provenance.
    embedding: { type: [Number], required: true },
    embeddingModel: { type: String, required: true },
    embeddingDim: { type: Number, required: true },

    // Hash of (model+dim+taskType+content) — used to skip re-embedding
    // unchanged chunks and to upsert idempotently.
    contentHash: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

/* ---------- Indexes ---------- */
// Common filter: narrow by destination + category before (future) vector search.
travelDocumentSchema.index({ destination: 1, category: 1 });
// Idempotent ingestion: one row per (source, chunk index).
travelDocumentSchema.index({ source: 1, "chunk.index": 1 }, { unique: true });

/* ---------- Serialisation ---------- */
travelDocumentSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model("TravelDocument", travelDocumentSchema);
