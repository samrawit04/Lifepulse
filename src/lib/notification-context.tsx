import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, type AppNotification } from "@/integrations/api/client";
import { useUserSetting } from "@/hooks/use-user-setting";

export type NotifCategory = "calendar" | "task" | "expense" | "general";

// Re-export as Notification for the rest of the app
export type Notification = AppNotification;

const NOTIF_KEY = ["notifications"] as const;

interface NotifState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
}

interface NotifActions {
  add: (n: Omit<Notification, "id" | "userId" | "createdAt" | "isRead">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

const NotifContext = createContext<(NotifState & NotifActions) | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  // ── Fetch all notifications from the DB ────────────────────────────────────
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: NOTIF_KEY,
    queryFn: () => apiClient.notifications.getAll(),
    refetchInterval: 60_000, // refresh every minute
    staleTime: 30_000,
  });

  // ── Create notification ────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (n: { category: string; title: string; body: string; icon?: string; link?: string }) =>
      apiClient.notifications.create(n),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIF_KEY }),
  });

  const createMutRef = useRef(createMut.mutate);
  createMutRef.current = createMut.mutate;

  // ── Mark single read ───────────────────────────────────────────────────────
  const markReadMut = useMutation({
    mutationFn: (id: string) => apiClient.notifications.markRead(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: NOTIF_KEY });
      const prev = qc.getQueryData<Notification[]>(NOTIF_KEY);
      qc.setQueryData<Notification[]>(NOTIF_KEY, (old = []) =>
        old.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(NOTIF_KEY, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIF_KEY }),
  });

  // ── Mark all read ──────────────────────────────────────────────────────────
  const markAllReadMut = useMutation({
    mutationFn: () => apiClient.notifications.markAllRead(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: NOTIF_KEY });
      const prev = qc.getQueryData<Notification[]>(NOTIF_KEY);
      qc.setQueryData<Notification[]>(NOTIF_KEY, (old = []) =>
        old.map((n) => ({ ...n, isRead: true }))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(NOTIF_KEY, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIF_KEY }),
  });

  // ── Delete single ──────────────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.notifications.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: NOTIF_KEY });
      const prev = qc.getQueryData<Notification[]>(NOTIF_KEY);
      qc.setQueryData<Notification[]>(NOTIF_KEY, (old = []) => old.filter((n) => n.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(NOTIF_KEY, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIF_KEY }),
  });

  // ── Delete all ─────────────────────────────────────────────────────────────
  const deleteAllMut = useMutation({
    mutationFn: () => apiClient.notifications.deleteAll(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: NOTIF_KEY });
      const prev = qc.getQueryData<Notification[]>(NOTIF_KEY);
      qc.setQueryData<Notification[]>(NOTIF_KEY, []);
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(NOTIF_KEY, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIF_KEY }),
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const add = useCallback(
    (n: Omit<Notification, "id" | "userId" | "createdAt" | "isRead">) => {
      createMutRef.current(n);
    },
    []
  );

  return (
    <NotifContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        add,
        markRead: (id) => markReadMut.mutate(id),
        markAllRead: () => markAllReadMut.mutate(),
        dismiss: (id) => deleteMut.mutate(id),
        clearAll: () => deleteAllMut.mutate(),
      }}
    >
      {children}
    </NotifContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotifContext);
  if (!ctx) throw new Error("useNotifications must be inside NotificationProvider");
  return ctx;
}

// ─── Smart poller: generates notifications from live data ────────────────────
//
// Each reminder has a stable key (e.g. "tasks-due-today:2026-11-26"). Keys that
// have already fired are stored on the server (user setting "notification-log"),
// so a reminder is sent once per day/month — even after a page reload, on
// another device, or after the notification itself was dismissed.

interface SmartPollerProps {
  items: import("@/lib/lifeos-types").Item[];
  expenses: import("@/lib/lifeos-types").Expense[];
  categoryBudgets: Record<string, number>;
  monthlyBudget: number;
  /** True once items/expenses/budgets have loaded, so we never act on empty data. */
  ready?: boolean;
}

const NOTIF_LOG_KEY = "notification-log";
const EMPTY_LOG: string[] = [];

