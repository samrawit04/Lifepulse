import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { formatDistanceToNow } from "date-fns";
import {
  X,
  Send,
  AlertCircle,
  Maximize2,
  Minimize2,
  History,
  SquarePen,
  Trash2,
  CalendarCheck,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WEEKLY_REVIEW_PROMPT, type ChatMessage } from "@/lib/gemini";
import type { ChatConversation } from "@/integrations/api/client";

interface ChatPanelProps {
  expanded: boolean;
  /** Small screen: always full screen, no expand toggle. */
  mobile?: boolean;
  conversations: ChatConversation[];
  conversationsLoading: boolean;
  activeId: string | null;
  messages: ChatMessage[];
  messagesLoading: boolean;
  input: string;
  loading: boolean;
  error: string | null;
  onInputChange: (v: string) => void;
  onSend: (text?: string) => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onToggleExpand: () => void;
  onClose: () => void;
}

const SUGGESTIONS = [
  "What should I focus on today?",
  "Am I spending too much?",
  "Summarize my open notes",
];

/** Render the assistant's Markdown safely (raw HTML is escaped, links limited to http/mailto). */
function renderMarkdown(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = marked.parse(escaped, { async: false, gfm: true, breaks: true }) as string;
  return html.replace(/<a href="([^"]*)"/g, (_m, href: string) =>
    /^(https?:|mailto:)/i.test(href) ? `<a href="${href}" target="_blank" rel="noopener noreferrer"` : "<a"
  );
}

