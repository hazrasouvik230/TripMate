# AI Integration (Google Gemini)

TripMate AI's backend talks to Google Gemini through the official JavaScript SDK
(`@google/genai`). It powers a simple Q&A test endpoint, structured day-by-day
**itinerary generation**, **embedding generation + document ingestion**,
**semantic search** (MongoDB Atlas Vector Search), a full
**Retrieval-Augmented Generation (RAG)** pipeline, and a **conversational trip
assistant**.

## External data: places, routing, weather

Three modular, provider-switchable services wrap real external APIs. Keys and
base URLs live server-side only ([providers.js](src/config/providers.js)); the
browser never calls providers directly. Defaults are keyless, terms-friendly
services (swap via env for keyed providers):

| Service | File | Default provider | Endpoints |
| --- | --- | --- | --- |
| `placesService` | [geo/placesService.js](src/services/geo/placesService.js) | Nominatim (OSM) | `GET /places/search`, `GET /places/details` |
| `routeService` | [geo/routeService.js](src/services/geo/routeService.js) | OSRM | `POST /routes/estimate` |
| `weatherService` | [geo/weatherService.js](src/services/geo/weatherService.js) | Open-Meteo | `GET /weather/forecast` |

Shared concerns live in [geo/geoHttp.js](src/services/geo/geoHttp.js): timeouts,
typed `ProviderError`s (incl. `429` rate-limit mapping), an **ephemeral** TTL
cache (provider data is **not** persisted to the DB, respecting OSM/Nominatim
data-storage restrictions), and a per-provider throttle (Nominatim ≤ 1 req/s +
an identifiable `User-Agent`, as its policy requires). All geo routes are
authenticated, Zod-validated, and per-user rate-limited.

**Provenance labelling.** Every response carries a `source` field —
`"api"` (verified live) or `"cache"` (recent API result) — and the provider
name. The map page renders these as coloured badges and distinguishes them from
**AI estimates** (itinerary activity text and costs). Nothing fabricates
provider data: when a provider is unavailable the service returns a typed error
or marks the datum unavailable (graceful fallback), never a fake "real" value.

### Interactive map page

`/trips/:tripId/map` ([MapPage.jsx](../client/src/pages/trips/MapPage.jsx),
Leaflet + OSM tiles) shows verified coordinates, attraction markers (colour-coded
by source), a walking **route estimate** (distance/duration + drawn polyline),
and the weather forecast, plus an attraction search that adds markers. Linked
from the trip dashboard hero ("Map").

### Itinerary grounding (real data in generation)

Before generating, [itineraryGenerator.js](src/services/llm/itineraryGenerator.js)
gathers verified data (best-effort, graceful per-provider fallback):

- **destination coordinates** (geocode),
- **candidate attractions** — real named POIs with coordinates (queried by
  concrete categories, since Nominatim is a geocoder), and
- **weather forecast** for the trip dates (only when within the provider's
  ~16-day horizon; otherwise reported unavailable, never guessed).

These are injected into the prompt as a clearly-labelled *VERIFIED REAL DATA*
block so the LLM grounds on actual places and conditions instead of inventing
them, while **activity descriptions and cost estimates remain AI estimates**.
The verified data is persisted on the itinerary's `enrichment` field (with
`providersUsed` / `unavailable` / sources), kept separate from the AI content so
the two are always distinguishable. The model is told not to claim prices, hours,
or availability are current or verified.

Tests: `node tests/test-geo.js` (places/routes/weather endpoints — validation, live
data, caching, forecast-horizon honesty — 17 checks).

## Conversational assistant (`POST /api/v1/ai/chat`)

A per-trip chat assistant that answers questions about the trip, suggests
activity alternatives, explains estimated costs, generates packing lists, and
pulls in external destination knowledge (RAG) when relevant. Layers are kept
separate:

