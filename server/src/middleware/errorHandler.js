/**
 * Custom error class with status code support.
 */
export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 handler — catches requests that don't match any route.
 */
export const notFoundHandler = (req, res, next) => {
  next(new AppError(`Not found — ${req.originalUrl}`, 404));
};

/**
 * Centralized error handler middleware.
 */
export const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let errors;

  // Mongoose schema validation failure → 400 with field-level details
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Validation failed";
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // Malformed ObjectId / failed cast → 400
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path}`;
  }

  // Log the error in development
  if (process.env.NODE_ENV === "development") {
    console.error("🔥 Error:", err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(errors && { errors }),
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

