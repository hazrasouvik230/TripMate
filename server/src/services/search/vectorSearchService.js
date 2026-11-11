import TravelDocument from "../../models/TravelDocument.js";
import {
  embedText,
  embeddingDimensions,
} from "../llm/embeddingService.js";
import { llmConfig } from "../../config/llm.js";
import { LlmError } from "../llm/llmService.js";

/**
 * vectorSearchService — semantic search over the TravelDocument collection
 * using MongoDB Atlas Vector Search ($vectorSearch) on the `embedding` field.
 *
 * Verified against: mongoose 9.11, mongodb driver 7.7, MongoDB Atlas.
 * Requires an Atlas Vector Search index (see create-vector-index.js /
 * AI_INTEGRATION.md). The query is embedded with the same model/dimensions as
 * the stored documents, using the RETRIEVAL_QUERY task type.
 */

/* ---------- Vector index definition (dimensions match the embed model) ---------- */
export const buildIndexDefinition = () => ({
  fields: [
    {
      type: "vector",
      path: "embedding",
      numDimensions: embeddingDimensions(), // must equal GEMINI_EMBED_DIM
      similarity: "cosine",
    },
    // Filterable fields — enable `filter` in $vectorSearch.
    { type: "filter", path: "destination" },
    { type: "filter", path: "category" },
  ],
});

/* ---------- Missing-index detection ---------- */
// Some errors surface as thrown exceptions (older paths / other stages)…
const isMissingIndexError = (err) => {
  const msg = `${err?.message || ""}`.toLowerCase();
  return (
    msg.includes("index not found") ||
    msg.includes("not found index") ||
    (msg.includes("search index") && msg.includes("not")) ||
    msg.includes("no search index") ||
    (msg.includes(llmConfig.search.indexName.toLowerCase()) && msg.includes("not found"))
  );
};

// …but Atlas also *silently returns zero results* when the index is missing or
// still building. So on an empty result set, confirm the index is queryable to
// distinguish "no matches" from "index not ready". Throws a 503 if not.
const assertIndexQueryable = async () => {
  let indexes;
  try {
    indexes = await listVectorIndexes();
  } catch {
    return; // can't introspect (e.g. non-Atlas) — don't mask a genuine empty
  }
  const idx = indexes.find((i) => i.name === llmConfig.search.indexName);
  if (!idx || idx.queryable !== true) {
    throw new LlmError(
      `Vector search index "${llmConfig.search.indexName}" was not found or is not ready. ` +
        `Create it (see create-vector-index.js / AI_INTEGRATION.md) and wait until it is queryable.`,
      { statusCode: 503, code: "index_not_ready" }
    );
  }
};

/* ---------- Search ---------- */
/**
 * Run a semantic search.
 *
 * @param {object} opts
 * @param {string} opts.query          - natural-language query (required)
 * @param {string} [opts.destination]  - exact-match filter
 * @param {string} [opts.category]     - exact-match filter
 * @param {number} [opts.limit]        - max results (clamped)
 * @returns {Promise<{results:Array, count:number, query:string}>}
 */
export const searchKnowledge = async ({ query, destination, category, limit } = {}) => {
  if (typeof query !== "string" || query.trim() === "") {
    throw new LlmError("A search query is required.", {
      statusCode: 400,
      code: "empty_query",
    });
  }

  const resultLimit = Math.min(
    Math.max(1, Number.isFinite(limit) ? limit : llmConfig.search.defaultLimit),
    llmConfig.search.maxLimit
  );
  const numCandidates = Math.min(
    Math.max(resultLimit * llmConfig.search.candidatesFactor, 100),
    10_000
  );

  // Embed the query (query task type, not document).
  const queryVector = await embedText(query, { taskType: "RETRIEVAL_QUERY" });

  // Optional equality filters on indexed `filter` fields.
  const filter = {};
  if (destination?.trim()) filter.destination = destination.trim();
  if (category?.trim()) filter.category = category.trim();

  const vectorStage = {
    index: llmConfig.search.indexName,
    path: "embedding",
    queryVector,
    numCandidates,
    limit: resultLimit,
  };
  if (Object.keys(filter).length) vectorStage.filter = filter;

  const pipeline = [
    { $vectorSearch: vectorStage },
    {
      $project: {
        _id: 1,
        title: 1,
        content: 1,
        chunk: 1,
        destination: 1,
        category: 1,
        source: 1,
        metadata: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ];

  try {
    const docs = await TravelDocument.aggregate(pipeline);

    // Atlas returns [] for a missing/not-ready index. Only when empty, verify
    // the index is queryable so we can report that instead of a false "no match".
    if (docs.length === 0) await assertIndexQueryable();

    return {
      query: query.trim(),
      count: docs.length,
      results: docs.map((d) => ({
        id: d._id,
        title: d.title,
        content: d.content,
        chunk: d.chunk,
        destination: d.destination,
        category: d.category,
        source: d.source,
        metadata: d.metadata,
        score: d.score, // cosine similarity-based relevance (0..1)
      })),
    };
  } catch (error) {
    if (error instanceof LlmError) throw error;
    if (isMissingIndexError(error)) {
      throw new LlmError(
        `Vector search index "${llmConfig.search.indexName}" was not found or is not ready. ` +
          `Create it (see create-vector-index.js / AI_INTEGRATION.md) and wait until it is queryable.`,
        { statusCode: 503, code: "index_not_ready" }
      );
    }
    throw new LlmError(`Vector search failed: ${error.message}`, {
      statusCode: 500,
      code: "search_failed",
    });
  }
};

/* ---------- Index management helpers ---------- */
export const listVectorIndexes = async () => {
  const cursor = TravelDocument.collection.listSearchIndexes();
  return cursor.toArray();
};

/**
 * Create the Atlas Vector Search index if it doesn't already exist.
 * Returns { created: boolean, name }.
 */
export const ensureVectorIndex = async () => {
  const name = llmConfig.search.indexName;
  const existing = await listVectorIndexes();
  if (existing.some((i) => i.name === name)) return { created: false, name };

  await TravelDocument.collection.createSearchIndex({
    name,
    type: "vectorSearch",
    definition: buildIndexDefinition(),
  });
  return { created: true, name };
};

export default { searchKnowledge, ensureVectorIndex, listVectorIndexes, buildIndexDefinition };
