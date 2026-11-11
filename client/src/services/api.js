import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// Request interceptor
api.interceptors.request.use(
  (config) => config,
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
