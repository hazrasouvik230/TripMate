import { Link } from "react-router-dom";

const variantStyles = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/25 hover:shadow-indigo-500/30",
  secondary:
    "bg-white/10 text-white border border-white/20 hover:bg-white/20 backdrop-blur-sm",
  outline:
    "border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-400 dark:text-indigo-400 dark:hover:bg-indigo-500/10",
  ghost:
    "text-slate-600 hover:text-indigo-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-indigo-400 dark:hover:bg-slate-800",
};

const sizeStyles = {
  sm: "px-4 py-2 text-sm rounded-lg",
  md: "px-6 py-2.5 text-base rounded-xl",
  lg: "px-8 py-3.5 text-lg rounded-xl",
};

/**
 * Reusable Button / Link component.
 *
 * @param {string}  variant  - "primary" | "secondary" | "outline" | "ghost"
 * @param {string}  size     - "sm" | "md" | "lg"
 * @param {string}  [to]     - React Router path  → renders <Link>
 * @param {string}  [href]   - Plain URL / anchor  → renders <a>
 * @param {string}  [className] - Extra classes
 */
const Button = ({
  children,
  variant = "primary",
  size = "md",
  to,
  href,
  className = "",
  ...props
}) => {
  const classes = [
    "inline-flex items-center justify-center gap-2 font-semibold",
    "transition-all duration-200 cursor-pointer select-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
    variantStyles[variant],
    sizeStyles[size],
    className,
  ].join(" ");

  if (href) {
    return (
      <a href={href} className={classes} {...props}>
        {children}
      </a>
    );
  }

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
};

export default Button;