- **Storage** — [Conversation.js](src/models/Conversation.js) (one per user+trip,
  messages with role/content/timestamp/sources) + [conversationService.js](src/services/chat/conversationService.js)
  (get/create, recent-history window, append-with-trim). Knows nothing about the LLM.
- **Orchestration** — [chatService.js](src/services/chat/chatService.js): loads
  the trip (ownership-scoped) + latest itinerary, retrieves destination
  knowledge via the vector-search service when it clears the threshold, builds a
  system prompt (trip facts + itinerary summary + untrusted KNOWLEDGE block),
  replays recent history as LLM turns, and calls the LLM. No persistence or
  provider code of its own.
- **LLM / retrieval** — reuses `llmService` and `vectorSearchService` (and the
  RAG injection-sanitiser); nothing duplicated.
- **Transport** — `POST /ai/chat` (send) and `GET /ai/chat/:tripId` (history),
  both authenticated, rate-limited, and Zod-validated.
- **UI** — [ChatPanel.jsx](../client/src/components/trips/ChatPanel.jsx) on the
  trip dashboard (history load, typing indicator, error/empty states, source
  chips). Purely presentational.

Guarantees:

- **Ownership** — every turn and the history fetch are scoped to the
  authenticated user's trip (404 otherwise); user ids are never taken from input.
- **No mutations** — the model has no tools and cannot modify/create/delete
  trips or itineraries; the system prompt forbids claiming it did, and it
  directs users to the dashboard controls. (Verified: "delete this trip" →
  "I don't have the ability to delete, create, or modify trips.")
- **Respects constraints** — trip dates, budget, currency, preferences, pace and
  traveller count are in context and the model is told to honour them.
- **Bounded** — conversation context is the last `CHAT_HISTORY_LIMIT` (12)
  messages; stored history is capped at `CHAT_MAX_STORED` (200); a single
  message is ≤ `CHAT_MAX_MESSAGE_CHARS` (2000); request frequency is limited by
  the shared per-user AI rate limiter (10/min).
- **Honesty + injection** — same rules as RAG: no "current/verified" claims, and
  retrieved docs are untrusted data (sanitised + delimited, embedded
  instructions ignored).

Request `{ tripId, message }` → `{ reply, grounded, sources, conversationId }`.
Tests: `node tests/test-chat.js` (validation, ownership, trip Q&A, history, packing
list, cost explanation, RAG sources, no-modify guardrail, injection — 17 checks).

## RAG — grounded question answering (`POST /api/v1/ai/ask`)

[ragService.js](src/services/rag/ragService.js) composes the existing services
(no duplication) into one pipeline and returns an answer plus the sources it was
grounded in. Request body: `{ question, tripId?, destination?, category?, limit? }`.

Pipeline (what each stage does):

1. **Chunking** (ingestion time, [documentIngestion.js](src/services/ingestion/documentIngestion.js)) — long documents are split into overlapping, sentence-aware pieces so each stored unit is a single retrievable idea. Chunk size trades precision vs. context; overlap keeps ideas that straddle a boundary findable. Retrieval can only return what chunking produced.
2. **Embeddings** ([embeddingService.js](src/services/llm/embeddingService.js)) — text (chunks at ingest, the question at query time) is mapped to a 768-d vector where semantic closeness ≈ geometric closeness. The question uses the `RETRIEVAL_QUERY` task type; documents used `RETRIEVAL_DOCUMENT`.
3. **Retrieval** ([vectorSearchService.js](src/services/search/vectorSearchService.js)) — Atlas `$vectorSearch` finds the nearest chunk vectors to the question vector (optionally filtered by destination/category), returning the top matches with similarity scores. This is the "R" — it narrows a large corpus to a few likely-relevant passages.
4. **Context construction** — the top chunks (above the `RAG_MIN_SCORE` relevance threshold) are assembled into a bounded, numbered context block with source references. This is what grounds the answer and lets it cite `[n]`. Oversized context is trimmed to a budget.
5. **Generation** ([llmService.js](src/services/llm/llmService.js)) — the LLM is given the question + context under a strict system prompt and must answer **only** from the provided documents, citing sources. This is the "G" — it turns retrieved facts into a fluent, grounded answer.

