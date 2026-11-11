import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  AlertCircle,
  Bot,
  User,
  X,
} from "lucide-react";
import { streamAskAi } from "../../services/ai";
import MarkdownMessage from "../ui/Markdown";

const SAMPLES = [
  "What are the best months to visit Japan?",
  "Suggest a 3-day itinerary for Lisbon.",
  "What should I pack for a safari in Kenya?",
];

const MAX_LEN = 2000;

/**
 * Floating "Ask TripMate AI" assistant.
 *
 * Renders a fixed button in the bottom-right corner that is available on every
 * page. Clicking it opens a slide-in panel (drawer) on the right with the same
 * streaming Q&A functionality the old /ai-test page had — now presented as a
 * running conversation. UI only; the API key stays server-side.
 */
const AiChatbot = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Auto-scroll to the newest message as the reply streams in.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  const send = useCallback(
    async (text) => {
      const msg = (text ?? input).trim();
      if (!msg || sending) return;

      setError("");
      setInput("");

      const now = new Date().toISOString();
      const userMsg = { role: "user", content: msg, createdAt: now };
      const assistantId = `assistant-${Date.now()}`;
      const assistantMsg = {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        createdAt: now,
      };
      setMessages((m) => [...m, userMsg, assistantMsg]);
      setSending(true);

      try {
        await streamAskAi(msg, {
          onToken: (_delta, full) => {
            setMessages((m) =>
              m.map((x) => (x.id === assistantId ? { ...x, content: full } : x))
            );
          },
          onDone: (meta) => {
            setMessages((m) =>
              m.map((x) =>
                x.id === assistantId ? { ...x, meta, streaming: false } : x
              )
            );
          },
        });
      } catch (err) {
        setError(err.message || "Something went wrong talking to the AI.");
        // Roll back the optimistic messages so the user can retry.
        setMessages((m) => m.filter((x) => x !== userMsg && x.id !== assistantId));
        setInput(msg);
      } finally {
        setSending(false);
      }
    },
    [input, sending]
  );

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Floating AI launcher (every page, bottom-right) — hidden while open */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask TripMate AI"
          aria-expanded={open}
          className="ai-launcher group fixed bottom-6 right-6 z-[70] flex items-center justify-center w-16 h-16 rounded-full text-white cursor-pointer transition-transform duration-300 hover:scale-105 active:scale-95"
        >
          {/* Expanding ping rings */}
          <span className="absolute inset-0 rounded-full bg-violet-500/40 animate-ping" />
          <span className="absolute -inset-1 rounded-full border border-white/30 animate-pulse" />

          {/* Icon */}
          <Bot className="relative w-7 h-7 drop-shadow" />
          {/* Twinkling sparkle accent */}
          <Sparkles className="absolute -top-0.5 -right-0.5 w-4 h-4 text-amber-300 animate-pulse drop-shadow" />
        </button>
      )}

      {/* Backdrop (click to close) */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-in right panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-chatbot-title"
        className={`fixed top-[2%] right-[2%] z-[65] h-[96%] w-[96%] max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-out dark:bg-slate-900 dark:border-slate-800 ${
          open ? "translate-x-0" : "translate-x-[120%]"
        }`}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 mb-1 dark:bg-indigo-500/15 dark:text-indigo-300">
              <Sparkles className="w-3 h-3" /> AI Preview
            </span>
            <h2
              id="ai-chatbot-title"
              className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              Ask TripMate AI
            </h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-600 transition cursor-pointer dark:hover:text-slate-200"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 mb-4 dark:bg-indigo-500/15 dark:text-indigo-400">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">
                Ask any travel question
              </h3>
              <p className="text-slate-500 text-sm mt-1 max-w-sm dark:text-slate-400">
                Destinations, itineraries, packing tips, and more — ask away to
                test the AI integration.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {SAMPLES.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 transition cursor-pointer dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => <Bubble key={m.id ?? i} message={m} />)
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border-t border-red-200 text-red-700 px-4 py-2.5 text-sm dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Composer */}
        <div className="border-t border-slate-200 p-3 sm:p-4 dark:border-slate-800">
          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              value={input}
              maxLength={MAX_LEN}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask any travel question…"
              className="flex-1 resize-none max-h-32 px-4 py-2.5 rounded-xl border border-slate-300 text-sm outline-none transition focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
            />
            <button
              onClick={() => send()}
              disabled={sending || !input.trim()}
              className="flex items-center justify-center w-11 h-11 rounded-xl text-white bg-indigo-600 hover:bg-indigo-500 transition cursor-pointer disabled:bg-indigo-400 disabled:cursor-not-allowed shrink-0"
              aria-label="Send"
            >
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5 px-1">
            AI suggestions are estimates — verify time-sensitive details.
          </p>
        </div>
      </aside>
    </>
  );
};

const Avatar = ({ role }) =>
  role === "assistant" ? (
    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white shrink-0">
      <Bot className="w-4 h-4" />
    </div>
  ) : (
    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-200 text-slate-600 shrink-0 dark:bg-slate-700 dark:text-slate-300">
      <User className="w-4 h-4" />
    </div>
  );

const Bubble = ({ message }) => {
  const isUser = message.role === "user";
  const isWaiting = message.streaming && !message.content;
  return (
    <div className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <Avatar role={message.role} />
      <div className={`max-w-[85%] ${isUser ? "items-end" : ""}`}>
        <div
          className={`px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "whitespace-pre-wrap bg-indigo-600 text-white rounded-2xl rounded-tr-sm"
              : "bg-slate-100 text-slate-700 rounded-2xl rounded-tl-sm dark:bg-slate-800 dark:text-slate-200"
          }`}
        >
          {isUser ? (
            message.content
          ) : isWaiting ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : (
            <>
              <MarkdownMessage content={message.content} />
              {message.streaming && (
                <span className="inline-block w-1.5 h-4 ml-0.5 -mb-0.5 bg-slate-400 animate-pulse rounded-sm align-middle" />
              )}
            </>
          )}
        </div>
        {!isUser && message.meta && (
          <p className="text-[11px] text-slate-400 mt-1.5 px-1">
            {message.meta.model} · {message.meta.usage?.inputTokens} in /{" "}
            {message.meta.usage?.outputTokens} out tokens
          </p>
        )}
      </div>
    </div>
  );
};

export default AiChatbot;
