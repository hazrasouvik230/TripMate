import { verifyToken } from "../utils/token.js";
import User from "../models/User.js";

/**
 * Protect middleware — reads the JWT from the httpOnly cookie,
 * verifies it, loads the user, and attaches it to `req.user`.
 */
export const protect = async (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Not authenticated — please log in" });
  }

  try {
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "User no longer exists" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};

