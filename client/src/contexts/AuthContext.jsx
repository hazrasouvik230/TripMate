import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import api from "../services/api";

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
    try {
      const data = await api.get("/auth/me");
      setUser(data.user);
    } catch {
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
    setUser(data.user);
    return data;
  };

  const login = async (formData) => {
    const data = await api.post("/auth/login", formData);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
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

