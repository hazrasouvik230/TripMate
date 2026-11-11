# Budget Management

Deterministic, per-trip budget tracking across six categories:
**accommodation, food, transportation, attractions & activities, shopping,
miscellaneous**. No amount or total is ever produced by the LLM.

## Model & service

- [Budget.js](src/models/Budget.js) — one document per `(userId, tripId)` with a
  list of expense `items` (`category`, `label`, `amount`, optional `date`,
  `source`). `amount` is validated `>= 0` at the schema **and** the Zod layer.
- [budgetService.js](src/services/trip/budgetService.js) — pure, deterministic
  JavaScript:
  - `summarize({ trip, items, conversion })` → category totals, daily totals,
    total estimated cost, `perDay`, `perPerson`, user budget, and **remaining**
    (`budget − total`, with `overBudget`). All computed in JS; any client-sent
    totals are ignored.
  - `buildSeedItems(itinerary)` → seeds a new budget from a saved itinerary's
    activity + food costs (so the budget reflects the generated plan). Seeded
    items are marked `source: "itinerary"`.

## Endpoints (authenticated; trip ownership enforced)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/trips/:tripId/budget?display=USD` | Summary (creates + seeds on first access) |
| POST | `/api/v1/trips/:tripId/budget/items` | Add an estimated expense |
| PATCH | `/api/v1/trips/:tripId/budget/items/:itemId` | Edit an expense |
| DELETE | `/api/v1/trips/:tripId/budget/items/:itemId` | Delete an expense |

A trip you don't own returns `404`; negative or invalid amounts return `400`.

## Currency

All amounts are stored and computed in the **trip's currency** and every value
is labelled with its currency code. Optional **display conversion** via
`?display=<CUR>` uses [fxService.js](src/services/trip/fxService.js) →
Frankfurter (European Central Bank reference rates, keyless; configurable).

Assumptions are made **explicit**: a converted summary includes
`conversion: { from, to, rate, provider, asOf, disclaimer }`, where the
disclaimer states the exact rate used and that it is an *indicative mid-market*
rate (your bank/card rate will differ). If a rate is **unavailable** (unsupported
currency or provider down), conversion degrades gracefully —
`conversion: { available: false, note }` — and the base-currency totals are
still returned. Nothing is fabricated.

## Honesty

Amounts are user- or AI-estimated, **not booked or quoted prices**, and the UI
and API both say so. Itinerary-seeded costs carry a "from itinerary" marker
(AI estimates); user-entered items are the traveller's own estimates.

## Frontend

Responsive dashboard at `/trips/:tripId/budget`
([BudgetDashboard.jsx](../client/src/pages/trips/BudgetDashboard.jsx)): summary
cards (total / budget / remaining / per-person / per-day), a by-category bar
breakdown and a by-day bar chart ([BudgetCharts.jsx](../client/src/components/trips/BudgetCharts.jsx)),
add/edit/delete expenses, and a display-currency selector that surfaces the
conversion assumption. Charts are single-hue (the axis already names each
category/day) with direct value labels — no color-only encoding.

## Testing

`node tests/test-budget.js` — validation (non-negative, categories), ownership,
exact deterministic totals (category/daily/total/remaining/per-person/per-day),
edit/delete recomputation, and FX conversion (available + gracefully
unavailable). 27 checks.
