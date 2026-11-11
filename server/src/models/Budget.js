import mongoose from "mongoose";

/**
 * Per-trip budget: a list of estimated expense items across fixed categories.
 * One budget document per (userId, tripId). Amounts are validated non-negative.
 */
export const BUDGET_CATEGORIES = [
  "accommodation",
  "food",
  "transportation",
  "activities", // attractions & activities
  "shopping",
  "misc",
];

const itemSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: { values: BUDGET_CATEGORIES, message: "`{VALUE}` is not a valid budget category" },
      required: true,
    },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"],
    },
    date: { type: Date, default: null }, // optional day this expense falls on
    source: { type: String, enum: ["user", "itinerary"], default: "user" },
  }
  // keep _id so items can be edited/deleted individually
);

const budgetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    currency: { type: String, required: true, uppercase: true, trim: true },
    items: { type: [itemSchema], default: [] },
  },
  { timestamps: true }
);

budgetSchema.index({ userId: 1, tripId: 1 }, { unique: true });

budgetSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model("Budget", budgetSchema);