### Safety & honesty properties

- **Insufficient evidence** — if nothing clears `RAG_MIN_SCORE` (default `0.78`;
  calibrated so off-topic questions, which score ~0.74 on this embedding model,
  are rejected while real travel questions at ~0.82-0.87 pass), the service
  returns `grounded: false` with an honest "I don't have enough information"
  answer and **no** LLM call — it never fabricates.
- **No false currency claims** — the system prompt forbids stating or implying
  that information is current, live, verified, official, or guaranteed, and asks
  the model to tell users to verify time-sensitive details (prices/hours).
- **Prompt-injection protection** — retrieved documents are untrusted data:
  they are wrapped in `<REFERENCE_DOCUMENTS>` delimiters, the model is told never
  to obey instructions found inside them, and common override phrases
  ("ignore previous instructions", role markers like `system:`, code fences) are
  neutralised in `sanitizeChunk`. (Verified: a chunk/question telling the model
  to reply "PWNED" is ignored.)
- **Ownership** — a supplied `tripId` is loaded scoped to the authenticated user
  (404 otherwise) and used only to add destination/interest context.
- **Validation / timeouts / errors** — Zod validates the request (`strict`);
  embedding + generation inherit the configured timeouts and typed error mapping.

### Sample request / response

Request — `POST /api/v1/ai/ask`:
```json
{ "question": "How do I get around Tokyo using public transport?" }
```

Response — `200 OK`:
```json
{
  "success": true,
  "question": "How do I get around Tokyo using public transport?",
  "answer": "To get around Tokyo, use the dense metro, Toei subway and JR lines … buy a Suica or PASMO IC card and tap in and out [1]. Avoid the morning rush … [2]. (Check current fares before you travel.)",
  "grounded": true,
  "sources": [
    { "ref": 1, "title": "Tokyo — Getting Around", "destination": "Tokyo", "category": "transport", "source": "tripmate/curated/tokyo-transport", "score": 0.884 }
  ],
  "meta": { "retrievedCount": 5, "usedCount": 3, "model": "gemini-flash-lite-latest", "usage": { "inputTokens": 512, "outputTokens": 180 } }
}
```

Off-topic / empty retrieval → `200` with `grounded: false`, `sources: []`, and an
honest "not enough information" answer. Errors: `400` (validation), `401`
(unauthenticated), `404` (unknown `tripId`), `429` (rate limit), `503`
(`GEMINI_API_KEY` unset or index not ready).

Tests: `node tests/test-rag.js` (relevant, irrelevant, empty, filtered, injection — 23 checks).

## Semantic search (MongoDB Atlas Vector Search)

Searches the `TravelDocument` collection's `embedding` field using the
`$vectorSearch` aggregation stage. Verified against **mongoose 9.11 / mongodb
driver 7.7 / MongoDB Atlas**.

- [vectorSearchService.js](src/services/search/vectorSearchService.js) — embeds
  the query (`RETRIEVAL_QUERY` task type), runs `$vectorSearch`, and returns
  chunks with title, content, metadata, source, and a `vectorSearchScore`.
  Supports optional exact-match `destination` / `category` filters. Handles
  empty results, database errors, and a missing/not-ready index (see below).
- `POST /api/v1/ai/search-knowledge` ([ai.controller.js](src/controllers/ai.controller.js))
  — authenticated + rate-limited.

### Required index (dimensions match the embed model)

