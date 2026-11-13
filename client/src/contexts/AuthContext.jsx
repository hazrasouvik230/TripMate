import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import api, { getAuthToken, setAuthToken } from "../services/api";

const AuthContext = createContext(null);

/**
 * Provides authentication state and methods to the entire app.
 *
 * On mount it calls GET /auth/me to restore a session from the
 * httpOnly cookie (persistent login across page reloads).
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until initial check completes

  /* ---- Restore session on mount ---- */
  const fetchUser = useCallback(async () => {
    // No stored token → not logged in; skip the network round-trip.
    if (!getAuthToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.get("/auth/me");
      setUser(data.user);
    } catch {
      setAuthToken(null); // stale/invalid token → clear it
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  /* ---- Auth actions ---- */
  const register = async (formData) => {
    const data = await api.post("/auth/register", formData);
    setAuthToken(data.token);
    setUser(data.user);
    return data;
  };

  const login = async (formData) => {
    const data = await api.post("/auth/login", formData);
    setAuthToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setAuthToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Hook to access auth context.
 * Must be called inside an <AuthProvider>.
 */
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
};

