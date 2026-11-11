import { searchPlaces, getPlaceDetails } from "../services/geo/placesService.js";
import { estimateRoute } from "../services/geo/routeService.js";
import { getForecast } from "../services/geo/weatherService.js";

/* GET /api/v1/places/search */
export const placesSearch = async (req, res, next) => {
  try {
    const { q, near, limit } = req.validatedQuery;
    const { source, provider, results } = await searchPlaces({ query: q, near, limit });
    res.status(200).json({ success: true, source, provider, count: results.length, results });
  } catch (error) {
    next(error);
  }
};

/* GET /api/v1/places/details */
export const placesDetails = async (req, res, next) => {
  try {
    const { placeId } = req.validatedQuery;
    const { source, provider, place } = await getPlaceDetails(placeId);
    res.status(200).json({ success: true, source, provider, place });
  } catch (error) {
    next(error);
  }
};

/* POST /api/v1/routes/estimate */
export const routesEstimate = async (req, res, next) => {
  try {
    const { waypoints, profile, geometry } = req.body;
    const result = await estimateRoute({ waypoints, profile, geometry });
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/* GET /api/v1/weather/forecast */
export const weatherForecast = async (req, res, next) => {
  try {
    const { lat, lon, startDate, endDate } = req.validatedQuery;
    const result = await getForecast({ lat, lon, startDate, endDate });
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};
