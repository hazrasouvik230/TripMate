import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { MapPin, Menu, X, LogOut, Luggage, ChevronDown, ShieldCheck } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import Button from "../ui/Button";
import ThemeToggle from "../ui/ThemeToggle";

const NAV_LINKS = [
  { label: "Destinations", href: "#destinations" },
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
];

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user, loading, logout } = useAuth();
  const { push } = useToast();
  const { pathname } = useLocation();
  // The section links (#destinations, #features, #how-it-works) only exist on
  // the landing page, so only surface them there.
  const isHome = pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = async () => {
    setMobileOpen(false);
    await logout();
    push("Logged out successfully");
  };

  return (
    <nav
      className={`sticky top-0 z-50 transition-shadow duration-300 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60 ${
        scrolled ? "shadow-md shadow-slate-900/5" : ""
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* ---- Logo ---- */}
          <Link
            to="/"
            className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white">
              <MapPin className="w-5 h-5" />
            </div>
            TripMate&nbsp;
            <span className="text-indigo-600">AI</span>
          </Link>

          {/* ---- Desktop links (home page only) ---- */}
          {isHome && (
            <div className="hidden md:flex items-center gap-8">
              {NAV_LINKS.map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors dark:text-slate-300 dark:hover:text-indigo-400"
                >
                  {label}
                </a>
              ))}
            </div>
          )}

          {/* ---- Desktop right side ---- */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            {loading ? (
              <div className="w-20 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            ) : user ? (
              /* Logged-in state */
              <div className="flex items-center gap-3">
                {user.role === "admin" && (
                  <Link
                    to="/admin"
                    className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors px-3 py-2 rounded-lg hover:bg-slate-100 dark:text-slate-300 dark:hover:text-indigo-400 dark:hover:bg-slate-800"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Admin
                  </Link>
                )}
                <Link
                  to="/trips"
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors px-3 py-2 rounded-lg hover:bg-slate-100 dark:text-slate-300 dark:hover:text-indigo-400 dark:hover:bg-slate-800"
                >
                  <Luggage className="w-4 h-4" />
                  My Trips
                </Link>
                {/* Profile — reveals the logout menu on hover/focus */}
                <div className="relative group">
                  <button
                    type="button"
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer transition-colors hover:bg-slate-200 dark:hover:bg-slate-700"
                    aria-haspopup="menu"
                  >
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold">
                      {user.name?.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 max-w-[120px] truncate">
                      {user.name}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-hover:rotate-180" />
                  </button>

                  {/* Dropdown (pt-2 bridges the gap so hover doesn't drop) */}
                  <div className="absolute right-0 top-full pt-2 w-full min-w-[12rem] z-50 opacity-0 invisible translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:visible group-focus-within:translate-y-0">
                    <div className="rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5 py-1 dark:border-slate-800 dark:bg-slate-900">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer dark:text-slate-300 dark:hover:text-red-400 dark:hover:bg-red-500/10"
                      >
                        <LogOut className="w-4 h-4" />
                        Log out
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Guest state */
              <>
                <Button variant="ghost" size="sm" to="/login">
                  Log in
                </Button>
                <Button variant="primary" size="sm" to="/register">
                  Sign up
                </Button>
              </>
            )}
          </div>

          {/* ---- Mobile controls ---- */}
          <div className="md:hidden flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={() => setMobileOpen((prev) => !prev)}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ---- Mobile drawer ---- */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          mobileOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-5 pt-2 space-y-1 border-t border-slate-200/60 bg-white/95 backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/95">
          {isHome &&
            NAV_LINKS.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition dark:text-slate-300 dark:hover:text-indigo-400 dark:hover:bg-slate-800"
              >
                {label}
              </a>
            ))}

          <div className="pt-3 mt-2 border-t border-slate-200 dark:border-slate-800">
            {user ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold">
                    {user.name?.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium">{user.name}</span>
                </div>
                {user.role === "admin" && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition dark:text-slate-300 dark:hover:text-indigo-400 dark:hover:bg-slate-800"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Admin
                  </Link>
                )}
                <Link
                  to="/trips"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition dark:text-slate-300 dark:hover:text-indigo-400 dark:hover:bg-slate-800"
                >
                  <Luggage className="w-4 h-4" />
                  My Trips
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg px-4 py-2.5 transition cursor-pointer dark:text-red-400 dark:bg-red-500/10 dark:hover:bg-red-500/20"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                >
                  Log in
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                >
                  Sign up
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
