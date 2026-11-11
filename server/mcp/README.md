# TripMate AI — MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
TripMate's travel capabilities as validated tools for MCP-compatible clients
(Claude Desktop, IDE assistants, etc.). Built with the official
`@modelcontextprotocol/sdk`.

It is **separate from the Express app** (lives in `server/mcp/`, not in the
routes) and **not required for the website to work** — it's an optional
integration surface. The main app stays JavaScript; only this server is
TypeScript (run via `tsx`), as the SDK is TS-first.

It **reuses the existing backend services** (places, weather, vector search,
Trip/Itinerary models, budget and packing services) — no business logic is
duplicated.

## Tools

| Tool | Access | Purpose |
| --- | --- | --- |
| `search_attractions` | public | Search attractions/places (name, coordinates, category). |
| `get_place_details` | public | Details for a place id from `search_attractions`. |
| `search_travel_knowledge` | public | Semantic search over the curated knowledge base. |
| `get_weather_forecast` | public | Daily forecast by coordinates or place name (within provider horizon). |
| `get_trip_details` | **private** | One of the authenticated user's own trips. |
| `get_itinerary` | **private** | Latest itinerary for the user's own trip. |
| `calculate_trip_budget` | **private** | Deterministic budget breakdown for the user's trip. |
| `create_packing_list` | **private** | Packing list for the user's trip (uses real weather when available). |

Every tool: has a declared input schema (Zod), validates arguments, returns a
predictable `structuredContent` object (plus a text rendering), and reports
errors as `{ isError: true, structuredContent: { error } }`. **All tools are
read-only / compute-only — none create, modify, or delete trips or itineraries.**

## Authentication & authorization

The server resolves **one acting user at startup** from environment variables
and scopes every private tool to that user's id. A user can never read another
user's data: private tools query `{ _id: tripId, userId: <authed user> }`, so a
trip owned by someone else simply returns "Trip not found".

Provide **one** of:

- `TRIPMATE_JWT` — a JWT issued by the app (same token as the login cookie), **or**
- `TRIPMATE_EMAIL` + `TRIPMATE_PASSWORD` — credentials verified against the DB.

Without either, the server still starts: **public tools work; private tools
return an auth error.** (Reuses the app's `JWT_SECRET`, so that must match.)

Minting a token for testing:

```js
// node (from server/)
import "dotenv/config";
import { generateToken } from "./src/utils/token.js";
console.log(generateToken("<yourUserId>"));
```

## Startup

Requires the same `.env` as the app (at least `MONGODB_URI` and `JWT_SECRET`;
`GEMINI_API_KEY` for `search_travel_knowledge`; the Atlas vector index for
knowledge search). From `server/`:

```bash
npm install          # installs @modelcontextprotocol/sdk + tsx
TRIPMATE_JWT=<token> npm run mcp
# or
TRIPMATE_EMAIL=you@example.com TRIPMATE_PASSWORD=yourpass npm run mcp
```

On start it connects to MongoDB, resolves the user, and serves on **stdio**.
(All logs go to stderr — stdout is reserved for the MCP protocol.)

## Transport

**stdio** (default and the only transport here) — the client launches the
server as a child process and talks JSON-RPC over stdin/stdout. This suits
local clients like Claude Desktop. (For a remote/HTTP deployment you would add
the SDK's Streamable HTTP transport and put real per-request auth in front; not
enabled here.)

## Connecting a client

### Claude Desktop

Add to its MCP config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tripmate-ai": {
      "command": "npx",
      "args": ["tsx", "mcp/server.ts"],
      "cwd": "C:/Users/shazra/Desktop/Repositories/Project/server",
      "env": {
        "TRIPMATE_JWT": "<your token>",
        "MONGODB_URI": "<your mongodb uri>",
        "JWT_SECRET": "<same as the app>",
        "GEMINI_API_KEY": "<your key>"
      }
    }
  }
}
```

Restart the client; the eight tools appear under "tripmate-ai".

### Programmatic (official SDK client over stdio)

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--import", "tsx", "mcp/server.ts"],
  cwd: "/path/to/server",
  env: { ...process.env, TRIPMATE_JWT: "<token>" },
});
const client = new Client({ name: "my-client", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
const res = await client.callTool({
  name: "search_attractions",
  arguments: { query: "museums", near: "Rome", limit: 3 },
});
console.log(res.structuredContent);
```

## Testing

```bash
cd server
node tests/test-mcp.mjs   # spawns the server over stdio and exercises every tool
```

Covers tool listing, public tools (live), private tools, **cross-user denial**,
argument validation, and the no-auth refusal path (14 checks).
