import Trip from "../models/Trip.js";

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/trips                                               */
/* ------------------------------------------------------------------ */
export const createTrip = async (req, res, next) => {
  try {
    const trip = await Trip.create({
      ...req.body, // already validated by Zod
      userId: req.user._id, // ownership is derived from the session, never the body
    });

    res.status(201).json({
      success: true,
      message: "Trip created successfully",
      trip,
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  GET  /api/v1/trips                                                */
/* ------------------------------------------------------------------ */
export const listTrips = async (req, res, next) => {
  try {
    const { status, page, limit, sort } = req.validatedQuery;

    const filter = { userId: req.user._id };
    if (status) filter.status = status;

    const skip = (page - 1) * limit;

    const [trips, total] = await Promise.all([
      Trip.find(filter).sort(sort).skip(skip).limit(limit),
      Trip.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: trips.length,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      trips,
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  GET  /api/v1/trips/:tripId                                        */
/* ------------------------------------------------------------------ */
export const getTrip = async (req, res, next) => {
  try {
    // Ownership enforced in the query itself — a non-owner gets a 404.
    const trip = await Trip.findOne({
      _id: req.params.tripId,
      userId: req.user._id,
    });

    if (!trip) {
      return res
        .status(404)
        .json({ success: false, message: "Trip not found" });
    }

    res.status(200).json({ success: true, trip });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH  /api/v1/trips/:tripId                                      */
/* ------------------------------------------------------------------ */
export const updateTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.tripId,
      userId: req.user._id,
    });

    if (!trip) {
      return res
        .status(404)
        .json({ success: false, message: "Trip not found" });
    }

    // Apply validated fields, then save so model-level validators
    // (including the end-vs-start-date check against merged values) run.
    Object.assign(trip, req.body);
    await trip.save();

    res.status(200).json({
      success: true,
      message: "Trip updated successfully",
      trip,
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  DELETE  /api/v1/trips/:tripId                                     */
/* ------------------------------------------------------------------ */
export const deleteTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findOneAndDelete({
      _id: req.params.tripId,
      userId: req.user._id,
    });

    if (!trip) {
      return res
        .status(404)
        .json({ success: false, message: "Trip not found" });
    }

    res.status(200).json({
      success: true,
      message: "Trip deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
