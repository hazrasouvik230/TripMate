import User from "../models/User.js";
import {
  generateToken,
  setTokenCookie,
  clearTokenCookie,
} from "../utils/token.js";

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/auth/register                                       */
/* ------------------------------------------------------------------ */
export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body; // already validated by Zod

    // Duplicate-email guard
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const user = await User.create({
      name,
      email,
      passwordHash: password, // hashed by the pre-save hook
    });

    const token = generateToken(user._id);
    setTokenCookie(res, token);

    res.status(201).json({
      success: true,
      message: "Registration successful",
      user,
    });
  } catch (error) {
    // Safety net: MongoDB duplicate-key error (race condition)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/auth/login                                          */
/* ------------------------------------------------------------------ */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Always return a generic message so attackers can't enumerate users
    const INVALID_MSG = "Invalid email or password";

    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user) {
      return res.status(401).json({ success: false, message: INVALID_MSG });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: INVALID_MSG });
    }

    const token = generateToken(user._id);
    setTokenCookie(res, token);

    res.status(200).json({
      success: true,
      message: "Login successful",
      user, // toJSON strips passwordHash
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  GET  /api/v1/auth/me                                              */
/* ------------------------------------------------------------------ */
export const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
};

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/auth/logout                                         */
/* ------------------------------------------------------------------ */
export const logout = (_req, res) => {
  clearTokenCookie(res);
  res.status(200).json({ success: true, message: "Logged out successfully" });
};

