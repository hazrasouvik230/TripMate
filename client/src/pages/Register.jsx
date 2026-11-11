import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  User,
  UserPlus,
  AlertCircle,
  Loader2,
  MapPin,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";

const Register = () => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    // Client-side confirm-password check
    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: "Passwords do not match" });
      return;
    }

    setLoading(true);

    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
      });
      push("Account created successfully");
      navigate("/", { replace: true });
    } catch (err) {
      if (err.errors) {
        const fe = {};
        err.errors.forEach((e) => {
          fe[e.field] = e.message;
        });
        setFieldErrors(fe);
      }
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  /* ---- Shared input renderer ---- */
  const inputField = (id, label, type, icon, placeholder, autoComplete) => {
    const Icon = icon;
    const isPasswordField = type === "password";
    const inputType = isPasswordField && showPassword ? "text" : type;

    return (
      <div>
        <label
          htmlFor={id}
          className="block text-sm font-medium text-slate-700 mb-1.5 dark:text-slate-300"
        >
          {label}
        </label>
        <div className="relative">
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            id={id}
            name={id}
            type={inputType}
            autoComplete={autoComplete}
            required
            value={form[id]}
            onChange={handleChange}
            placeholder={placeholder}
            className={`w-full pl-11 ${
              isPasswordField ? "pr-11" : "pr-4"
            } py-2.5 rounded-xl border text-sm outline-none transition focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
              fieldErrors[id]
                ? "border-red-400 bg-red-50 dark:border-red-500/50 dark:bg-red-500/10 dark:text-slate-100 dark:placeholder-slate-500"
                : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
            }`}
          />
          {isPasswordField && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          )}
        </div>
        {fieldErrors[id] && (
          <p className="text-red-500 text-xs mt-1">{fieldErrors[id]}</p>
        )}
      </div>
    );
  };

  return (
    <section className="min-h-[80vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-2xl font-bold text-slate-900 mb-4 dark:text-slate-100"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-600 text-white">
              <MapPin className="w-5 h-5" />
            </div>
            TripMate&nbsp;<span className="text-indigo-600">AI</span>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-4 dark:text-slate-100">
            Create your account
          </h1>
          <p className="text-slate-500 mt-1 dark:text-slate-400">
            Start planning your dream trips with AI
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 dark:bg-slate-900 dark:border-slate-800">
          {error && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {inputField("name", "Full name", "text", User, "John Doe", "name")}
            {inputField(
              "email",
              "Email address",
              "email",
              Mail,
              "you@example.com",
              "email"
            )}
            {inputField(
              "password",
              "Password",
              "password",
              Lock,
              "Minimum 8 characters",
              "new-password"
            )}
            {inputField(
              "confirmPassword",
              "Confirm password",
              "password",
              Lock,
              "Re-enter your password",
              "new-password"
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white font-semibold py-2.5 rounded-xl transition cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <UserPlus className="w-5 h-5" />
              )}
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6 dark:text-slate-400">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-indigo-600 font-semibold hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </section>
  );
};

export default Register;