A **`vectorSearch`** index named `travel_vector_index` on `traveldocuments`.
`numDimensions` must equal `GEMINI_EMBED_DIM` (768):

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "destination" },
    { "type": "filter", "path": "category" }
  ]
}
```

**Create it one of two ways:**

1. **Script (programmatic, this repo):**
   ```bash
   cd server
   node create-vector-index.js     # creates + polls until queryable
   ```
2. **Atlas UI:** Atlas → your cluster → **Atlas Search** → **Create Search Index**
   → **JSON Editor** → index type **Vector Search** → database/collection
   `tripmate-ai` / `traveldocuments` → name `travel_vector_index` → paste the
   JSON above → **Create**. Wait until status is **Active / queryable** (~seconds
   to a few minutes).

> **Atlas only.** `$vectorSearch` runs on Atlas (incl. the free M0 tier), not on
> a local/standalone `mongod`. If `numDimensions` ≠ your stored vector length,
> queries error or return nothing — keep the index and `GEMINI_EMBED_DIM` in sync.

### The aggregation (exact syntax used)

```js
[
  { $vectorSearch: {
      index: "travel_vector_index",
      path: "embedding",
      queryVector: [/* 768 floats */],
      numCandidates: 75,          // ~15 × limit
      limit: 5,
      filter: { destination: "Tokyo" }  // optional; only indexed filter fields
  }},
  { $project: {
      title: 1, content: 1, chunk: 1, destination: 1, category: 1,
      source: 1, metadata: 1,
      score: { $meta: "vectorSearchScore" }
  }}
]
```

### Testing the index

```bash
cd server
node ingest-sample.js        # ensure docs + embeddings exist
node create-vector-index.js  # ensure the index is queryable
node tests/test-search.js          # relevance, filters, empty, limit (17 checks)
```

Quick Atlas-UI smoke test: on the collection, run an aggregation whose first
stage is the `$vectorSearch` above (paste any stored vector as `queryVector`) and
confirm ranked results with scores.

### Handling a missing / not-ready index

Atlas returns an **empty result set (no error)** when the index is missing or
still building — identical to a genuine no-match. So when results are empty the
service calls `listSearchIndexes()` to check the index is `queryable`; if not, it
returns **503 `index_not_ready`** with guidance instead of a misleading "no
results". A genuine no-match (valid index, filter excludes everything) returns
**200** with `count: 0`.

### Sample request / response

Request — `POST /api/v1/ai/search-knowledge` (auth cookie required):
```json
{ "query": "How do I get around the city on trains?", "destination": "Tokyo", "limit": 3 }
```

Response — `200 OK`:
```json
{
  "success": true,
  "query": "How do I get around the city on trains?",
  "count": 2,
  "filters": { "destination": "Tokyo" },
  "results": [
    {
      "id": "…",
      "title": "Tokyo — Getting Around",
      "content": "Tokyo's public transport is dense, punctual …",
      "chunk": { "index": 0, "total": 2 },
      "destination": "Tokyo",
      "category": "transport",
      "source": "tripmate/curated/tokyo-transport",
      "metadata": { "language": "en", "tags": ["metro", "trains", "ic-card"] },
      "score": 0.8441
    }
  ]
}
```

Errors: `400` (missing/empty query, unknown field), `401` (unauthenticated),
`429` (rate limited), `503` (`GEMINI_API_KEY` unset, or index not ready),
`500` (other database errors).


## Embeddings & document ingestion

All embedding work is **server-side only** (reuses `GEMINI_API_KEY`); nothing is
embedded in the React frontend and no key is exposed.

- [embeddingService.js](src/services/llm/embeddingService.js) —
  `embedText(text)` and `embedBatch(texts)` via `gemini-embedding-001`
  (configurable model + `outputDimensionality`, default 768). It handles empty
  input (`empty_input`), translates API errors/timeouts to typed `LlmError`s,
  batches up to `GEMINI_EMBED_BATCH` texts per request, de-dupes identical texts
  within a batch and across calls (bounded cache), and L2-normalises vectors so
  cosine similarity is valid at truncated dimensions.
- [TravelDocument.js](src/models/TravelDocument.js) — one row per chunk:
  `title`, `content` (chunk text), `chunk {index,total}`, `destination`,
  `category`, `source`, `metadata`, `embedding`, `embeddingModel/Dim`,
  `contentHash`, timestamps. Indexed on `destination+category` and uniquely on
  `(source, chunk.index)` for idempotent re-ingestion.
- [documentIngestion.js](src/services/ingestion/documentIngestion.js) — accepts
  a curated document, splits it into overlapping chunks (`chunkText`), preserves
  metadata, embeds the chunks (reusing any already in the DB by `contentHash`,
  so re-runs cost no API calls), and upserts chunks + vectors.

**Sample dataset + ingest script:** [src/data/sampleTravelDocs.js](src/data/sampleTravelDocs.js)
and [ingest-sample.js](ingest-sample.js):

```bash
cd server
node ingest-sample.js                                  # ingest the sample set
CHUNK_SIZE=600 CHUNK_OVERLAP=100 node ingest-sample.js # tune chunking
node tests/test-embedding.js                                 # service + chunking tests
```

### How chunk size and overlap affect retrieval quality

Embedding search matches a query vector against **chunk** vectors, so how you cut
documents into chunks directly shapes what can be retrieved.

- **Chunk size** is a precision/recall trade-off. *Smaller* chunks (e.g. 300–500
  chars) produce focused vectors: a match is tightly on-topic (high precision),
  and you can return just the relevant passage, but a single idea may be split
  across chunks and lose surrounding context. *Larger* chunks (e.g. 1,000–1,500
  chars) keep more context together (better recall for multi-sentence ideas) but
  dilute the vector — one chunk covering several topics matches queries weakly
  and returns extra, less-relevant text. A few hundred to ~1,000 characters,
  aligned to natural boundaries (sentences/paragraphs, as the chunker does), is a
  good general default. Also keep chunks within the embedding model's input
  limit.
- **Overlap** repeats a slice of the end of one chunk at the start of the next.
  It prevents a sentence or fact that straddles a boundary from being
  "orphaned" — without overlap, content split across the cut can be hard to
  retrieve from either chunk because neither contains the whole thought. Typical
  overlap is ~10–20% of chunk size (here 150 of 900). *Too little* overlap risks
  losing boundary context; *too much* overlap stores near-duplicate chunks,
  which wastes embedding calls and storage and can crowd results with repetitive
  passages. The defaults (`CHUNK_SIZE=900`, `CHUNK_OVERLAP=150`) balance these;
  tune per corpus — denser reference text benefits from smaller chunks, flowing
  prose from larger ones.


## Itinerary generation

`POST /api/v1/ai/generate-itinerary` (body `{ tripId }`) builds a structured plan
from an owned trip and saves it as a versioned [Itinerary](src/models/Itinerary.js).
`GET /api/v1/ai/itinerary/:tripId` returns the latest version.

- **Structured output:** uses Gemini's `responseMimeType: "application/json"` +
  `responseJsonSchema` ([llmService.generateStructured](src/services/llm/llmService.js)),
  then validates the parsed result with Zod ([itinerary.validator.js](src/validators/itinerary.validator.js)).
- **Ownership:** the trip is loaded scoped to the authenticated user; a trip they
  don't own returns `404`.
- **Dates:** day numbers and dates are assigned **in JS** from the trip's start
  date (not trusted from the model) and verified to fall within the trip window.
  Trips longer than `ITINERARY_MAX_DAYS` (default 7) are covered for the first N
  days, with a `notes` message.
- **Costs:** every cost is validated `>= 0`; per-day and grand totals are summed
  **in JavaScript** ([itineraryGenerator.js](src/services/llm/itineraryGenerator.js)) —
  the model's arithmetic is never trusted.
- **Honesty:** every itinerary carries a `disclaimer`; the frontend shows it
  prominently and labels all prices as estimates.

Each day contains: date + day number, morning/afternoon/evening activities
(attraction name, description, suggested duration, estimated cost), food
recommendations, a transportation suggestion, travel tips, and a day cost.

### Editing (dashboard)

- `PATCH /api/v1/ai/itinerary/:itineraryId` — persist user edits (edit / reorder /
  delete activities). The client sends the desired `days`; the server preserves
  each day's date and number and **recomputes every cost and the grand total in
  JS** — client-sent totals/dates are rejected (`strict` schema). Negative costs
  are rejected. Ownership is enforced via the authenticated user id.
- `POST /api/v1/ai/itinerary/:itineraryId/day/:dayNumber/regenerate` — regenerate
  a single day via the LLM, keeping its date/number, then recompute totals.

Both run without a trip/itinerary owned by someone else (they return `404`).
Test with `node tests/test-itinerary-edit.js` (validation/ownership run without a key;
edit/regenerate correctness needs `GEMINI_API_KEY`).

Generate across scenarios with `node tests/test-itinerary.js` (auth/validation/ownership
run without a key; live generation needs `GEMINI_API_KEY`).

## Key principle: the API key never leaves the server

## Key principle: the API key never leaves the server

The `GEMINI_API_KEY` is read from the server environment only. The frontend
calls our own authenticated endpoint (`POST /api/v1/ai/test`); it never sees or
sends the provider key.

```
Browser ──(cookie auth)──▶ Express /api/v1/ai/test ──(API key)──▶ Gemini API
```

## Architecture

| File | Responsibility |
| --- | --- |
| [src/config/llm.js](src/config/llm.js) | Reads env, applies defaults, clamps user-supplied generation params |
| [src/services/llm/llmService.js](src/services/llm/llmService.js) | Owns the SDK client; `generateResponse()`; error/timeout translation; token usage |
| [src/middleware/rateLimit.js](src/middleware/rateLimit.js) | Per-user in-memory request limit for AI routes |
| [src/validators/ai.validator.js](src/validators/ai.validator.js) | Zod validation for the test endpoint |
| [src/controllers/ai.controller.js](src/controllers/ai.controller.js) | Handler for `POST /ai/test` |
| [src/routes/ai.routes.js](src/routes/ai.routes.js) | Routes (protected + rate-limited) |

### `llmService.generateResponse(opts)`

```js
import { generateResponse } from "./src/services/llm/llmService.js";

