import mongoose from "mongoose";

/**
 * A chat conversation between a user and the AI assistant, scoped to one trip.
 * One conversation per (userId, tripId); messages are appended in order.
 */
const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: { type: String, required: true, trim: true },
    // Optional: source refs the assistant grounded a reply on (titles/sources).
    sources: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
      index: true,
    },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true }
);

// One conversation per user+trip.
conversationSchema.index({ userId: 1, tripId: 1 }, { unique: true });

conversationSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model("Conversation", conversationSchema);