function Message({ msg }: { msg: ChatMessage }) {
  const html = useMemo(() => (msg.role === "model" ? renderMarkdown(msg.text) : ""), [msg]);
  return (
    <div className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
      {msg.role === "model" && (
        <img src="/logo.png" alt="AI" className="mt-1 h-6 w-6 flex-shrink-0 rounded-lg border border-emerald-500/20 object-cover shadow-sm" />
      )}
      {msg.role === "user" ? (
        <div
          className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-[0_4px_16px_rgba(21,128,61,0.35)]"
          style={{ background: "linear-gradient(135deg, #15803d, #16a34a)" }}
        >
          {msg.text}
        </div>
      ) : (
        <div
          className="chat-md min-w-0 max-w-[85%] overflow-x-auto break-words rounded-2xl rounded-tl-sm border border-green-100 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 shadow-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

function ConversationList({
  conversations,
  loading,
  activeId,
  onSelect,
  onDelete,
}: {
  conversations: ChatConversation[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-slate-400">
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading chats…
      </div>
    );
  }
  if (conversations.length === 0) {
    return <p className="px-3 py-8 text-center text-xs text-slate-400">No past chats yet.</p>;
  }
  return (
    <ul className="space-y-0.5 p-2">
      {conversations.map((c) => (
        <li key={c.id}>
          <div
            className={cn(
              "group flex items-center gap-2 rounded-xl px-2.5 py-2 transition",
              activeId === c.id ? "bg-green-100 text-green-900" : "text-slate-700 hover:bg-slate-100"
            )}
          >
            <button type="button" onClick={() => onSelect(c.id)} className="min-w-0 flex-1 text-left">
              <p className="truncate text-xs font-medium">{c.title}</p>
              <p className="text-[10px] text-slate-400">
                {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })} · {c.message_count} messages
              </p>
            </button>
            <button
              type="button"
              onClick={() => onDelete(c.id)}
              title="Delete chat"
              className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ChatPanel({
  expanded,
  mobile = false,
  conversations,
  conversationsLoading,
  activeId,
  messages,
  messagesLoading,
  input,
  loading,
  error,
  onInputChange,
  onSend,
  onSelect,
  onNewChat,
  onDelete,
  onToggleExpand,
  onClose,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    // Don't pop the keyboard open on phones just because the panel opened
    if (!mobile) inputRef.current?.focus();
  }, [expanded, activeId, mobile]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const activeTitle = conversations.find((c) => c.id === activeId)?.title;
  const isEmpty = messages.length === 0 && !messagesLoading;

  const headerBtn = "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-green-100 transition hover:bg-white/20 hover:text-white sm:h-7 sm:w-7";

  return (
    <div
      id="ai-chat-panel"
      className={cn(
        "flex overflow-hidden bg-white shadow-[0_24px_80px_-12px_rgba(22,163,74,0.3),0_0_0_1px_rgba(22,163,74,0.12)]",
        expanded
          ? "h-full w-full max-w-6xl rounded-none md:rounded-3xl"
          : "h-[calc(100vh-6.5rem)] max-h-[600px] min-h-[350px] w-[calc(100vw-1.5rem)] max-w-[400px] rounded-3xl"
      )}
    >
      {/* Sidebar with past chats (full-window mode) */}
      {expanded && (
        <aside className="hidden w-64 shrink-0 flex-col border-r border-green-100 bg-slate-50 md:flex">
          <div className="flex items-center justify-between border-b border-green-100 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your chats</p>
            <button onClick={onNewChat} title="New chat" className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-green-700">
              <SquarePen className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ConversationList conversations={conversations} loading={conversationsLoading} activeId={activeId} onSelect={onSelect} onDelete={onDelete} />
          </div>
        </aside>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div
          className="relative flex items-center gap-1.5 px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:gap-2.5 sm:px-4 sm:py-3"
          style={{ background: "linear-gradient(135deg, #15803d 0%, #16a34a 50%, #22c55e 100%)" }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/30" />
          <img src="/logo.png" alt="LifePulse AI" className="h-8 w-8 shrink-0 rounded-xl border border-white/20 object-cover shadow-sm" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-display text-sm font-bold text-white">{activeTitle ?? "LifePulse AI"}</p>
            <p className="truncate text-[10px] text-green-100">{loading ? "Thinking…" : "Remembers your chats · knows your week"}</p>
          </div>

          <button onClick={() => onSend(WEEKLY_REVIEW_PROMPT)} title="Review my week" className={headerBtn} disabled={loading}>
            <CalendarCheck className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowHistory((v) => !v)}
            title="Past chats"
            className={cn(headerBtn, expanded && "md:hidden", showHistory && "bg-white/20 text-white")}
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              onNewChat();
              setShowHistory(false);
            }}
            title="New chat"
            className={cn(headerBtn, expanded && "md:hidden")}
          >
            <SquarePen className="h-3.5 w-3.5" />
          </button>
          <button onClick={onToggleExpand} title={expanded ? "Exit full window" : "Full window"} className={cn(headerBtn, mobile && "hidden")}>
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onClose} title="Close" className={headerBtn}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Past chats overlay (compact mode / small screens) */}
        {showHistory && (
          <div className={cn("absolute inset-x-0 bottom-0 top-[56px] z-10 overflow-y-auto overscroll-contain bg-white", expanded && "md:hidden")}>
            <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Your chats</p>
            <ConversationList
              conversations={conversations}
              loading={conversationsLoading}
              activeId={activeId}
              onSelect={(id) => {
                onSelect(id);
                setShowHistory(false);
              }}
              onDelete={onDelete}
            />
          </div>
        )}

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4" style={{ background: "#f0faf4" }}>
          <div className={cn("space-y-3", expanded && "mx-auto max-w-3xl")}>
            {messagesLoading && (
              <div className="flex items-center justify-center py-10 text-xs text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading conversation…
              </div>
            )}

            {isEmpty && (
              <div className="flex flex-col items-center gap-5 pb-2 pt-6 text-center">
                <img
                  src="/logo.png"
                  alt="LifePulse AI"
                  className="h-16 w-16 rounded-3xl border border-emerald-500/20 object-cover shadow-[0_8px_24px_rgba(22,163,74,0.25)]"
                />
                <div>
                  <p className="font-display text-base font-bold text-slate-800">Hey, I'm your assistant</p>
                  <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-slate-500">
                    I know your tasks, notes, events and spending, and I remember what we talked about before.
                  </p>
                </div>
                <button
                  onClick={() => onSend(WEEKLY_REVIEW_PROMPT)}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-white shadow-[0_4px_12px_rgba(21,128,61,0.35)] transition hover:opacity-95"
                  style={{ background: "linear-gradient(135deg, #15803d, #16a34a)" }}
                >
                  <CalendarCheck className="h-4 w-4" /> Review my week
                </button>
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        onInputChange(s);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      className="rounded-xl border border-green-200 bg-white px-3 py-2 text-left text-xs text-slate-600 shadow-sm transition hover:border-green-400 hover:bg-green-50 hover:text-green-800"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <Message key={i} msg={msg} />
            ))}

            {loading && (
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="AI" className="mt-1 h-6 w-6 flex-shrink-0 rounded-lg border border-emerald-500/20 object-cover shadow-sm" />
                <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-green-100 bg-white px-4 py-3 shadow-sm">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-green-500 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-green-500 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-green-500 [animation-delay:300ms]" />
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-600">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-green-100 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div
            className={cn(
              "flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 transition focus-within:border-green-400 focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(22,163,74,0.12)]",
              expanded && "mx-auto max-w-3xl"
            )}
          >
            <textarea
              ref={inputRef}
              id="ai-chat-input"
              rows={1}
              value={input}
              onChange={(e) => {
                onInputChange(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
              }}
              onKeyDown={handleKey}
              placeholder="Ask me anything…"
              disabled={loading}
              className="min-w-0 flex-1 resize-none bg-transparent text-base text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-50 sm:text-sm"
              style={{ maxHeight: 160 }}
            />
            <button
              id="ai-chat-send"
              onClick={() => onSend()}
              disabled={!input.trim() || loading}
              className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl text-white shadow-[0_4px_12px_rgba(21,128,61,0.4)] transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              style={{ background: "linear-gradient(135deg, #15803d, #16a34a)" }}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1.5 hidden text-center text-[10px] text-slate-400 sm:block">Powered by Gemini · Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
}