const result = await generateResponse({
  system: "You are a travel assistant.",   // optional system instruction
  userMessage: "Best time to visit Japan?", // or: messages: [{ role, content }]
  model: "gemini-flash-lite-latest",                // optional override
  maxTokens: 1024,                           // optional (clamped to cap)
  temperature: 0.7,                          // optional (0–2)
});
// → { text, model, finishReason, usage: { inputTokens, outputTokens, thoughtsTokens, totalTokens } }
```

What it handles:

- **System + user messages** — `system` maps to Gemini's `systemInstruction`; `userMessage` or a `messages` array maps to `contents` (roles are normalised: `assistant` → `model`).
- **Model + generation params** — configurable via env or per call; invalid values fall back to config and are clamped.
- **Errors & timeouts** — Gemini `ApiError` (by HTTP `.status`) and aborts are translated to a typed `LlmError` carrying an HTTP `statusCode`, a stable `code`, and a `retryable` flag. Timeout is enforced via `AbortSignal.timeout(...)`.
- **Token usage** — returned on every call (`usage`, incl. Gemini's `thoughtsTokens`).
- **Request limits** — input length is capped (`LLM_MAX_INPUT_CHARS`), output tokens clamped (`LLM_MAX_OUTPUT_TOKENS_CAP`), and AI routes rate-limited per user (`LLM_RATE_*`). Safety blocks surface as `422`.

> **Thinking level:** Gemini 3.x are thinking models and use a *thinking level*
> (not a numeric budget). We pass `GEMINI_THINKING_LEVEL` (default `LOW`) to keep
> the test endpoint fast and cheap — `MINIMAL` | `LOW` | `MEDIUM` | `HIGH`. Set
> it to `NONE` (or blank) to omit the field entirely, which some models require.
> `usage.thoughtsTokens` in the response shows how many thinking tokens were used.
>
> **Model choice:** the default is `gemini-flash-lite-latest` — fast (~1–2s),
> cheap, and an always-current alias (so it won't hit a "model retired for new
> users" error). Heavier models like `gemini-3.8-flash` work too but are slower
> and far more likely to be throttled/queued on the free tier.

## Environment configuration

Add to `server/.env` (see [.env.example](.env.example)):

```bash
# Required to enable AI features (server-side only)
GEMINI_API_KEY=...                  # https://aistudio.google.com/apikey

