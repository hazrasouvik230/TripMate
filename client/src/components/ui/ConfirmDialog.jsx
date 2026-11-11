import { useEffect } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

/**
 * Accessible confirmation modal, used for destructive actions (e.g. delete).
 *
 * @param {boolean}  open          - Whether the dialog is visible
 * @param {string}   title         - Heading
 * @param {string}   message       - Body text
 * @param {string}   confirmLabel  - Confirm button text
 * @param {string}   cancelLabel   - Cancel button text
 * @param {boolean}  loading       - Shows a spinner + disables buttons
 * @param {function} onConfirm     - Called when the user confirms
 * @param {function} onCancel      - Called when the user cancels / closes
 */
const ConfirmDialog = ({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
  onConfirm,
  onCancel,
}) => {
  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !loading) onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={() => !loading && onCancel?.()}
      />

      {/* Card */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 animate-[fadeIn_0.15s_ease-out]">
        <button
          onClick={() => !loading && onCancel?.()}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition cursor-pointer dark:hover:text-slate-200"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-11 h-11 rounded-full bg-red-100 text-red-600 shrink-0 dark:bg-red-500/15 dark:text-red-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="pt-0.5">
            <h2
              id="confirm-title"
              className="text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              {title}
            </h2>
            {message && (
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed dark:text-slate-400">
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            onClick={() => !loading && onCancel?.()}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer disabled:opacity-60 dark:text-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-500 transition cursor-pointer disabled:bg-red-400 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
