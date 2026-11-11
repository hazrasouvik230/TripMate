import { useState, useEffect } from "react";
import { X, Save, Loader2 } from "lucide-react";

/**
 * Modal to edit a single activity (name, description, duration, cost).
 *
 * @param {boolean}  open
 * @param {object}   activity   - { name, description, durationMinutes, estimatedCost }
 * @param {string}   slotLabel  - e.g. "Morning"
 * @param {string}   currency
 * @param {boolean}  saving
 * @param {function} onSave     - (values) => void
 * @param {function} onCancel
 */
const ActivityEditModal = ({
  open,
  activity,
  slotLabel,
  currency = "",
  saving = false,
  onSave,
  onCancel,
}) => {
  const [form, setForm] = useState({
    name: "",
    description: "",
    durationMinutes: 0,
    estimatedCost: 0,
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm({
        name: activity?.name || "",
        description: activity?.description || "",
        durationMinutes: activity?.durationMinutes ?? 0,
        estimatedCost: activity?.estimatedCost ?? 0,
      });
      setError("");
    }
  }, [open, activity]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Name is required");
    const duration = Number(form.durationMinutes);
    const cost = Number(form.estimatedCost);
    if (!Number.isFinite(duration) || duration < 0)
      return setError("Duration must be 0 or more");
    if (!Number.isFinite(cost) || cost < 0)
      return setError("Cost cannot be negative");
    onSave({
      name: form.name.trim(),
      description: form.description.trim(),
      durationMinutes: Math.round(duration),
      estimatedCost: cost,
    });
  };

  const field =
    "w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm outline-none transition focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500";

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !saving && onCancel()} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-6 dark:bg-slate-900 dark:border-slate-800">
        <button
          onClick={() => !saving && onCancel()}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer dark:hover:text-slate-200"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-slate-900 mb-1 dark:text-slate-100">Edit activity</h2>
        {slotLabel && <p className="text-xs text-slate-400 mb-4">{slotLabel}</p>}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-sm mb-4 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5 dark:text-slate-300">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={field}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5 dark:text-slate-300">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={`${field} resize-y`}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 dark:text-slate-300">Duration (min)</label>
              <input
                type="number"
                min={0}
                value={form.durationMinutes}
                onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
                className={field}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 dark:text-slate-300">
                Cost {currency && `(${currency})`}
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.estimatedCost}
                onChange={(e) => setForm((f) => ({ ...f, estimatedCost: e.target.value }))}
                className={field}
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => !saving && onCancel()}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer disabled:opacity-60 dark:text-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition cursor-pointer disabled:bg-indigo-400"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ActivityEditModal;
