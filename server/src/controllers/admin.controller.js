import Payment from "../models/Payment.js";
import User from "../models/User.js";
import Trip from "../models/Trip.js";

/**
 * Admin controller — platform-wide views for the admin dashboard. Every
 * handler here assumes `protect` + `requireAdmin` have already run, so there's
 * no per-user ownership scoping: admins see data across ALL users.
 *
 * Payment amounts are stored in the smallest currency unit (e.g. paise for
 * INR). Revenue figures returned here are converted to MAJOR units (e.g. ₹) so
 * the client can format them directly.
 */

const MINOR_PER_MAJOR = 100;
const toMajor = (minor) => Math.round((minor || 0)) / MINOR_PER_MAJOR;

/** Local-timezone `yyyy-mm-dd` for a Date. */
const dayKey = (date) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

/* ------------------------------------------------------------------ */
/*  GET  /api/v1/admin/analytics                                      */
/* ------------------------------------------------------------------ */
/**
 * Dashboard overview: headline counts, payment status breakdown, revenue by
 * currency, a daily revenue series for the primary currency, top paying
 * users, and trips-by-status. Built from a handful of aggregations so the
 * dashboard loads in a single request.
 */
export const getAnalytics = async (req, res, next) => {
  try {
    const REVENUE_DAYS = 14; // length of the daily revenue series

    const [
      totalUsers,
      totalTrips,
      totalTransactions,
      statusAgg,
      revenueByCurrency,
      tripsByStatusAgg,
      topUsersAgg,
    ] = await Promise.all([
      User.countDocuments(),
      Trip.countDocuments(),
      Payment.countDocuments(),
      // Count + settled revenue per status.
      Payment.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            amount: { $sum: "$amount" },
          },
        },
      ]),
      // Paid revenue grouped by currency (amounts can span currencies).
      Payment.aggregate([
        { $match: { status: "paid" } },
        {
          $group: {
            _id: "$currency",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),
      Trip.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      // Highest-spending users (paid only), with name/email joined in.
      Payment.aggregate([
        { $match: { status: "paid" } },
        {
          $group: {
            _id: "$userId",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            userId: "$_id",
            total: 1,
            count: 1,
            name: "$user.name",
            email: "$user.email",
          },
        },
      ]),
    ]);

    // ---- Payment status breakdown (always include every status) ----
    const byStatus = { created: 0, paid: 0, failed: 0 };
    for (const row of statusAgg) {
      if (row._id in byStatus) byStatus[row._id] = row.count;
    }
    const paidCount = byStatus.paid;
    const failedCount = byStatus.failed;
    // Of the payments that reached a terminal state, how many succeeded.
    const settled = paidCount + failedCount;
    const successRate = settled > 0 ? Math.round((paidCount / settled) * 100) : 0;

    // ---- Revenue by currency (major units) ----
    const revenue = revenueByCurrency.map((r) => ({
      currency: r._id,
      total: toMajor(r.total),
      count: r.count,
    }));
    const primaryCurrency = revenue[0]?.currency || "INR";

    // ---- Daily revenue series for the primary currency ----
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (REVENUE_DAYS - 1));

    const dailyAgg = await Payment.aggregate([
      {
        $match: {
          status: "paid",
          currency: primaryCurrency,
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          amount: { $sum: "$amount" },
        },
      },
    ]);
    const dailyMap = new Map(dailyAgg.map((d) => [d._id, d.amount]));

    // Fill every day in the window (including zeros) so the chart is continuous.
    const revenueByDay = [];
    for (let i = 0; i < REVENUE_DAYS; i += 1) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = dayKey(d);
      revenueByDay.push({ date: key, amount: toMajor(dailyMap.get(key) || 0) });
    }

    // ---- Trips by status ----
    const tripsByStatus = {};
    for (const row of tripsByStatusAgg) tripsByStatus[row._id] = row.count;

    const topUsers = topUsersAgg.map((u) => ({
      ...u,
      total: toMajor(u.total),
    }));

    res.status(200).json({
      success: true,
      analytics: {
        totals: {
          users: totalUsers,
          trips: totalTrips,
          transactions: totalTransactions,
        },
        payments: {
          byStatus,
          successRate, // %
        },
        revenue: {
          primaryCurrency,
          byCurrency: revenue,
          byDay: revenueByDay,
        },
        tripsByStatus,
        topUsers,
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  GET  /api/v1/admin/transactions                                   */
/* ------------------------------------------------------------------ */
/**
 * Paginated list of every payment on the platform, newest first by default.
 * Supports filtering by status and a free-text search over the Razorpay
 * order / payment ids and the receipt. The payer (name/email) and the trip
 * (origin → destination) are joined in for display.
 */
export const listTransactions = async (req, res, next) => {
  try {
    const { status, search, page, limit, sort } = req.validatedQuery;

    const filter = {};
    if (status) filter.status = status;
    if (search) {
      // Escape regex metacharacters so a raw id search is literal.
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ orderId: rx }, { paymentId: rx }, { receipt: rx }];
    }

    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Payment.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate("userId", "name email")
        .populate("tripId", "origin destination"),
      Payment.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: transactions.length,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      transactions,
    });
  } catch (error) {
    next(error);
  }
};
