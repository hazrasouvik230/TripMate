import mongoose from "mongoose";

/* ---------- Sub-schemas ---------- */

// A single morning / afternoon / evening activity.
const activitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // attraction name
    description: { type: String, default: "", trim: true },
    durationMinutes: { type: Number, min: 0, default: 0 }, // suggested visit duration
    estimatedCost: { type: Number, min: 0, default: 0 }, // in itinerary currency
  },
  { _id: false }
);

// A food recommendation.
const foodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["breakfast", "lunch", "dinner", "snack"],
      default: "lunch",
    },
    description: { type: String, default: "", trim: true },
    estimatedCost: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

// A suggested place to stay for the night. Display-only: its pricePerNight is
// NOT included in estimatedDayCost / estimatedTotalCost (those track activities
// + food, matching the budget service). Stored as a list of options per day;
// empty on days without an overnight stay.
const accommodationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    area: { type: String, default: "", trim: true }, // neighbourhood / locality
    type: { type: String, default: "", trim: true }, // hotel, guesthouse, hostel, …
    pricePerNight: { type: Number, min: 0, default: 0 }, // in itinerary currency
  },
  { _id: false }
);

// One day of the plan.
const daySchema = new mongoose.Schema(
  {
    dayNumber: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true },
    summary: { type: String, default: "", trim: true },

    morning: { type: activitySchema, default: null },
    afternoon: { type: activitySchema, default: null },
    evening: { type: activitySchema, default: null },

    food: { type: [foodSchema], default: [] },
    transportation: { type: String, default: "", trim: true },
    accommodation: { type: [accommodationSchema], default: [] },
    tips: { type: [String], default: [] },

    // Computed in JS (sum of activity + food costs), never trusted from the LLM.
    estimatedDayCost: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

/* ---------- Itinerary ---------- */

const itinerarySchema = new mongoose.Schema(
  {
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    version: { type: Number, required: true, min: 1, default: 1 },

    days: { type: [daySchema], default: [] },

    // Computed in JS from day costs.
    estimatedTotalCost: { type: Number, min: 0, default: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },

    // Provenance / honesty metadata.
    model: { type: String, default: "" },
    disclaimer: { type: String, default: "" },
    notes: { type: String, default: "" }, // e.g. "covers first N of M days"

    // Set when the realistic plan exceeds the user's budget: suggests a more
    // comfortable figure. Numbers are in `currency`. Null when within budget.
    budgetAdvisory: {
      type: new mongoose.Schema(
        {
          setBudget: Number,
          estimatedTotalCost: Number,
          shortfall: Number,
          recommendedBudget: Number,
          currency: String,
          suggestions: { type: [String], default: [] },
        },
        { _id: false }
      ),
      default: null,
    },

    // Verified data from external APIs used to ground generation (coordinates,
    // candidate attractions, weather) with their providers/sources. Kept
    // SEPARATE from the AI-generated activity text/costs so the two are
    // distinguishable. Empty/partial when a provider was unavailable.
    enrichment: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

/* ---------- Indexes ---------- */
// Fetch the latest version for a trip/user quickly.
itinerarySchema.index({ tripId: 1, userId: 1, version: -1 });

/* ---------- Serialisation ---------- */
itinerarySchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model("Itinerary", itinerarySchema);
