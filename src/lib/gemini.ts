import { differenceInCalendarDays, format, startOfDay, subDays } from "date-fns";
import type { Item, Expense } from "@/lib/lifeos-types";
import { notebookPlainText } from "@/lib/notebook-content";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

export type ChatMessage = {
  role: "user" | "model";
  text: string;
};

/** Sent when the user taps "Review my week". */
export const WEEKLY_REVIEW_PROMPT =
  "Please review my last 7 days using the weekly routine data you have. " +
  "Tell me: 1) what went well, 2) patterns you notice in how I plan and spend my time and money " +
  "(busy vs. empty days, morning vs. evening work, overdue tasks, spending spikes), " +
  "3) what's slipping, and 4) three concrete, realistic suggestions for next week. " +
  "Be honest but kind, and keep it short and specific to my data.";

// ─── Weekly routine digest ───────────────────────────────────────────────────

function dayKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

/**
 * A compact, factual summary of the user's last 7 days (and how it compares to
 * the week before), so the assistant can analyse their routine.
 */
export function buildWeeklyDigest(items: Item[], expenses: Expense[], now = new Date()): string {
  const today = startOfDay(now);
  const weekStart = subDays(today, 6);
  const prevStart = subDays(today, 13);
  const inWeek = (iso: string | null | undefined) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= weekStart && d <= now;
  };
  const inPrevWeek = (iso: string | null | undefined) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= prevStart && d < weekStart;
  };

  const tasks = items.filter((i) => i.type === "task" && !i.archived);
  // Completion time isn't stored separately; the last update of a completed task is a close proxy.
  const completedThisWeek = tasks.filter((t) => t.completed && inWeek(t.updated_at));
  const completedPrevWeek = tasks.filter((t) => t.completed && inPrevWeek(t.updated_at));
  const createdThisWeek = tasks.filter((t) => inWeek(t.created_at));
  const dueThisWeek = tasks.filter((t) => inWeek(t.due_date));
  const dueDoneThisWeek = dueThisWeek.filter((t) => t.completed);
  const overdue = tasks.filter((t) => !t.completed && t.due_date && new Date(t.due_date) < today);
  const pinnedOpen = tasks.filter((t) => t.pinned && !t.completed);

  const days = Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i));
  const perDay = days.map((d) => {
    const k = dayKey(d);
    const done = completedThisWeek.filter((t) => dayKey(new Date(t.updated_at)) === k).length;
    const scheduled = tasks.filter((t) => t.start_at && dayKey(new Date(t.start_at)) === k);
    const events = items.filter((i) => i.type === "event" && !i.archived && i.event_date && dayKey(new Date(i.event_date)) === k);
    const spent = expenses.filter((e) => dayKey(new Date(e.occurred_at)) === k).reduce((s, e) => s + Number(e.amount), 0);
    const scheduledMinutes = scheduled.reduce((s, t) => {
      if (!t.start_at || !t.end_at) return s;
      return s + Math.max(0, (new Date(t.end_at).getTime() - new Date(t.start_at).getTime()) / 60000);
    }, 0);
    return {
      label: format(d, "EEE MMM d"),
      done,
      scheduled: scheduled.length,
      scheduledHours: Math.round((scheduledMinutes / 60) * 10) / 10,
      events: events.length,
      spent,
    };
  });

  // When does the user schedule work?
  const slots = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const t of tasks) {
    if (!t.start_at || !inWeek(t.start_at)) continue;
    const h = new Date(t.start_at).getHours();
    if (h >= 5 && h < 12) slots.morning++;
    else if (h < 17 && h >= 12) slots.afternoon++;
    else if (h < 22 && h >= 17) slots.evening++;
    else slots.night++;
  }

  const spendWeek = expenses.filter((e) => inWeek(e.occurred_at));
  const spendPrev = expenses.filter((e) => inPrevWeek(e.occurred_at));
  const sum = (list: Expense[]) => list.reduce((s, e) => s + Number(e.amount), 0);
  const byCat: Record<string, number> = {};
  for (const e of spendWeek) byCat[e.category] = (byCat[e.category] ?? 0) + Number(e.amount);

  const pagesEdited = items.filter((i) => i.type === "notebook_page" && !i.archived && inWeek(i.updated_at)).length;
  const notesCreated = items.filter((i) => i.type === "sticky" && inWeek(i.created_at)).length;

  const lines: string[] = [];
  lines.push(`Period: ${format(weekStart, "EEE MMM d")} – ${format(today, "EEE MMM d")} (compared with the 7 days before).`);
  lines.push(
    `Tasks: ${completedThisWeek.length} completed (previous week ${completedPrevWeek.length}), ${createdThisWeek.length} created, ` +
      `${dueDoneThisWeek.length}/${dueThisWeek.length} of tasks due this week done, ${overdue.length} overdue now, ${pinnedOpen.length} pinned as urgent and still open.`
  );
  if (overdue.length) {
    lines.push(
      `Overdue: ${overdue
        .slice(0, 6)
        .map((t) => `"${t.title ?? "Untitled"}" (${differenceInCalendarDays(today, new Date(t.due_date!))}d late)`)
        .join(", ")}.`
    );
  }
  lines.push("Day by day:");
  for (const d of perDay) {
    lines.push(
      `- ${d.label}: ${d.done} tasks done, ${d.scheduled} time-blocked tasks (${d.scheduledHours}h), ${d.events} events, spent ${Math.round(d.spent)}`
    );
  }
  lines.push(
    `Time-blocked tasks start: morning ${slots.morning}, afternoon ${slots.afternoon}, evening ${slots.evening}, late night ${slots.night}.`
  );
  lines.push(
    `Spending: ${Math.round(sum(spendWeek))} this week vs ${Math.round(sum(spendPrev))} the week before. By category: ${
      Object.entries(byCat)
        .sort((a, b) => b[1] - a[1])
        .map(([c, v]) => `${c} ${Math.round(v)}`)
        .join(", ") || "none"
    }.`
  );
  lines.push(`Notebook pages edited: ${pagesEdited}. Sticky notes added: ${notesCreated}.`);
  return lines.join("\n");
}

