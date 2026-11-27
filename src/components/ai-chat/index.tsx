import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useItems } from "@/hooks/use-lifeos";
import { useExpenses } from "@/hooks/use-expenses";
import { apiClient, type ChatConversation, type StoredChatMessage } from "@/integrations/api/client";
import { WEEKLY_REVIEW_PROMPT, askGemini, buildSystemPrompt, type ChatMessage } from "@/lib/gemini";
import { format } from "date-fns";
import { ChatBubbleButton } from "./chat-bubble";
import { ChatPanel } from "./chat-panel";
import { useIsMobile } from "@/hooks/use-mobile";

const CHATS_KEY = ["ai-chats"] as const;
const messagesKey = (id: string) => ["ai-chat-messages", id] as const;

function titleFrom(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t || "New chat";
}

/**
 * Floating AI assistant. Conversations and messages are stored in the database
 * (/api/chats), so the assistant remembers past chats across reloads and devices.
 */
export function AiChat() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftMessages, setDraftMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  // Phones and small tablets always get the full-screen layout.
  const isMobile = useIsMobile();
  const fullScreen = expanded || isMobile;

  const { data: items = [] } = useItems();
  const { data: expenses = [] } = useExpenses();

  const conversations = useQuery({
    queryKey: CHATS_KEY,
    queryFn: () => apiClient.chats.list(),
    enabled: open,
    staleTime: 60_000,
  });

  const activeMessages = useQuery({
    queryKey: messagesKey(activeId ?? "none"),
    queryFn: () => apiClient.chats.messages(activeId!),
    enabled: open && !!activeId,
    staleTime: Infinity,
  });

  // Reopen the most recent conversation the first time the panel opens
  useEffect(() => {
    if (open && activeId === null && conversations.data && conversations.data.length > 0 && draftMessages.length === 0) {
      setActiveId(conversations.data[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversations.data]);

  // Esc leaves full-window mode (or closes the assistant on small screens)
  useEffect(() => {
    if (!fullScreen || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isMobile) setOpen(false);
      else setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullScreen, open, isMobile]);

  // Lock page scroll behind the full-screen assistant on phones
  useEffect(() => {
    if (!(open && isMobile)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  const messages: ChatMessage[] = activeId
    ? (activeMessages.data ?? []).map((m) => ({ role: m.role, text: m.text }))
    : draftMessages;

  const appendLocal = (convId: string, msg: StoredChatMessage) => {
    qc.setQueryData<StoredChatMessage[]>(messagesKey(convId), (old = []) => [...old, msg]);
  };

  const send = useCallback(
    async (textArg?: string) => {
      const text = (textArg ?? input).trim();
      if (!text || loading) return;
      // The weekly review sends a detailed instruction but shows/stores a short label
      const isReview = text === WEEKLY_REVIEW_PROMPT;
      const shown = isReview ? "Review my week" : text;
      setInput("");
      setError(null);
      setLoading(true);

      let convId = activeId;
      const history: ChatMessage[] = [...messages, { role: "user", text }];
      const shownHistory: ChatMessage[] = [...messages, { role: "user", text: shown }];

      try {
        // Create the conversation on the first message
        if (!convId) {
          setDraftMessages(shownHistory);
          const conv = await apiClient.chats.create(isReview ? `Weekly review · ${format(new Date(), "MMM d")}` : titleFrom(text));
          convId = conv.id;
          qc.setQueryData<StoredChatMessage[]>(messagesKey(conv.id), []);
          qc.setQueryData<ChatConversation[]>(CHATS_KEY, (old = []) => [conv, ...old]);
          setActiveId(conv.id);
          setDraftMessages([]);
        }

        const savedUser = await apiClient.chats.addMessage(convId, "user", shown);
        appendLocal(convId, savedUser);

        // Memory: latest messages from *other* conversations
        const recent = await apiClient.chats.recentMessages(40).catch(() => [] as StoredChatMessage[]);
        const memory = recent.filter((m) => m.conversation_id !== convId).slice(-30).map((m) => ({ role: m.role, text: m.text }));

        const reply = await askGemini(history, buildSystemPrompt(items, expenses, memory));
        const savedReply = await apiClient.chats.addMessage(convId, "model", reply);
        appendLocal(convId, savedReply);
        qc.invalidateQueries({ queryKey: CHATS_KEY });
        if (!open) setHasUnread(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, loading, activeId, messages, items, expenses, open]
  );

  const newChat = () => {
    setActiveId(null);
    setDraftMessages([]);
    setError(null);
    setInput("");
  };

  const deleteChat = async (id: string) => {
    try {
      await apiClient.chats.delete(id);
      qc.setQueryData<ChatConversation[]>(CHATS_KEY, (old = []) => old.filter((c) => c.id !== id));
      qc.removeQueries({ queryKey: messagesKey(id) });
      if (activeId === id) newChat();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't delete the conversation.");
    }
  };

  const panel = (
    <ChatPanel
      expanded={fullScreen}
      mobile={isMobile}
      conversations={conversations.data ?? []}
      conversationsLoading={conversations.isLoading}
      activeId={activeId}
      messages={messages}
      messagesLoading={!!activeId && activeMessages.isLoading}
      input={input}
      loading={loading}
      error={error}
      onInputChange={setInput}
      onSend={send}
      onSelect={(id) => {
        setActiveId(id);
        setError(null);
      }}
      onNewChat={newChat}
      onDelete={deleteChat}
      onToggleExpand={() => setExpanded((v) => !v)}
      onClose={() => {
        setOpen(false);
        setExpanded(false);
      }}
    />
  );

  return (
    <>
      {open && fullScreen && (
        <div className="fixed inset-0 z-[60] flex h-dvh items-stretch justify-center bg-background/70 p-0 backdrop-blur-sm md:p-6">
          {panel}
        </div>
      )}

      <div className="pointer-events-none fixed bottom-16 right-3 z-50 flex flex-col items-end gap-2.5 sm:bottom-6 sm:right-6">
        {!fullScreen && (
          <div
            className="origin-bottom-right transition-all duration-300"
            style={{
              opacity: open ? 1 : 0,
              transform: open ? "scale(1) translateY(0)" : "scale(0.92) translateY(16px)",
              pointerEvents: open ? "auto" : "none",
            }}
          >
            {panel}
          </div>
        )}

        {!(open && fullScreen) && (
          <div className="pointer-events-auto">
            <ChatBubbleButton
              open={open}
              onClick={() => {
                if (open) setOpen(false);
                else {
                  setOpen(true);
                  setHasUnread(false);
                }
              }}
              hasUnread={hasUnread}
            />
          </div>
        )}
      </div>
    </>
  );
}
