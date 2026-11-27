export interface Item {
  id: string;
  user_id: string;
  type: "sticky" | "notebook_page" | "task" | "event";
  title: string | null;
  content: string | null;
  /** Parent task id when this task is a sub-task inside a task folder. */
  parent_id: string | null;
  folder_id: string | null;
  color: string | null;
  tags: string[];
  due_date: string | null;
  event_date: string | null;
  /** Scheduled start (tasks/events). ISO timestamp. */
  start_at: string | null;
  /** Scheduled end (tasks/events). ISO timestamp. */
  end_at: string | null;
  pos_x: number | null;
  pos_y: number | null;
  width: number | null;
  height: number | null;
  priority: string | null;
  completed: boolean;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export type ItemInsert = Omit<Partial<Item>, "id" | "user_id" | "created_at" | "updated_at"> & {
  type: Item["type"];
};

export type ItemUpdate = Partial<ItemInsert> & {
  clearFolderId?: boolean;
  clearDueDate?: boolean;
  clearEventDate?: boolean;
};

export interface Folder {
  id: string;
  user_id: string;
  name: string;
  parent_folder_id: string | null;
  color: string;
  created_at: string;
  updated_at: string;
}

export type FolderInsert = Omit<Partial<Folder>, "id" | "user_id" | "created_at" | "updated_at"> & {
  name: string;
};

export interface Expense {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  category: string;
  note: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

export type ExpenseInsert = Omit<Partial<Expense>, "id" | "user_id" | "created_at" | "updated_at"> & {
  amount: number;
  category: string;
};

export type ExpenseUpdate = Partial<ExpenseInsert>;

/**
 * Sticky-note palette — soft, painterly pastels. Values are stable slugs
 * kept short so they persist cleanly in the DB. Each color includes a
 * gradient pair for the fancy card look.
 */
export const NOTE_COLORS = [
  {
    name: "Peach",
    value: "peach",
    meaning: "Warm idea",
    from: "oklch(0.88 0.08 55)",
    to: "oklch(0.78 0.10 40)",
  },
  {
    name: "Rose",
    value: "rose",
    meaning: "Urgent",
    from: "oklch(0.86 0.07 15)",
    to: "oklch(0.75 0.10 10)",
  },
  {
    name: "Sky",
    value: "sky",
    meaning: "Reference",
    from: "oklch(0.87 0.06 235)",
    to: "oklch(0.76 0.09 240)",
  },
  {
    name: "Sage",
    value: "sage",
    meaning: "Done",
    from: "oklch(0.88 0.06 150)",
    to: "oklch(0.78 0.08 155)",
  },
  {
    name: "Lilac",
    value: "lilac",
    meaning: "Later",
    from: "oklch(0.85 0.07 300)",
    to: "oklch(0.74 0.10 300)",
  },
] as const;

export type NoteColorValue = (typeof NOTE_COLORS)[number]["value"];

export function noteColor(color: string | null | undefined) {
  return NOTE_COLORS.find((c) => c.value === color) ?? NOTE_COLORS[0];
}

/** Gradient CSS for a sticky-note surface. */
export function noteGradient(color: string | null | undefined): string {
  const c = noteColor(color);
  return `linear-gradient(155deg, ${c.from} 0%, ${c.to} 100%)`;
}

/** Solid-ish color for legacy usages (e.g. dashboard tiles). */
export function noteColorCss(color: string | null | undefined): string {
  return noteColor(color).from;
}

export const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: "Food", emoji: "🍜" },
  { value: "Transport", emoji: "🚕" },
  { value: "Rent", emoji: "🏠" },
  { value: "Shopping", emoji: "🛍️" },
  { value: "Bills", emoji: "🧾" },
  { value: "Health", emoji: "💊" },
  { value: "Entertainment", emoji: "🎬" },
  { value: "Travel", emoji: "✈️" },
  { value: "Savings", emoji: "🐖" },
  { value: "Other", emoji: "✨" },
] as const;

export function categoryEmoji(cat: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === cat)?.emoji ?? "✨";
}

// ─── Task flags (stored as tags) ───────────────────────────────────────────

/** The user is working on this task right now ("Active" column). */
export const TASK_ACTIVE_TAG = "active";
/** The user chose to show this task on their calendar. */
export const TASK_CALENDAR_TAG = "calendar";

export const hasTag = (i: { tags?: string[] | null }, tag: string) => (i.tags ?? []).includes(tag);
export const withTag = (tags: string[] | null | undefined, tag: string) => Array.from(new Set([...(tags ?? []), tag]));
export const withoutTag = (tags: string[] | null | undefined, tag: string) => (tags ?? []).filter((t) => t !== tag);

/** A task is Active when you marked it as in progress, or its own deadline has arrived. */
export function isActiveTask(t: { tags?: string[] | null; due_date: string | null }) {
  if (hasTag(t, TASK_ACTIVE_TAG)) return true;
  if (!t.due_date) return false;
  const due = new Date(t.due_date);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due.getTime() <= today.getTime();
}