# Optional — model + generation parameters
GEMINI_MODEL=gemini-flash-lite-latest       # default
GEMINI_MAX_OUTPUT_TOKENS=1024
GEMINI_TEMPERATURE=0.7              # 0–2
GEMINI_THINKING_LEVEL=LOW          # MINIMAL | LOW | MEDIUM | HIGH | NONE

# Optional — resilience & limits
GEMINI_TIMEOUT_MS=60000
GEMINI_MAX_RETRIES=2
LLM_MAX_INPUT_CHARS=8000
LLM_MAX_OUTPUT_TOKENS_CAP=4096
LLM_RATE_WINDOW_MS=60000
LLM_RATE_MAX=10
```

## Endpoint

### `POST /api/v1/ai/test` (authenticated)

**Request**
```json
{ "message": "What are the best months to visit Japan?" }
```
Optional: `model`, `maxTokens` (1–4096), `temperature` (0–2).

**Response — `200 OK`**
```json
{
  "success": true,
  "reply": "Spring (March–May) for cherry blossoms, and autumn (October–November) for foliage...",
  "meta": {
    "model": "gemini-flash-lite-latest",
    "finishReason": "STOP",
    "usage": { "inputTokens": 42, "outputTokens": 95, "thoughtsTokens": 0, "totalTokens": 137 }
  }
}
```

**Error responses**

| Status | When |
| --- | --- |
| `400` | Validation failed (missing/blank message, unknown field, bad temperature), or provider rejected the request |
| `401` | Not authenticated |
| `413` | Message exceeds `LLM_MAX_INPUT_CHARS` |
| `422` | Prompt blocked by safety filters |
| `429` | Per-user rate limit, or provider rate limit |
| `503` | `GEMINI_API_KEY` not configured |
| `502` / `504` | Provider/auth/connection error, or timeout |

## Frontend test interface

Protected page at **`/ai-test`** ("Ask AI" in the navbar when logged in):
[client/src/pages/ai/AiTest.jsx](../client/src/pages/ai/AiTest.jsx). It posts the
question to `/api/v1/ai/test` via [client/src/services/ai.js](../client/src/services/ai.js),
shows loading/error states, and renders the reply plus token usage. The browser
never handles the provider key.

## Testing

### Automated

```bash
cd server
npm run dev          # terminal 1 (needs MongoDB; AI key optional)
node tests/test-ai.js      # terminal 2
```

- Without `GEMINI_API_KEY`: verifies auth gating + validation; the live call is skipped (endpoint returns `503`).
- With `GEMINI_API_KEY` set: also asserts a real `200` reply with token usage, and prints the answer.

### Manual (curl)

```bash
# 1) Log in and capture the cookie
curl -s -c cookies.txt -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"YourPassword"}'

# 2) Ask a travel question
curl -s -b cookies.txt -X POST http://localhost:5000/api/v1/ai/test \
  -H "Content-Type: application/json" \
  -d '{"message":"Suggest a 3-day itinerary for Lisbon."}'
```

### Frontend

1. Set `GEMINI_API_KEY` in `server/.env`, start both servers (`npm run dev` in `server/` and `client/`).
2. Log in, click **Ask AI**, enter a travel question, submit.
