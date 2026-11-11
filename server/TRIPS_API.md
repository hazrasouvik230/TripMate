# Trips API

All trip endpoints are **authenticated** — send the `token` httpOnly cookie
issued by `POST /api/v1/auth/register` or `POST /api/v1/auth/login`.
Every read/update/delete is scoped to the authenticated user; a trip owned by
someone else responds exactly like a missing one (`404`), so ownership is never
leaked.

Base URL: `http://localhost:5000/api/v1`

## Trip object

| Field         | Type       | Notes                                                                 |
| ------------- | ---------- | --------------------------------------------------------------------- |
| `userId`      | ObjectId   | Owner. Derived from the session — **ignored if sent in the body**.    |
| `origin`      | string     | Optional, ≤ 120 chars.                                                |
| `destination` | string     | **Required**, 1–120 chars.                                            |
| `startDate`   | date       | **Required**. ISO string or timestamp.                                |
| `endDate`     | date       | **Required**. Must be **≥ `startDate`**.                              |
| `travellers`  | number     | **Required**. Integer 1–50.                                           |
| `budget`      | number     | Optional, ≥ 0. Defaults to `0`.                                       |
| `currency`    | string     | Optional 3-letter ISO code, stored uppercase. Defaults to `USD`.      |
| `interests`   | string[]   | Optional, ≤ 30 entries.                                               |
| `travelStyle` | enum       | `budget` \| `balanced` \| `comfort` \| `luxury`. Defaults `balanced`. |
| `travelPace`  | enum       | `relaxed` \| `moderate` \| `fast`. Defaults `moderate`.               |
| `status`      | enum       | `draft` \| `planned` \| `ongoing` \| `completed` \| `cancelled`. Defaults `draft`. |
| `createdAt` / `updatedAt` | date | Managed by Mongoose timestamps.                              |

Unknown fields are rejected (`strict` schemas) with `400`.

## Response conventions

- Success: `{ "success": true, ... }`
- Failure: `{ "success": false, "message": "...", "errors"?: [{ field, message }] }`
- Status codes: `201` create · `200` read/update/delete · `400` validation / bad id ·
  `401` unauthenticated · `404` missing or not-owned.

## Indexes

- `{ userId: 1, createdAt: -1 }` — owner listing, newest first (default sort).
- `{ userId: 1, status: 1 }` — owner + status filtering.
- `userId` and `status` single-field indexes.

---

## POST `/api/v1/trips`

**Request**
```json
{
  "origin": "London",
  "destination": "Tokyo",
  "startDate": "2026-12-01",
  "endDate": "2026-12-10",
  "travellers": 2,
  "budget": 4000,
  "currency": "gbp",
  "interests": ["food", "temples"],
  "travelStyle": "comfort",
  "travelPace": "moderate"
}
```

**Response — `201 Created`**
```json
{
  "success": true,
  "message": "Trip created successfully",
  "trip": {
    "userId": "6ae484f4eb5ed6cb2c019ba0",
    "origin": "London",
    "destination": "Tokyo",
    "startDate": "2026-12-01T00:00:00.000Z",
    "endDate": "2026-12-10T00:00:00.000Z",
    "travellers": 2,
    "budget": 4000,
    "currency": "GBP",
    "interests": ["food", "temples"],
    "travelStyle": "comfort",
    "travelPace": "moderate",
    "status": "draft",
    "_id": "6ae484f5eb5ed6cb2c019ba1",
    "createdAt": "2026-10-30T11:52:21.171Z",
    "updatedAt": "2026-10-30T11:52:21.171Z"
  }
}
```

**Response — `400` (validation)**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "travellers", "message": "There must be at least 1 traveller" },
    { "field": "endDate", "message": "End date cannot be earlier than start date" }
  ]
}
```

---

## GET `/api/v1/trips`

Query params (all optional): `status`, `page` (≥1, default 1),
`limit` (1–100, default 20), `sort` (`-createdAt` default, `createdAt`,
`startDate`, `-startDate`).

**Request:** `GET /api/v1/trips?status=planned&limit=2`

**Response — `200 OK`**
```json
{
  "success": true,
  "count": 1,
  "pagination": { "total": 1, "page": 1, "limit": 2, "totalPages": 1 },
  "trips": [
    {
      "_id": "6ae484f5eb5ed6cb2c019ba1",
      "userId": "6ae484f4eb5ed6cb2c019ba0",
      "destination": "Tokyo",
      "startDate": "2026-12-01T00:00:00.000Z",
      "endDate": "2026-12-10T00:00:00.000Z",
      "travellers": 2,
      "status": "planned",
      "createdAt": "2026-10-30T11:52:21.171Z",
      "updatedAt": "2026-10-30T11:52:21.171Z"
    }
  ]
}
```

---

## GET `/api/v1/trips/:tripId`

**Response — `200 OK`**
```json
{ "success": true, "trip": { "_id": "6ae484f5eb5ed6cb2c019ba1", "destination": "Tokyo", "...": "..." } }
```

**Response — `400` (malformed id):** `{ "success": false, "message": "Invalid tripId" }`

**Response — `404` (missing or not owned):** `{ "success": false, "message": "Trip not found" }`

---

## PATCH `/api/v1/trips/:tripId`

Partial update — send any subset of writable fields (at least one).
The end-vs-start-date rule is re-checked against the **merged** document, so a
patch that moves `endDate` before the stored `startDate` is rejected.

**Request**
```json
{ "status": "ongoing", "budget": 5000 }
```

**Response — `200 OK`**
```json
{
  "success": true,
  "message": "Trip updated successfully",
  "trip": { "_id": "6ae484f5eb5ed6cb2c019ba1", "status": "ongoing", "budget": 5000, "...": "..." }
}
```

**Response — `400` (empty body):** `{ "success": false, "message": "Validation failed", "errors": [{ "field": "", "message": "At least one field must be provided to update" }] }`

---

## DELETE `/api/v1/trips/:tripId`

**Response — `200 OK`**
```json
{ "success": true, "message": "Trip deleted successfully" }
```

**Response — `404`:** `{ "success": false, "message": "Trip not found" }`

---

## Testing

With the server running (`npm run dev`) and MongoDB reachable:

```bash
node tests/test-trips.js
```

Covers auth gating, every validation rule (dates, travellers, budget, enums,
unknown fields), pagination/filtering, invalid & missing ids, cross-user
ownership on read/update/delete, and the full create→list→get→update→delete
lifecycle. Current status: **38/38 passing**.
