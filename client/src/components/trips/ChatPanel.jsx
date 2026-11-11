import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageCircle,
  Send,
  Loader2,
  AlertCircle,
  Bot,
  User,
  Sparkles,
  X,
} from "lucide-react";
import MarkdownMessage from "../ui/Markdown";
import { streamChatMessage, getChatHistory } from "../../services/ai";

const SUGGESTIONS = [
  "What should I pack?",
  "Suggest an alternative to one of my activities.",
  "Roughly what will this trip cost?",
  "How do I get around there?",
];

const MAX_LEN = 2000;

/**
 * Conversational assistant for the trip dashboard, rendered as a centered
 * modal. UI only — all AI, retrieval, and storage happen server-side via
 * /api/v1/ai/chat.
 *
 * @param {string}   tripId
 * @param {boolean}  open     - whether the modal is visible
 * @param {function} onClose  - called on backdrop click / Escape / close button
 */
const ChatPanel = ({ tripId, open = false, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await getChatHistory(tripId);
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [tripId]);

  // Load history the first time the modal opens (and when the trip changes).
  useEffect(() => {
    if (open) loadHistory();
  }, [open, loadHistory]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    setError("");
    setInput("");
    // Optimistically show the user's message plus an empty assistant bubble
    // that fills in token-by-token as the stream arrives.
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
      await streamChatMessage(tripId, msg, {
        onToken: (_delta, full) => {
          setMessages((m) =>
            m.map((x) => (x.id === assistantId ? { ...x, content: full } : x))
          );
        },
        onDone: (meta) => {
          setMessages((m) =>
            m.map((x) =>
              x.id === assistantId
                ? { ...x, sources: meta.sources, streaming: false }
                : x
            )
          );
        },
      });
    } catch (err) {
      setError(err.message || "The assistant couldn't respond. Please try again.");
      // Roll back the optimistic user + assistant messages so they can retry.
      setMessages((m) => m.filter((x) => x !== userMsg && x.id !== assistantId));
      setInput(msg);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assistant-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={() => onClose?.()}
      />

      {/* Card */}
      <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col h-[80vh] max-h-[42rem] dark:bg-slate-900 dark:border-slate-800 animate-[fadeIn_0.15s_ease-out]">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2
            id="assistant-title"
            className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100"
          >
            <MessageCircle className="w-5 h-5 text-indigo-600" /> Trip Assistant
          </h2>
          <button
            onClick={() => onClose?.()}
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
          {loadingHistory ? (
            <div className="flex items-center gap-3 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              <span className="text-sm">Loading conversation…</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 mb-4 dark:bg-indigo-500/15 dark:text-indigo-400">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Ask me about your trip</h3>
              <p className="text-slate-500 text-sm mt-1 max-w-sm dark:text-slate-400">
                Packing lists, activity alternatives, cost explanations, getting
                around, and more — grounded in your trip details.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {SUGGESTIONS.map((s) => (
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
              placeholder="Ask about your trip…"
              className="flex-1 resize-none max-h-32 px-4 py-2.5 rounded-xl border border-slate-300 text-sm outline-none transition focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
            />
            <button
              onClick={() => send()}
              disabled={sending || !input.trim()}
              className="flex items-center justify-center w-11 h-11 rounded-xl text-white bg-indigo-600 hover:bg-indigo-500 transition cursor-pointer disabled:bg-indigo-400 disabled:cursor-not-allowed shrink-0"
              aria-label="Send"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5 px-1">
            AI suggestions are estimates — verify time-sensitive details. The
            assistant can't change your trip.
          </p>
        </div>
      </div>
    </div>
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
  // An assistant bubble that is still streaming but has no text yet shows a
  // spinner; once tokens arrive we render markdown with a blinking caret.
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
        {!isUser && message.sources?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {message.sources.map((s) => (
              <span
                key={s.ref}
                title={`${s.source} · score ${s.score?.toFixed?.(3) ?? ""}`}
                className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
              >
                [{s.ref}] {s.title}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPanel;
