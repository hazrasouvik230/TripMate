import { createContext, useContext } from "react";
import { useToasts, ToastStack } from "../components/ui/Toast";

const ToastContext = createContext(null);

/**
 * App-wide toast notifications. Wrap the app once; any component can then call
 * `useToast().push("Saved!")` (or `push(msg, "error")`). A single <ToastStack>
 * is rendered here, so toasts survive route changes (e.g. after navigate()).
 */
export const ToastProvider = ({ children }) => {
  const { toasts, push, dismiss } = useToasts();

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
};

/** Access the toast API. Must be used inside <ToastProvider>. */
export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
};
