import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Tailwind-styled renderers for the subset of markdown the assistant emits
// (headings, bold/italics, lists, links, code, blockquotes, tables). There is
// no typography plugin in this project, so each element is styled explicitly.
export const MARKDOWN_COMPONENTS = {
  h1: ({ ...props }) => <h1 className="text-base font-bold mt-3 mb-1.5 first:mt-0" {...props} />,
  h2: ({ ...props }) => <h2 className="text-base font-bold mt-3 mb-1.5 first:mt-0" {...props} />,
  h3: ({ ...props }) => <h3 className="text-sm font-bold mt-3 mb-1.5 first:mt-0" {...props} />,
  h4: ({ ...props }) => <h4 className="text-sm font-semibold mt-2.5 mb-1 first:mt-0" {...props} />,
  p: ({ ...props }) => <p className="my-1.5 first:mt-0 last:mb-0" {...props} />,
  ul: ({ ...props }) => <ul className="list-disc pl-5 my-1.5 space-y-1" {...props} />,
  ol: ({ ...props }) => <ol className="list-decimal pl-5 my-1.5 space-y-1" {...props} />,
  li: ({ ...props }) => <li className="marker:text-slate-400" {...props} />,
  strong: ({ ...props }) => <strong className="font-semibold" {...props} />,
  em: ({ ...props }) => <em className="italic" {...props} />,
  a: ({ ...props }) => (
    <a
      className="text-indigo-600 underline underline-offset-2 hover:text-indigo-500 dark:text-indigo-400"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  // react-markdown v10 dropped the `inline` prop; block code is wrapped in a
  // <pre> (which carries its own styling) and typically has a language class
  // or a newline, so treat everything else as inline.
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className || "") || String(children).includes("\n");
    return isBlock ? (
      <code className={`block font-mono text-[0.85em] ${className || ""}`} {...props}>
        {children}
      </code>
    ) : (
      <code
        className="px-1 py-0.5 rounded bg-slate-200 text-[0.85em] font-mono dark:bg-slate-700"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ ...props }) => (
    <pre
      className="my-2 p-3 rounded-lg bg-slate-200 overflow-x-auto text-xs dark:bg-slate-700/60"
      {...props}
    />
  ),
  blockquote: ({ ...props }) => (
    <blockquote
      className="border-l-2 border-slate-300 pl-3 my-2 text-slate-600 dark:border-slate-600 dark:text-slate-400"
      {...props}
    />
  ),
  hr: ({ ...props }) => <hr className="my-3 border-slate-200 dark:border-slate-700" {...props} />,
  table: ({ ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-left border-collapse" {...props} />
    </div>
  ),
  th: ({ ...props }) => (
    <th className="border border-slate-300 px-2 py-1 font-semibold dark:border-slate-600" {...props} />
  ),
  td: ({ ...props }) => (
    <td className="border border-slate-300 px-2 py-1 dark:border-slate-600" {...props} />
  ),
};

/** Render a markdown string with the project's Tailwind-styled components. */
const MarkdownMessage = ({ content }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
    {content}
  </ReactMarkdown>
);

export default MarkdownMessage;
