import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

const ThemeContext = createContext(null);

const STORAGE_KEY = "theme"; // "light" | "dark" | "system"

const getSystemDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-color-scheme: dark)").matches;

const readStoredPreference = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    /* localStorage unavailable (private mode, etc.) */
  }
  return "system";
};

/** Resolve a preference ("light" | "dark" | "system") to an actual theme. */
const resolveTheme = (preference) =>
  preference === "system" ? (getSystemDark() ? "dark" : "light") : preference;

/**
 * Provides theme state to the app. `preference` is what the user chose
 * (including "system"); `theme` is the resolved, applied value ("light"|"dark").
 *
 * The <html> `.dark` class is applied synchronously here, and an inline script
 * in index.html applies it before first paint to prevent a flash on load.
 */
export const ThemeProvider = ({ children }) => {
  const [preference, setPreference] = useState(readStoredPreference);
  const [theme, setTheme] = useState(() => resolveTheme(readStoredPreference()));

  // Apply the resolved theme to <html> and persist the preference.
  useEffect(() => {
    const resolved = resolveTheme(preference);
    setTheme(resolved);
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* ignore persistence failures */
    }
  }, [preference]);

  // When following the system, react to OS-level changes live.
  useEffect(() => {
    if (preference !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => {
      const resolved = e.matches ? "dark" : "light";
      setTheme(resolved);
      document.documentElement.classList.toggle("dark", resolved === "dark");
    };
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [preference]);

  // Flip between light and dark explicitly (based on what's currently shown).
  const toggleTheme = useCallback(() => {
    setPreference(resolveTheme(preference) === "dark" ? "light" : "dark");
  }, [preference]);

  return (
    <ThemeContext.Provider
      value={{ theme, preference, setPreference, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

/** Access theme state. Must be used inside <ThemeProvider>. */
export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
};
