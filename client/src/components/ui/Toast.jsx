import { useState, useCallback, useRef } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

/**
 * Lightweight toast notifications — a hook + a renderer, no global provider.
 *
 *   const { toasts, push, dismiss } = useToasts();
 *   push("Saved!");            // success (default)
 *   push("Failed", "error");
 *   <ToastStack toasts={toasts} dismiss={dismiss} />
 */
export const useToasts = () => {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message, type = "success", ttl = 3500) => {
      const id = ++counter.current;
      setToasts((t) => [...t, { id, message, type }]);
      if (ttl) setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss]
  );

  return { toasts, push, dismiss };
};

const STYLES = {
  success: {
    ring: "border-emerald-200 dark:border-emerald-500/30",
    icon: CheckCircle2,
    tint: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    ring: "border-red-200 dark:border-red-500/30",
    icon: AlertCircle,
    tint: "text-red-600 dark:text-red-400",
  },
};

export const ToastStack = ({ toasts, dismiss }) => {
  if (!toasts?.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 w-[min(92vw,360px)]">
      {toasts.map((t) => {
        const s = STYLES[t.type] || STYLES.success;
        const Icon = s.icon;
        return (
          <div
            key={t.id}
            role="status"
            className={`flex items-start gap-3 bg-white dark:bg-slate-900 border ${s.ring} shadow-lg rounded-xl px-4 py-3 text-sm animate-[fadeIn_0.15s_ease-out]`}
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${s.tint}`} />
            <span className="flex-1 text-slate-700 dark:text-slate-200">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="text-slate-400 hover:text-slate-600 transition cursor-pointer dark:hover:text-slate-200"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastStack;
