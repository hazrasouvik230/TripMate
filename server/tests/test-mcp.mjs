/**
 * TripMate AI — MCP server tests.
 *
 * Spawns the MCP server over real stdio (via the official SDK client), minting
 * a JWT for a freshly-created test user, and exercises the tools — including
 * cross-user denial and the no-auth path.
 *
 * Requires MONGODB_URI (+ GEMINI_API_KEY and the vector index for the
 * knowledge tool). Run from server/:  node tests/test-mcp.mjs
 */
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import User from "../src/models/User.js";
import Trip from "../src/models/Trip.js";
import Itinerary from "../src/models/Itinerary.js";
import { generateToken } from "../src/utils/token.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const assert = (l, c) => { console.log(`  ${c ? "✅" : "❌"} ${l}`); c ? pass++ : fail++; };
const plusDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const sc = (res) => res?.structuredContent || {};

async function connectClient(env) {
  const transport = new StdioClientTransport({
    command: process.execPath, // node
    args: ["--import", "tsx", path.join(dir, "mcp", "server.ts")],
    cwd: dir,
    env: { ...process.env, ...env },
    stderr: "inherit",
  });
  const client = new Client({ name: "tripmate-test", version: "1.0.0" });
  await client.connect(transport);
  return { client, transport };
}

async function run() {
  console.log("\n🧪 TripMate AI — MCP Server Tests\n");
  await connectDB();

  // Two users; A is the MCP user, B owns a separate trip (must be inaccessible).
  const stamp = Date.now();
  const userA = await User.create({ name: "Mcp A", email: `mcpa_${stamp}@tm.dev`, passwordHash: "SecurePass123" });
  const userB = await User.create({ name: "Mcp B", email: `mcpb_${stamp}@tm.dev`, passwordHash: "SecurePass123" });
  const tripA = await Trip.create({ userId: userA._id, destination: "Rome", origin: "London", startDate: plusDays(2), endDate: plusDays(4), travellers: 2, budget: 2000, currency: "EUR", interests: ["History", "Food & Dining"], travelStyle: "balanced", travelPace: "moderate", status: "planned" });
  const tripB = await Trip.create({ userId: userB._id, destination: "Paris", startDate: plusDays(10), endDate: plusDays(12), travellers: 1, currency: "EUR" });
  await Itinerary.create({ tripId: tripA._id, userId: userA._id, version: 1, currency: "EUR", estimatedTotalCost: 600, days: [{ dayNumber: 1, date: plusDays(2), summary: "Ancient Rome", morning: { name: "Colosseum", description: "Amphitheatre", durationMinutes: 120, estimatedCost: 36 }, afternoon: { name: "Roman Forum", description: "Ruins", durationMinutes: 120, estimatedCost: 0 }, evening: { name: "Trastevere dinner", description: "Dinner", durationMinutes: 90, estimatedCost: 60 }, food: [], transportation: "Metro", tips: ["Book ahead"], estimatedDayCost: 96 }], disclaimer: "AI-generated." });

  const tokenA = generateToken(userA._id);

  /* ---- Authenticated as user A ---- */
  console.log("1️⃣  Connect (authenticated as A)");
  const { client, transport } = await connectClient({ TRIPMATE_JWT: tokenA });

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  const expected = ["search_attractions", "get_place_details", "search_travel_knowledge", "get_weather_forecast", "calculate_trip_budget", "get_trip_details", "get_itinerary", "create_packing_list"];
  assert(`exposes all ${expected.length} tools`, expected.every((n) => names.includes(n)));
  assert("tools have input schemas", tools.every((t) => t.inputSchema && t.inputSchema.type === "object"));

  console.log("\n2️⃣  Public tools (live)");
  const att = await client.callTool({ name: "search_attractions", arguments: { query: "museums", near: "Rome", limit: 3 } });
  const providerUp = !att.isError && sc(att).count >= 0;
  if (!providerUp) {
    console.log("  ⚠️  places provider/LLM not reachable — skipping live tool assertions:", sc(att).error);
  } else {
    assert("search_attractions returns results + source", sc(att).count > 0 && !!sc(att).source);
    const wx = await client.callTool({ name: "get_weather_forecast", arguments: { location: "Rome", startDate: plusDays(2), endDate: plusDays(4) } });
    assert("get_weather_forecast returns daily data", Array.isArray(sc(wx).days) && sc(wx).days.length > 0);
    const kb = await client.callTool({ name: "search_travel_knowledge", arguments: { query: "getting around Tokyo by train" } });
    assert("search_travel_knowledge returns chunks", Array.isArray(sc(kb).results));
  }

  console.log("\n3️⃣  Private tools (ownership enforced)");
  const td = await client.callTool({ name: "get_trip_details", arguments: { tripId: tripA._id.toString() } });
  assert("get_trip_details returns A's trip", !td.isError && sc(td).trip?.destination === "Rome");

  const cross = await client.callTool({ name: "get_trip_details", arguments: { tripId: tripB._id.toString() } });
  assert("CANNOT read another user's trip (not found)", cross.isError === true && /not found/i.test(sc(cross).error));

  const badId = await client.callTool({ name: "get_trip_details", arguments: { tripId: "not-an-id" } });
  assert("invalid tripId rejected by schema", badId.isError === true);

  const it = await client.callTool({ name: "get_itinerary", arguments: { tripId: tripA._id.toString() } });
  assert("get_itinerary returns A's itinerary", !it.isError && sc(it).itinerary?.version === 1);

  const bud = await client.callTool({ name: "calculate_trip_budget", arguments: { tripId: tripA._id.toString() } });
  assert("calculate_trip_budget computes structured breakdown", !bud.isError && sc(bud).budget?.userBudget?.amount === 2000 && sc(bud).budget?.estimatedActivitiesCost?.amount === 600);
  assert("budget is JS-computed per-person", sc(bud).budget?.estimatedActivitiesCost?.perPerson === 300);

  const pack = await client.callTool({ name: "create_packing_list", arguments: { tripId: tripA._id.toString() } });
  assert("create_packing_list returns categorised list", !pack.isError && !!sc(pack).packingList?.categories?.essentials?.length);

  await client.close();
  await transport.close?.();

  /* ---- No auth: private tools must refuse ---- */
  console.log("\n4️⃣  Without auth → private tools refuse");
  const { client: anon, transport: anonT } = await connectClient({ TRIPMATE_JWT: "", TRIPMATE_EMAIL: "", TRIPMATE_PASSWORD: "" });
  const noauth = await anon.callTool({ name: "get_trip_details", arguments: { tripId: tripA._id.toString() } });
  assert("unauthenticated get_trip_details → auth error", noauth.isError === true && /authentication required/i.test(sc(noauth).error));
  const pub = await anon.callTool({ name: "search_attractions", arguments: { query: "parks", near: "Rome", limit: 2 } });
  assert("public tool still works without auth", !pub.isError || /reach|rate|provider/i.test(sc(pub).error || ""));
  await anon.close();
  await anonT.close?.();

  // Cleanup
  await Promise.all([
    User.deleteMany({ _id: { $in: [userA._id, userB._id] } }),
    Trip.deleteMany({ _id: { $in: [tripA._id, tripB._id] } }),
    Itinerary.deleteMany({ tripId: { $in: [tripA._id, tripB._id] } }),
  ]);
  await mongoose.connection.close();

  console.log(`\n📊 Results: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(async (e) => {
  console.error("Fatal:", e);
  try { await mongoose.connection.close(); } catch { /* ignore */ }
  process.exit(1);
});
