import { Loader2, AlertCircle, RefreshCw } from "lucide-react";

/** Full-area loading spinner. */
export const LoadingState = ({ label = "Loading…" }) => (
  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
    <p className="mt-3 text-sm">{label}</p>
  </div>
);

/** Error panel with an optional retry action. */
export const ErrorState = ({ message = "Something went wrong", onRetry }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-red-100 text-red-600 mb-4 dark:bg-red-500/15 dark:text-red-400">
      <AlertCircle className="w-7 h-7" />
    </div>
    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
      Couldn&apos;t load this
    </h3>
    <p className="text-slate-500 mt-1 max-w-sm dark:text-slate-400">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-indigo-600 border-2 border-indigo-600 hover:bg-indigo-50 transition cursor-pointer dark:text-indigo-400 dark:border-indigo-400 dark:hover:bg-indigo-500/10"
      >
        <RefreshCw className="w-4 h-4" /> Try again
      </button>
    )}
  </div>
);

/** Generic empty placeholder. */
export const EmptyState = ({ icon: Icon, title, message, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    {Icon && (
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-600 mb-5 dark:bg-indigo-500/15 dark:text-indigo-400">
        <Icon className="w-8 h-8" />
      </div>
    )}
    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h3>
    {message && <p className="text-slate-500 mt-2 max-w-md dark:text-slate-400">{message}</p>}
    {action && <div className="mt-6">{action}</div>}
  </div>
);