// ─── System prompt ───────────────────────────────────────────────────────────

export function buildSystemPrompt(items: Item[], expenses: Expense[], memory: ChatMessage[] = []): string {
  const now = new Date();
  const active = items.filter((i) => !i.archived);

  const tasks =
    active
      .filter((i) => i.type === "task" && !i.completed)
      .slice(0, 40)
      .map(
        (t) =>
          `- ${t.title ?? "Untitled"}${t.due_date ? ` (due ${t.due_date.slice(0, 10)})` : ""}${
            t.start_at ? ` [${format(new Date(t.start_at), "HH:mm")}${t.end_at ? `–${format(new Date(t.end_at), "HH:mm")}` : ""}]` : ""
          }${t.priority ? ` [${t.priority} priority]` : ""}${t.pinned ? " [pinned/urgent]" : ""}${t.parent_id ? " (sub-task)" : ""}`
      )
      .join("\n") || "No open tasks.";

  const events =
    active
      .filter((i) => i.type === "event" && i.event_date && new Date(i.event_date) >= now)
      .sort((a, b) => (a.event_date! < b.event_date! ? -1 : 1))
      .slice(0, 10)
      .map((e) => `- ${e.title ?? "Untitled"} on ${format(new Date(e.event_date!), "EEE MMM d, HH:mm")}`)
      .join("\n") || "No upcoming events.";

  const notes =
    active
      .filter((i) => i.type === "sticky")
      .slice(0, 8)
      .map((n) => `- ${n.title ? `[${n.title}] ` : ""}${(n.content ?? "").slice(0, 120)}`)
      .join("\n") || "No sticky notes.";

  const notebooks =
    active
      .filter((i) => i.type === "notebook_page")
      .slice(0, 5)
      .map((p) => `- ${p.title ?? "Untitled"}: ${notebookPlainText(p.content).slice(0, 150)}`)
      .join("\n") || "No notebook pages.";

  const memoryText = memory.length
    ? memory.map((m) => `- ${m.role === "user" ? "User" : "You"}: ${m.text.replace(/\s+/g, " ").slice(0, 280)}`).join("\n")
    : "No earlier conversations yet.";

  return `You are a warm, empathetic, and insightful life assistant built into LifePulse — a personal productivity app. Today is ${format(now, "EEEE, MMMM d, yyyy, HH:mm")}.

You have access to the user's personal data and remember your earlier conversations with them. Use both naturally to give personalized advice. Reference specific tasks, events, routines or spending patterns when relevant — but don't dump data; weave it in conversationally.

You can help with anything: planning, routines, productivity, budgeting, emotional support, relationships, career, goals, or just a friendly chat.

Be warm, concise and human. Use short paragraphs; use Markdown lists or bold only when it genuinely helps. Speak like a brilliant friend, not a corporate assistant.

--- WHAT YOU REMEMBER FROM RECENT CONVERSATIONS (oldest first) ---
${memoryText}

--- USER'S WEEKLY ROUTINE (last 7 days) ---
${buildWeeklyDigest(items, expenses, now)}

--- USER'S CURRENT DATA ---

Open tasks:
${tasks}

Upcoming events:
${events}

Sticky notes (recent):
${notes}

Notebook pages (recent):
${notebooks}

---

Remember: you know the user's life. Make them feel heard, understood and supported.`;
}

// ─── Gemini call ─────────────────────────────────────────────────────────────

const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.0-flash"];
const MAX_TURNS_SENT = 40;

/** Send a conversation to Gemini and return the reply text. */
export async function askGemini(history: ChatMessage[], systemPrompt: string): Promise<string> {
  if (!API_KEY) {
    throw new Error("VITE_GEMINI_API_KEY is not set. Please add it to your .env file and restart the dev server.");
  }

  const contents = history.slice(-MAX_TURNS_SENT).map((msg) => ({ role: msg.role, parts: [{ text: msg.text }] }));
  let lastError: Error | null = null;

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: systemPrompt }] } }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg: string = errData?.error?.message || `HTTP ${res.status} ${res.statusText}`;
      if (res.status === 429 || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("Quota")) {
        lastError = new Error(
          "Gemini's free-tier limit was reached. Please wait a minute and try again, or use a fresh key from https://aistudio.google.com/app/apikey."
        );
        continue;
      }
      throw new Error(errMsg);
    }

    const data = await res.json();
    const reply: string | undefined = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
    if (!reply) throw new Error("No response content received from Gemini.");
    return reply;
  }

  throw lastError ?? new Error("Gemini request failed. Check VITE_GEMINI_API_KEY in your .env.");
}
