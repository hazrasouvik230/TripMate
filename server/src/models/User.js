import mongoose from "mongoose";
import bcryptjs from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, "Password is required"],
      select: false, // Never returned by default
    },
    travelPreferences: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

/* ---------- Hooks ---------- */

// Hash password before saving (only when modified).
// Mongoose 9 no longer passes `next` to async middleware — return a promise.
userSchema.pre("save", async function () {
  if (!this.isModified("passwordHash")) return;
  this.passwordHash = await bcryptjs.hash(this.passwordHash, 12);
});

/* ---------- Methods ---------- */

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcryptjs.compare(candidatePassword, this.passwordHash);
};

/* ---------- Serialisation ---------- */

// Strip sensitive / noisy fields from every JSON / toObject call
userSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model("User", userSchema);

