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

const isProd = process.env.NODE_ENV === "production";

/**
 * Shared cookie options.
 *
 * Security notes:
 *  • httpOnly  – JavaScript cannot read the cookie (XSS-safe)
 *  • secure    – cookie only sent over HTTPS in production
 *  • sameSite  – "none" in production so the cookie is sent on cross-site
 *                requests (frontend on Vercel, backend on Render); "lax" in
 *                development where frontend + backend share localhost.
 *                Note: "none" REQUIRES secure: true.
 *  • path: "/" – cookie available to all routes
 */
const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
};

/**
 * Write the JWT into an httpOnly cookie on the response.
 */
export const setTokenCookie = (res, token) => {
  res.cookie("token", token, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

/**
 * Clear the auth cookie (logout).
 */
export const clearTokenCookie = (res) => {
  res.cookie("token", "", {
    ...cookieOptions,
    maxAge: 0,
  });
};

