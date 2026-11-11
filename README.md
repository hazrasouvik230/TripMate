# 🧳 TripMate AI

A full-stack MERN application for AI-powered trip planning.

## Tech Stack

| Layer    | Technology                                          |
| -------- | --------------------------------------------------- |
| Frontend | React 19, Vite, Tailwind CSS v4, React Router, Axios, Lucide React |
| Backend  | Node.js, Express.js, MongoDB, Mongoose              |
| Module   | ES Modules throughout                               |

## Project Structure

```
Project/
├── client/                    # React frontend
│   ├── public/
│   ├── src/
│   │   ├── assets/            # Static assets (images, fonts)
│   │   ├── components/        # Reusable UI components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── pages/             # Page-level components
│   │   │   └── Landing.jsx
│   │   ├── services/          # API client & service layer
│   │   │   └── api.js
│   │   ├── utils/             # Utility functions
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── .env.example
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── server/                    # Express backend
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js          # MongoDB connection
│   │   ├── controllers/       # Route handlers
│   │   ├── middleware/
│   │   │   └── errorHandler.js
│   │   ├── models/            # Mongoose schemas
│   │   ├── routes/
│   │   │   ├── index.js       # Route aggregator
│   │   │   └── health.routes.js
│   │   ├── services/          # Business logic
│   │   └── utils/             # Helper functions
│   ├── .env.example
│   ├── server.js              # Entry point
│   └── package.json
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

- Node.js ≥ 18
- MongoDB (local or Atlas)

### 1. Clone & install

```bash
# Server
cd server
cp .env.example .env        # Edit .env with your MongoDB URI
npm install

# Client
cd ../client
cp .env.example .env
npm install
```

### 2. Configure environment

**server/.env**
```
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/tripmate-ai
CLIENT_URL=http://localhost:5173
```

**client/.env**
```
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

### 3. Run development servers

```bash
# Terminal 1 — Backend
cd server
npm run dev

# Terminal 2 — Frontend
cd client
npm run dev
```

| Service  | URL                                       |
| -------- | ----------------------------------------- |
| Frontend | http://localhost:5173                      |
| Backend  | http://localhost:5000                      |
| Health   | http://localhost:5000/api/v1/health        |

## API Endpoints

| Method | Endpoint                  | Auth | Description               |
| ------ | ------------------------- | ---- | ------------------------- |
| GET    | `/api/v1/health`          | —    | Health check              |
| POST   | `/api/v1/auth/register`   | —    | Create an account         |
| POST   | `/api/v1/auth/login`      | —    | Log in                    |
| GET    | `/api/v1/auth/me`         | ✅   | Current user              |
| POST   | `/api/v1/auth/logout`     | ✅   | Log out                   |
| POST   | `/api/v1/trips`           | ✅   | Create a trip             |
| GET    | `/api/v1/trips`           | ✅   | List the user's trips     |
| GET    | `/api/v1/trips/:tripId`   | ✅   | Get a single trip         |
| PATCH  | `/api/v1/trips/:tripId`   | ✅   | Update a trip             |
| DELETE | `/api/v1/trips/:tripId`   | ✅   | Delete a trip             |
| POST   | `/api/v1/ai/test`         | ✅   | Ask the AI a travel question |
| POST   | `/api/v1/ai/generate-itinerary` | ✅ | Generate a day-by-day itinerary for a trip |
| GET    | `/api/v1/ai/itinerary/:tripId`  | ✅ | Latest saved itinerary for a trip |
| PATCH  | `/api/v1/ai/itinerary/:itineraryId` | ✅ | Persist edits (edit / reorder / delete activities) |
| POST   | `/api/v1/ai/itinerary/:itineraryId/day/:dayNumber/regenerate` | ✅ | Regenerate a single day |
| POST   | `/api/v1/ai/search-knowledge` | ✅ | Semantic search over curated travel docs (Atlas Vector Search) |
| POST   | `/api/v1/ai/ask`          | ✅   | Ask a grounded travel question (RAG: retrieve + generate) |
| POST   | `/api/v1/ai/chat`         | ✅   | Conversational trip assistant (history + RAG) |
| GET    | `/api/v1/ai/chat/:tripId` | ✅   | Conversation history for a trip |
| GET    | `/api/v1/places/search`   | ✅   | Search attractions (places) |
| GET    | `/api/v1/places/details`  | ✅   | Place details by id |
| POST   | `/api/v1/routes/estimate` | ✅   | Route distance/duration between waypoints |
| GET    | `/api/v1/weather/forecast`| ✅   | Daily weather forecast by coordinates |
| GET    | `/api/v1/trips/:tripId/budget` | ✅ | Budget summary (categories, daily, totals, remaining; `?display=USD`) |
| POST   | `/api/v1/trips/:tripId/budget/items` | ✅ | Add an estimated expense |
| PATCH  | `/api/v1/trips/:tripId/budget/items/:itemId` | ✅ | Edit an expense |
| DELETE | `/api/v1/trips/:tripId/budget/items/:itemId` | ✅ | Delete an expense |

Authenticated routes require the `token` httpOnly cookie set at login/register.
See [server/TRIPS_API.md](server/TRIPS_API.md) for the full trips contract, and
[server/AI_INTEGRATION.md](server/AI_INTEGRATION.md) for the LLM/RAG/geo
integration (setup, env vars, and testing).

Deterministic **budget management** (categories, daily/total/remaining, optional
currency conversion) is documented in [server/BUDGET.md](server/BUDGET.md).

An optional **MCP server** (Model Context Protocol) exposes TripMate's tools to
MCP-compatible clients — it's separate from Express and not required for the
app. See [server/mcp/README.md](server/mcp/README.md).

## License

MIT

