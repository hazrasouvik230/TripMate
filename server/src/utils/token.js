import jwt from "jsonwebtoken";

/**
 * Create a signed JWT containing the user's id.
 */
export const generateToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

/**
 * Verify and decode a JWT.  Throws on invalid / expired tokens.
 */
export const verifyToken = (token) =>
  jwt.verify(token, process.env.JWT_SECRET);

/**
 * Write the JWT into an httpOnly cookie on the response.
 *
 * Security notes:
 *  • httpOnly  – JavaScript cannot read the cookie (XSS-safe)
 *  • secure    – cookie only sent over HTTPS in production
 *  • sameSite  – "lax" blocks most cross-site request forgery
 *  • path: "/" – cookie available to all routes
 */
export const setTokenCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });
};

/**
 * Clear the auth cookie (logout).
 */
export const clearTokenCookie = (res) => {
  res.cookie("token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
};