function localDay(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function useNotificationPoller({
  items,
  expenses,
  categoryBudgets,
  monthlyBudget,
  ready = true,
}: SmartPollerProps) {
  const { isLoading: notificationsLoading, add } = useNotifications();
  const { value: firedLog, isLoading: logLoading, save: saveLog } = useUserSetting<string[]>(NOTIF_LOG_KEY, EMPTY_LOG);
  // Keys fired in this session (covers the moment before the server log refreshes)
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Wait until everything has loaded — acting on half-loaded data is what caused repeats.
    if (!ready || notificationsLoading || logLoading) return;

    const now = new Date();
    const today = localDay(now);
    const month = today.slice(0, 7);
    const already = new Set([...firedLog, ...firedRef.current]);
    const newKeys: string[] = [];

    const fire = (key: string, n: Parameters<typeof add>[0]) => {
      if (already.has(key)) return;
      already.add(key);
      firedRef.current.add(key);
      newKeys.push(key);
      add(n);
    };

    // ── 1. Calendar events starting within 60 minutes ──────────────────────
    for (const ev of items) {
      if (ev.type !== "event" || !ev.event_date || ev.archived) continue;
      const diff = new Date(ev.event_date).getTime() - now.getTime();
      if (diff <= 0 || diff > 60 * 60 * 1000) continue;
      const mins = Math.round(diff / 60000);
      fire(`event:${ev.id}:${today}`, {
        category: "calendar",
        title: "Event coming up",
        body: `${ev.title || "Untitled"} starts in ${mins} min`,
        link: "/calendar",
      });
    }

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const openTasks = items.filter((i) => i.type === "task" && !i.completed && !i.archived && i.due_date);

    // ── 2. Overdue tasks (due before today) — once per day ──────────────────
    const overdue = openTasks.filter((t) => new Date(t.due_date!) < startOfToday);
    if (overdue.length > 0) {
      fire(`tasks-overdue:${today}`, {
        category: "task",
        title: `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}`,
        body:
          overdue.length === 1
            ? `"${overdue[0].title || "Untitled"}" is past due`
            : `${overdue.slice(0, 2).map((t) => t.title || "Untitled").join(", ")}${overdue.length > 2 ? ` and ${overdue.length - 2} more` : ""}`,
        link: "/tasks",
      });
    }

    // ── 3. Tasks due today — once per day ───────────────────────────────────
    const dueToday = openTasks.filter((t) => new Date(t.due_date!).toDateString() === now.toDateString());
    if (dueToday.length > 0) {
      fire(`tasks-due-today:${today}`, {
        category: "task",
        title: `${dueToday.length} task${dueToday.length > 1 ? "s" : ""} due today`,
        body: dueToday.slice(0, 2).map((t) => t.title || "Untitled").join(", ") + (dueToday.length > 2 ? "…" : ""),
        link: "/tasks",
      });
    }

    // ── 4. Monthly budget warnings — once per month ─────────────────────────
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthExpenses = expenses.filter((e) => new Date(e.occurred_at) >= monthStart);
    if (monthlyBudget > 0) {
      const total = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
      const pct = (total / monthlyBudget) * 100;
      if (pct >= 100) {
        fire(`budget-100:${month}`, {
          category: "expense",
          title: "Monthly budget exceeded",
          body: `You've spent ${Math.round(pct)}% of your ${monthlyBudget.toLocaleString()} Birr budget this month`,
          link: "/expenses",
        });
      } else if (pct >= 80) {
        fire(`budget-80:${month}`, {
          category: "expense",
          title: "Budget at 80%",
          body: `You've used ${Math.round(pct)}% of your monthly budget (${total.toLocaleString()} / ${monthlyBudget.toLocaleString()} Birr)`,
          link: "/expenses",
        });
      }
    }

    // ── 5. Per-category budget warnings — once per category per month ──────
    for (const [cat, budget] of Object.entries(categoryBudgets)) {
      if (!budget) continue;
      const spent = monthExpenses.filter((e) => e.category === cat).reduce((s, e) => s + Number(e.amount), 0);
      const pct = (spent / budget) * 100;
      if (pct >= 90) {
        fire(`cat:${cat}:${month}`, {
          category: "expense",
          title: `${cat} budget ${pct >= 100 ? "exceeded" : "almost full"}`,
          body: `Spent ${spent.toLocaleString()} of ${budget.toLocaleString()} Birr on ${cat} this month`,
          link: "/expenses",
        });
      }
    }

    if (newKeys.length > 0) {
      // Keep only this month's keys so the log stays small
      const kept = firedLog.filter((k) => k.endsWith(today) || k.endsWith(month));
      saveLog([...new Set([...kept, ...newKeys])]);
    }
  }, [items, expenses, categoryBudgets, monthlyBudget, ready, notificationsLoading, logLoading, firedLog, add, saveLog]);
}
