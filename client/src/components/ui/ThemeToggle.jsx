import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";

/**
 * Button that flips between light and dark themes.
 *
 * @param {string} [className] - extra classes (layout tweaks per placement)
 */
const ThemeToggle = ({ className = "" }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-slate-100 transition cursor-pointer dark:text-slate-300 dark:hover:text-indigo-400 dark:hover:bg-slate-800 ${className}`}
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
};

export default ThemeToggle;
