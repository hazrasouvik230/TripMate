import mongoose from "mongoose";

/* ---------- Allowed values ---------- */

export const TRAVEL_STYLES = ["budget", "balanced", "comfort", "luxury"];
export const TRAVEL_PACES = ["relaxed", "moderate", "fast"];
export const TRIP_STATUSES = [
  "draft",
  "planned",
  "ongoing",
  "completed",
  "cancelled",
];
// Whether `budget` is the overall figure or a per-traveller figure.
export const BUDGET_TYPES = ["total", "per_person"];

// Returns a fresh gender-count definition so the two composition groups
// (adults / children) don't share the same object reference.
const genderCounts = () => ({
  male: { type: Number, min: [0, "Count cannot be negative"], max: [50, "Count cannot exceed 50"], default: 0 },
  female: { type: Number, min: [0, "Count cannot be negative"], max: [50, "Count cannot exceed 50"], default: 0 },
  other: { type: Number, min: [0, "Count cannot be negative"], max: [50, "Count cannot exceed 50"], default: 0 },
});

// Sum of the six composition counts on a trip document.
const compositionTotal = (c) =>
  c
    ? (c.adults?.male || 0) +
      (c.adults?.female || 0) +
      (c.adults?.other || 0) +
      (c.children?.male || 0) +
      (c.children?.female || 0) +
      (c.children?.other || 0)
    : 0;

const tripSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      index: true,
    },
    origin: {
      type: String,
      required: [true, "Origin is required"],
      trim: true,
      maxlength: [120, "Origin cannot exceed 120 characters"],
    },
    stopover: {
      type: String,
      trim: true,
      maxlength: [120, "Stopover cannot exceed 120 characters"],
      default: "",
    },
    destination: {
      type: String,
      required: [true, "Destination is required"],
      trim: true,
      maxlength: [120, "Destination cannot exceed 120 characters"],
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
    },
    travellers: {
      type: Number,
      required: [true, "Number of travellers is required"],
      min: [1, "There must be at least 1 traveller"],
      max: [50, "Number of travellers cannot exceed 50"],
    },
    // Breakdown of travellers by age group and gender. Each count defaults to
    // 0; when provided on create/update the six counts must sum to `travellers`
    // (enforced in the validator and the pre-validate hook below).
    composition: {
      adults: genderCounts(),
      children: genderCounts(),
    },
    budget: {
      type: Number,
      min: [0, "Budget cannot be negative"],
      default: 0,
    },
    // How `budget` should be read: the overall trip total, or per traveller.
    budgetType: {
      type: String,
      enum: {
        values: BUDGET_TYPES,
        message: "`{VALUE}` is not a valid budget type",
      },
      default: "total",
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      minlength: [3, "Currency must be a 3-letter ISO code"],
      maxlength: [3, "Currency must be a 3-letter ISO code"],
      default: "INR",
    },
    interests: {
      type: [String],
      default: [],
    },
    travelStyle: {
      type: String,
      enum: {
        values: TRAVEL_STYLES,
        message: "`{VALUE}` is not a valid travel style",
      },
      default: "balanced",
    },
    travelPace: {
      type: String,
      enum: {
        values: TRAVEL_PACES,
        message: "`{VALUE}` is not a valid travel pace",
      },
      default: "moderate",
    },
    status: {
      type: String,
      enum: {
        values: TRIP_STATUSES,
        message: "`{VALUE}` is not a valid status",
      },
      default: "draft",
      index: true,
    },
  },
  { timestamps: true }
);

/* ---------- Indexes ---------- */

// Most list queries filter by owner and sort by recency.
tripSchema.index({ userId: 1, createdAt: -1 });
// Supports owner + status filtering.
tripSchema.index({ userId: 1, status: 1 });

/* ---------- Validation ---------- */

// Defence-in-depth: reject end dates before start dates at the DB layer too.
// Mongoose 9 no longer passes `next` to middleware — just return.
tripSchema.pre("validate", function () {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate("endDate", "End date cannot be earlier than start date");
  }
  // If a breakdown has been provided (any count > 0), it must add up to the
  // total number of travellers.
  const total = compositionTotal(this.composition);
  if (total > 0 && this.travellers != null && total !== this.travellers) {
    this.invalidate(
      "composition",
      `Traveller breakdown must add up to ${this.travellers}`
    );
  }
});

/* ---------- Serialisation ---------- */

tripSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model("Trip", tripSchema);
