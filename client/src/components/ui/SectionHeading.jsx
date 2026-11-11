/**
 * Reusable section heading with optional badge and subtitle.
 *
 * @param {string}  badge     - Small pill text above the title
 * @param {string}  title     - Main heading
 * @param {string}  subtitle  - Paragraph below the heading
 * @param {boolean} light     - Use light text colours (for dark backgrounds)
 */
const SectionHeading = ({ badge, title, subtitle, light = false }) => {
  return (
    <div className="max-w-2xl mx-auto text-center mb-14">
      {badge && (
        <span
          className={`inline-block text-sm font-semibold tracking-wide uppercase px-4 py-1 rounded-full mb-4 ${
            light
              ? "bg-indigo-500/20 text-indigo-300"
              : "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
          }`}
        >
          {badge}
        </span>
      )}

      <h2
        className={`text-3xl sm:text-4xl font-bold tracking-tight ${
          light ? "text-white" : "text-slate-900 dark:text-slate-100"
        }`}
      >
        {title}
      </h2>

      {subtitle && (
        <p
          className={`mt-4 text-lg leading-relaxed ${
            light ? "text-slate-400" : "text-slate-600 dark:text-slate-400"
          }`}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
};

export default SectionHeading;

