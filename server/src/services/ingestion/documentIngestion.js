import crypto from "crypto";
import TravelDocument from "../../models/TravelDocument.js";
import {
  embedBatch,
  embeddingModel,
  embeddingDimensions,
} from "../llm/embeddingService.js";
import { llmConfig } from "../../config/llm.js";
import { LlmError } from "../llm/llmService.js";

/**
 * documentIngestion — turn curated travel documents into embedded, searchable
 * chunks stored in MongoDB.
 *
 *   1. accept a curated document
 *   2. split long content into overlapping chunks
 *   3. preserve metadata (destination, category, source, arbitrary metadata)
 *   4. generate embeddings (batched, de-duped)
 *   5. upsert chunks + vectors into TravelDocument (idempotent per source)
 */

/* ------------------------------------------------------------------ */
/*  Chunking                                                           */
/* ------------------------------------------------------------------ */
/**
 * Split text into overlapping, sentence-aware chunks.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.size]     - target max chars per chunk
 * @param {number} [opts.overlap]  - chars of trailing context repeated into the
 *                                   next chunk (keeps ideas that straddle a
 *                                   boundary retrievable from either chunk)
 * @returns {string[]}
 */
export const chunkText = (text, { size, overlap } = {}) => {
  const target = Math.max(100, size ?? llmConfig.chunking.size);
  const over = Math.min(Math.max(0, overlap ?? llmConfig.chunking.overlap), target - 1);

  const clean = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!clean) return [];
  if (clean.length <= target) return [clean];

  // Sentence / paragraph units (Node 20 supports lookbehind).
  const sentences = clean
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks = [];
  let cur = "";
  const step = Math.max(1, target - over);

  for (const s of sentences) {
    if (s.length > target) {
      // A single over-long sentence: hard-split into overlapping windows.
      if (cur) {
        chunks.push(cur);
        cur = "";
      }
      for (let i = 0; i < s.length; i += step) chunks.push(s.slice(i, i + target));
      continue;
    }
    if ((cur ? cur.length + 1 : 0) + s.length <= target) {
      cur = cur ? `${cur} ${s}` : s;
    } else {
      chunks.push(cur);
      // Carry an overlap tail (broken on a word boundary) into the next chunk.
      const tail = cur.slice(Math.max(0, cur.length - over));
      const sp = tail.indexOf(" ");
      const carried = sp >= 0 ? tail.slice(sp + 1) : tail;
      cur = carried ? `${carried} ${s}` : s;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
};

/* ------------------------------------------------------------------ */
/*  Ingestion                                                          */
/* ------------------------------------------------------------------ */
const hashChunk = (content, taskType) =>
  crypto
    .createHash("sha256")
    .update(`${embeddingModel()}:${embeddingDimensions()}:${taskType}:${content}`)
    .digest("hex");

/**
 * Ingest a single curated document: chunk → embed (reusing any identical
 * chunks already embedded) → upsert. Idempotent per `source`.
 *
 * @param {object} doc  - { title, content, destination?, category?, source, metadata? }
 * @param {object} [opts] - { chunkSize, chunkOverlap }
 * @returns {Promise<{title,source,chunks,embedded,reused}>}
 */
export const ingestDocument = async (doc, opts = {}) => {
  const {
    title,
    content,
    destination = "",
    category = "general",
    source,
    metadata = {},
  } = doc || {};

  if (!title?.trim() || !content?.trim() || !source?.trim()) {
    throw new LlmError("Document requires title, content and source.", {
      statusCode: 400,
      code: "invalid_document",
    });
  }

  const taskType = llmConfig.embedding.taskType;
  const chunks = chunkText(content, {
    size: opts.chunkSize,
    overlap: opts.chunkOverlap,
  });
  if (chunks.length === 0) {
    throw new LlmError("Document produced no chunks.", {
      statusCode: 400,
      code: "empty_document",
    });
  }
  const total = chunks.length;
  const hashes = chunks.map((c) => hashChunk(c, taskType));

  // Reuse embeddings for chunks whose content was embedded before (any source).
  const existing = await TravelDocument.find({ contentHash: { $in: hashes } })
    .select("contentHash embedding")
    .lean();
  const reuseMap = new Map(existing.map((d) => [d.contentHash, d.embedding]));

  // Only embed chunks we don't already have a vector for.
  const need = [];
  chunks.forEach((c, i) => {
    if (!reuseMap.has(hashes[i])) need.push({ i, text: c });
  });

  const freshByIndex = new Map();
  if (need.length) {
    const vectors = await embedBatch(
      need.map((n) => n.text),
      { taskType }
    );
    need.forEach((n, k) => freshByIndex.set(n.i, vectors[k]));
  }

  const model = embeddingModel();
  const dim = embeddingDimensions();

  const ops = chunks.map((c, i) => ({
    updateOne: {
      filter: { source, "chunk.index": i },
      update: {
        $set: {
          title,
          content: c,
          chunk: { index: i, total },
          destination,
          category,
          source,
          metadata,
          embedding: reuseMap.get(hashes[i]) ?? freshByIndex.get(i),
          embeddingModel: model,
          embeddingDim: dim,
          contentHash: hashes[i],
        },
      },
      upsert: true,
    },
  }));

  await TravelDocument.bulkWrite(ops);
  // Remove stale chunks if the document got shorter on re-ingest.
  await TravelDocument.deleteMany({ source, "chunk.index": { $gte: total } });

  return {
    title,
    source,
    chunks: total,
    embedded: need.length,
    reused: total - need.length,
  };
};

/**
 * Ingest many documents sequentially. Returns per-document results plus totals.
 */
export const ingestMany = async (docs, opts = {}) => {
  const results = [];
  for (const doc of docs) {
    results.push(await ingestDocument(doc, opts));
  }
  const totals = results.reduce(
    (acc, r) => ({
      documents: acc.documents + 1,
      chunks: acc.chunks + r.chunks,
      embedded: acc.embedded + r.embedded,
      reused: acc.reused + r.reused,
    }),
    { documents: 0, chunks: 0, embedded: 0, reused: 0 }
  );
  return { results, totals };
};

export default { chunkText, ingestDocument, ingestMany };
