import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * Custom, theme-aware dropdown that replaces the native `<select>` so styling
 * (including the chevron and its padding) is consistent across browsers and in
 * dark mode. Values behave like a native select: `onChange` receives the
 * selected option's `value`.
 *
 * @param {string}   [id]           - Associates the trigger with a <label>
 * @param {string}   value          - Currently selected value
 * @param {function} onChange       - Called with the new value
 * @param {Array<{value:string,label:string}>} options
 * @param {string}   [placeholder]  - Shown when no option matches `value`
 * @param {string}   [error]        - Validation message (changes border styling)
 * @param {string}   [className]    - Extra classes for the wrapper (e.g. width)
 * @param {boolean}  [disabled]
 * @param {string}   [ariaLabel]    - Accessible name when there's no <label>
 */
const Select = ({
  id,
  value,
  onChange,
  options = [],
  placeholder = "Select…",
  error,
  className = "",
  disabled = false,
  ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const listRef = useRef(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the highlighted option in view while navigating with the keyboard.
  useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return;
    const node = listRef.current.children[activeIndex];
    node?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const openMenu = () => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const choose = (idx) => {
    const opt = options[idx];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(activeIndex);
        break;
      default:
        break;
    }
  };

  const triggerClass = `flex w-full items-center gap-2 pl-4 pr-3 py-2.5 rounded-xl border text-sm text-left outline-none transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
    error
      ? "border-red-400 bg-red-50 dark:border-red-500/50 dark:bg-red-500/10"
      : "border-slate-300 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
  } ${open ? "ring-2 ring-indigo-500/20 border-indigo-500" : ""}`;

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        type="button"
        id={id}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={triggerClass}
      >
        <span
          className={`flex-1 truncate ${
            selected
              ? "text-slate-900 dark:text-slate-100"
              : "text-slate-400 dark:text-slate-500"
          }`}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          className="absolute z-50 mt-2 w-full max-h-60 overflow-auto p-1.5 rounded-2xl border border-slate-200 bg-white shadow-xl animate-[fadeIn_0.12s_ease-out] dark:border-slate-700 dark:bg-slate-900"
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isActive = idx === activeIndex;
            return (
              <li key={opt.value || idx} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => choose(idx)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition cursor-pointer ${
                    isSelected
                      ? "bg-indigo-600 text-white font-semibold"
                      : isActive
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                        : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  <span className="flex-1 truncate">{opt.label}</span>
                  {isSelected && <Check className="w-4 h-4 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default Select;
