import Trip from "../models/Trip.js";
import Itinerary from "../models/Itinerary.js";
import Budget from "../models/Budget.js";
import { summarize, buildSeedItems } from "../services/trip/budgetService.js";
import { getRate } from "../services/trip/fxService.js";

/* Load the user's own trip (ownership enforced) or null. */
const loadOwnedTrip = (tripId, userId) => Trip.findOne({ _id: tripId, userId }).exec();

/* Get or create the budget doc; seed from the latest itinerary on first create. */
const getOrCreateBudget = async (trip, userId) => {
  let budget = await Budget.findOne({ tripId: trip._id, userId });
  if (budget) return budget;
  const itinerary = await Itinerary.findOne({ tripId: trip._id, userId }).sort({ version: -1 });
  const items = buildSeedItems(itinerary);
  return Budget.create({ userId, tripId: trip._id, currency: trip.currency || "INR", items });
};

/* Resolve an optional display-currency conversion (graceful on failure). */
const resolveConversion = async (fromCurrency, display) => {
  if (!display || display.toUpperCase() === fromCurrency.toUpperCase()) return null;
  const to = display.toUpperCase();
  try {
    const { rate, date, provider } = await getRate(fromCurrency, to);
    return { available: true, to, rate, date, provider };
  } catch (e) {
    return { available: false, to, note: e.message || "Conversion unavailable." };
  }
};

const respond = async (res, trip, budget, display) => {
  const conversion = await resolveConversion(budget.currency, display);
  const summary = summarize({ trip, items: budget.items, conversion });
  res.status(200).json({ success: true, budget, summary });
};

/* GET /api/v1/trips/:tripId/budget?display=USD */
export const getBudget = async (req, res, next) => {
  try {
    const trip = await loadOwnedTrip(req.params.tripId, req.user._id);
    if (!trip) return res.status(404).json({ success: false, message: "Trip not found" });
    const budget = await getOrCreateBudget(trip, req.user._id);
    await respond(res, trip, budget, req.validatedQuery?.display);
  } catch (error) {
    next(error);
  }
};

/* POST /api/v1/trips/:tripId/budget/items */
export const addItem = async (req, res, next) => {
  try {
    const trip = await loadOwnedTrip(req.params.tripId, req.user._id);
    if (!trip) return res.status(404).json({ success: false, message: "Trip not found" });
    const budget = await getOrCreateBudget(trip, req.user._id);
    budget.items.push({ ...req.body, source: "user" });
    await budget.save();
    res.status(201).json({
      success: true,
      budget,
      summary: summarize({ trip, items: budget.items }),
    });
  } catch (error) {
    next(error);
  }
};

/* PATCH /api/v1/trips/:tripId/budget/items/:itemId */
export const updateItem = async (req, res, next) => {
  try {
    const trip = await loadOwnedTrip(req.params.tripId, req.user._id);
    if (!trip) return res.status(404).json({ success: false, message: "Trip not found" });
    const budget = await Budget.findOne({ tripId: trip._id, userId: req.user._id });
    const item = budget?.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, message: "Budget item not found" });

    const { category, label, amount, date } = req.body;
    if (category !== undefined) item.category = category;
    if (label !== undefined) item.label = label;
    if (amount !== undefined) item.amount = amount; // schema min:0 re-validates
    if (date !== undefined) item.date = date; // null clears
    await budget.save();
    res.status(200).json({
      success: true,
      budget,
      summary: summarize({ trip, items: budget.items }),
    });
  } catch (error) {
    next(error);
  }
};

/* DELETE /api/v1/trips/:tripId/budget/items/:itemId */
export const deleteItem = async (req, res, next) => {
  try {
    const trip = await loadOwnedTrip(req.params.tripId, req.user._id);
    if (!trip) return res.status(404).json({ success: false, message: "Trip not found" });
    const budget = await Budget.findOne({ tripId: trip._id, userId: req.user._id });
    const item = budget?.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, message: "Budget item not found" });
    item.deleteOne();
    await budget.save();
    res.status(200).json({
      success: true,
      budget,
      summary: summarize({ trip, items: budget.items }),
    });
  } catch (error) {
    next(error);
  }
};
