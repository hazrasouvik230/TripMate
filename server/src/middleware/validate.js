import mongoose from "mongoose";

/**
 * Build a 400 "Validation failed" response from a ZodError.
 */
const sendValidationError = (res, error) => {
  // Zod 4 uses `issues`, Zod 3 uses `errors` — support both
  const issues = error.issues || error.errors || [];

  return res.status(400).json({
    success: false,
    message: "Validation failed",
    errors: issues.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    })),
  });
};

/**
 * Express middleware that validates `req.body` against a Zod schema.
 * On success the parsed (and transformed) data replaces req.body.
 * On failure a 400 response with field-level errors is returned.
 */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    return sendValidationError(res, result.error);
  }

  req.body = result.data; // overwrite with sanitised values
  next();
};

/**
 * Like `validate`, but targets `req.query`. The parsed result is attached to
 * `req.validatedQuery` (Express 5's `req.query` is a read-only getter).
 */
export const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);

  if (!result.success) {
    return sendValidationError(res, result.error);
  }

  req.validatedQuery = result.data;
  next();
};

/**
 * Ensures the given route param is a valid MongoDB ObjectId, returning a
 * clean 400 instead of letting a cast error bubble to the error handler.
 */
export const validateObjectId =
  (param = "id") =>
  (req, res, next) => {
    const value = req.params[param];
    if (!mongoose.isValidObjectId(value)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${param}`,
      });
    }
    next();
  };
