import "dotenv/config";
import mongoose from "mongoose";
import User, { USER_ROLES } from "../models/User.js";

/**
 * Promote (or demote) a user by email.
 *
 *   npm run make-admin -- someone@example.com          # → admin
 *   npm run make-admin -- someone@example.com user     # → back to user
 *
 * Roles are deliberately NOT self-assignable via the API, so this little
 * script is the supported way to grant admin access.
 */
const run = async () => {
  const [email, roleArg] = process.argv.slice(2);
  const role = roleArg || "admin";

  if (!email) {
    console.error("Usage: npm run make-admin -- <email> [role]");
    process.exit(1);
  }
  if (!USER_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". Must be one of: ${USER_ROLES.join(", ")}`);
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Check your server/.env file.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    console.error(`No user found with email "${email}".`);
    await mongoose.disconnect();
    process.exit(1);
  }

  user.role = role;
  await user.save();
  console.log(`✅ ${user.email} is now "${role}".`);

  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (err) => {
  console.error("❌ Failed to update role:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
