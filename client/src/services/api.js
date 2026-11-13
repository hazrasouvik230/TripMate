import axios from "axios";

const TOKEN_KEY = "tripmate_token";

/** Read the stored JWT (null if not logged in). */
export const getAuthToken = () => localStorage.getItem(TOKEN_KEY);

/** Store the JWT (pass null/undefined to clear it, e.g. on logout). */
export const setAuthToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// Request interceptor — attach the Bearer token so auth works cross-domain
// (Vercel frontend → Render backend), where third-party cookies are blocked.
api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const serverData = error.response?.data;
    const err = new Error(
      serverData?.message || error.message || "Something went wrong"
    );
    err.status = error.response?.status;
    err.errors = serverData?.errors || null; // Zod field-level errors
    return Promise.reject(err);
  }
);

export default api;
