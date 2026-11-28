import { createFileRoute, Link } from "@tanstack/react-router";
import { format, formatDistanceToNowStrict, isBefore, isToday, isTomorrow, startOfDay, startOfMonth, subDays } from "date-fns";
import {
  StickyNote,
  NotebookText,
  CheckSquare,
  CalendarDays,
  Pin,
  ArrowUpRight,
  Flame,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useItems } from "@/hooks/use-lifeos";
import { useCategoryBudgets, useExpenses } from "@/hooks/use-expenses";
import { useDebts, useIncomes } from "@/hooks/use-money";
import { deriveDefaultName, useUserProfile } from "@/hooks/use-user-profile";
import { TASK_CALENDAR_TAG, hasTag, isActiveTask, noteColorCss, type Item } from "@/lib/lifeos-types";
import { cn } from "@/lib/utils";
import { notebookPlainText } from "@/lib/notebook-content";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: items = [] } = useItems();
  const { data: expenses = [] } = useExpenses();
  const { data: incomes = [] } = useIncomes();
  const { data: debts = [] } = useDebts();
  const { data: budgets = {} } = useCategoryBudgets();
  const { data: profile } = useUserProfile();
  const now = useNow(60_000);
  const firstName = (profile?.display_name?.trim() || deriveDefaultName(profile?.email)).split(" ")[0];
  const active = items.filter((i) => !i.archived);
  const today = startOfDay(now);

  const tasks = active.filter((i) => i.type === "task" && !i.parent_id);
  const activeTasks = tasks
    .filter((t) => !t.completed && isActiveTask(t))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.start_at ?? a.due_date ?? "~").localeCompare(b.start_at ?? b.due_date ?? "~"));

  // Today's agenda: events, plus tasks you put on your calendar
  const agenda = active
    .map((i) => {
      if (i.type === "event" && i.event_date && isToday(new Date(i.event_date))) return { item: i, at: new Date(i.event_date) };
      if (i.type === "task" && !i.completed && hasTag(i, TASK_CALENDAR_TAG)) {
        const iso = i.start_at ?? i.due_date;
        if (iso && isToday(new Date(iso))) return { item: i, at: new Date(iso) };
      }
      return null;
    })
    .filter((x): x is { item: Item; at: Date } => x !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const nextUp = agenda.find((a) => a.at.getTime() >= now.getTime());

  const pinnedNotes = active.filter((i) => i.type === "sticky" && i.pinned).slice(0, 6);
  const recentNotes = active.filter((i) => i.type === "sticky").slice(0, 6);
  const notebookPages = active.filter((i) => i.type === "notebook_page").slice(0, 4);

  // Progress
  const activity = useMemo(() => buildActivity(items, expenses, incomes), [items, expenses, incomes]);
  const streak = currentStreak(activity, today);
  const weekStart = subDays(today, 6);
  const doneThisWeek = tasks.filter((t) => t.completed && new Date(t.updated_at) >= weekStart).length;
  const doneLastWeek = tasks.filter((t) => t.completed && new Date(t.updated_at) >= subDays(weekStart, 7) && new Date(t.updated_at) < weekStart).length;
  const completionRate = doneThisWeek + activeTasks.length > 0 ? Math.round((doneThisWeek / (doneThisWeek + activeTasks.length)) * 100) : 0;
  const activeDaysThisWeek = Array.from({ length: 7 }, (_, i) => activity.get(dayKey(subDays(today, i))) ?? 0).filter((n) => n > 0).length;

  // Money this month
  const monthStart = startOfMonth(now);
  const monthExpenses = expenses.filter((e) => new Date(e.occurred_at) >= monthStart);
  const spent = monthExpenses.reduce((a, e) => a + Number(e.amount), 0);
  const income = incomes.filter((i) => new Date(i.received_at) >= monthStart).reduce((a, i) => a + i.amount, 0);
  const budgetTotal = Object.values(budgets).reduce((a, v) => a + Number(v || 0), 0);
  const budgetSpent = monthExpenses.filter((e) => Number(budgets[e.category] ?? 0) > 0).reduce((a, e) => a + Number(e.amount), 0);
  const openDebts = debts.filter((d) => !d.settled);
  const iOwe = openDebts.filter((d) => d.direction === "i_owe").reduce((a, d) => a + d.remaining, 0);
  const owedToMe = openDebts.filter((d) => d.direction === "owed_to_me").reduce((a, d) => a + d.remaining, 0);

  return (
    <div className="mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground sm:text-sm">{format(now, "EEEE, MMMM d, yyyy")}</p>
          <h1 className="mt-2 font-display text-2xl font-semibold leading-tight text-foreground sm:text-3xl lg:text-4xl">
            Good {greeting(now)}
            {profile ? (
              <>
                , <span className="text-primary">{firstName}</span>
              </>
            ) : null}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{vibeLine(now, agenda.length, activeTasks.length)}</p>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1.5 text-sm font-semibold text-amber-600 dark:text-amber-300">
            <Flame className="h-4 w-4" /> {streak}-day streak
          </div>
        )}
      </header>

      {/* Today focus + progress */}
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <section className="glass-card rounded-2xl border border-white/5 p-5 sm:p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
              <Target className="h-4 w-4 text-primary" /> Today's focus
            </h2>
            {nextUp && (
              <span className="truncate rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                Next: {nextUp.item.title || "Untitled"} {formatDistanceToNowStrict(nextUp.at, { addSuffix: true })}
              </span>
            )}
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Active tasks</p>
                <Link to="/tasks" className="text-[11px] text-muted-foreground hover:text-foreground">All tasks</Link>
              </div>
              {activeTasks.length === 0 ? (
                <Empty text="Nothing active. Pick a task to start." to="/tasks" actionText="Open tasks" />
              ) : (
                <ul className="space-y-1.5">
                  {activeTasks.slice(0, 6).map((t) => (
                    <li key={t.id}>
                      <Link to="/tasks" className="group flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 transition hover:border-white/20 hover:bg-white/[0.06]">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", prioClass(t.priority))} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground group-hover:text-primary">{t.title || "Untitled task"}</span>
                        {t.due_date && isBefore(startOfDay(new Date(t.due_date)), today) ? (
                          <span className="shrink-0 rounded-md bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">Overdue</span>
                        ) : t.start_at ? (
                          <span className="shrink-0 text-[11px] text-muted-foreground">{format(new Date(t.start_at), "p")}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                  {activeTasks.length > 6 && <li className="px-1 text-[11px] text-muted-foreground">+{activeTasks.length - 6} more</li>}
                </ul>
              )}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Agenda</p>
                <Link to="/calendar" className="text-[11px] text-muted-foreground hover:text-foreground">Calendar</Link>
              </div>
              {agenda.length === 0 ? (
                <Empty text="Nothing scheduled today." to="/calendar" actionText="Open calendar" />
              ) : (
                <ol className="relative space-y-3 border-l border-border pl-4">
                  {agenda.map(({ item, at }) => {
                    const past = at.getTime() < now.getTime() && item !== nextUp?.item;
                    return (
                      <li key={item.id} className={cn("relative", past && "opacity-50")}>
                        <span
                          className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background", item === nextUp?.item ? "bg-primary ring-4 ring-primary/20" : "bg-muted-foreground/40")}
                        />
                        <p className="text-[11px] font-medium text-muted-foreground">{format(at, "p")}</p>
                        <p className="truncate text-sm font-medium text-foreground">{item.title || "Untitled"}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </section>

        <section className="glass-card rounded-2xl border border-white/5 p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-primary" /> This week
          </h2>
          <div className="flex items-center gap-5">
            <Ring value={completionRate} />
            <div className="min-w-0 space-y-1">
              <p className="font-display text-3xl font-semibold text-foreground">{doneThisWeek}</p>
              <p className="text-xs text-muted-foreground">tasks done</p>
              <p className={cn("text-xs font-medium", doneThisWeek >= doneLastWeek ? "text-emerald-500" : "text-muted-foreground")}>
                {doneLastWeek === 0 ? (doneThisWeek > 0 ? "Great start" : "No tasks done yet") : `${doneThisWeek >= doneLastWeek ? "+" : ""}${doneThisWeek - doneLastWeek} vs last week`}
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Streak" value={`${streak}d`} />
            <MiniStat label="Active days" value={`${activeDaysThisWeek}/7`} />
            <MiniStat label="Best streak" value={`${longestStreak(activity)}d`} />
          </div>
        </section>
      </div>

      {/* Money snapshot */}
      <section className="glass-card mt-4 rounded-2xl border border-white/5 p-5 sm:p-6 lg:mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
            <Wallet className="h-4 w-4 text-primary" /> Money this month
          </h2>
          <Link to="/expenses" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Open expenses <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Money label="Income" value={income} tone="good" />
          <Money label="Spent" value={spent} />
          <Money label="Balance" value={income - spent} tone={income - spent >= 0 ? "good" : "bad"} />
          <Money label="You owe" value={iOwe} tone={iOwe > 0 ? "bad" : undefined} />
          <Money label="Owed to you" value={owedToMe} tone={owedToMe > 0 ? "good" : undefined} className="col-span-2 md:col-span-1" />
        </div>
        {budgetTotal > 0 && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">Budget used</span>
              <span className="tabular-nums text-foreground">
                {money(budgetSpent)} / {money(budgetTotal)} Birr ·{" "}
                <span className={budgetSpent > budgetTotal ? "text-destructive" : "text-emerald-500"}>
                  {budgetSpent > budgetTotal ? `${money(budgetSpent - budgetTotal)} over` : `${money(budgetTotal - budgetSpent)} left`}
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", budgetSpent > budgetTotal ? "bg-destructive" : budgetSpent / budgetTotal > 0.8 ? "bg-amber-500" : "bg-primary")}
                style={{ width: `${Math.min(100, (budgetSpent / budgetTotal) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Notebook Pages Section (when notebook pages exist) */}
      {notebookPages.length > 0 && (
        <section className="mt-10">
          <div className="mb-5 flex items-baseline justify-between">
            <Link
              to="/notebooks"
              className="group/title inline-flex items-center gap-2 font-display text-xl font-semibold text-foreground hover:text-primary transition-colors"
            >
              <NotebookText className="h-5 w-5 text-muted-foreground group-hover/title:text-primary transition-colors" />
              <span>Recent notebook pages</span>
            </Link>
            <Link
              to="/notebooks"
              className="group inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Open notebooks
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {notebookPages.map((p) => {
              const snippet = extractSnippet(p.content);
              return (
                <Link
                  key={p.id}
                  to="/notebooks"
                  search={{ pageId: p.id, folderId: p.folder_id ?? undefined }}
                  className="glass-card group relative flex flex-col justify-between rounded-2xl p-5 border border-white/5 bg-white/[0.02] transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:bg-white/[0.05] hover:shadow-lg cursor-pointer"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                      <span>{format(new Date(p.updated_at), "MMM d, yyyy")}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <h3 className="font-display font-semibold text-base text-foreground group-hover:text-primary transition-colors truncate">
                      {p.title || "Untitled page"}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-xs text-muted-foreground leading-relaxed">
                      {snippet || "Empty document…"}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center text-[11px] font-medium text-primary/80 group-hover:text-primary">
                    <span>Open in Notebooks →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Sticky Notes Section */}
      <section className="mt-10">
        <div className="mb-5 flex items-baseline justify-between">
          <Link
            to="/sticky"
            className="group/title inline-flex items-center gap-2 font-display text-xl font-semibold text-foreground hover:text-primary transition-colors"
          >
            <StickyNote className="h-5 w-5 text-muted-foreground group-hover/title:text-primary transition-colors" />
            <span>{pinnedNotes.length > 0 ? "Pinned notes" : "Recent sticky notes"}</span>
          </Link>
          <Link
            to="/sticky"
            className="group inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Open board
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
        {(pinnedNotes.length > 0 ? pinnedNotes : recentNotes).length === 0 ? (
          <Empty
            text="No sticky notes yet. Head to the board and double-click anywhere to jot one down."
            to="/sticky"
            actionText="Open sticky board"
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {(pinnedNotes.length > 0 ? pinnedNotes : recentNotes).map((n, i) => (
              <Link
                key={n.id}
                to="/sticky"
                className="group relative h-28 overflow-hidden rounded-xl p-3 shadow-note sm:h-32 transition-all duration-300 hover:-translate-y-1.5 hover:rotate-0 hover:shadow-xl cursor-pointer block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                style={{
                  background: `linear-gradient(160deg, ${noteColorCss(n.color)}, color-mix(in oklab, ${noteColorCss(n.color)} 70%, black))`,
                  transform: `rotate(${(i % 2 === 0 ? -1 : 1) * (0.5 + (i % 3) * 0.5)}deg)`,
                }}
              >
                {n.pinned && <Pin className="absolute right-2 top-2 h-3 w-3 text-black/50" />}
                {n.title && <p className="truncate pr-4 font-display text-sm font-semibold text-black/85 group-hover:text-black transition-colors">{n.title}</p>}
                <p className={cn("whitespace-pre-wrap pr-3 text-xs leading-snug text-black/75", n.title ? "mt-0.5 line-clamp-4" : "line-clamp-5")}>{n.content || "Empty note"}</p>
                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowUpRight className="h-3.5 w-3.5 text-black/60" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function vibeLine(d: Date, events: number, tasks: number) {
  const h = d.getHours();
  if (events === 0 && tasks === 0) {
    return h < 12
      ? "A fresh, open day ahead. Make it yours."
      : h < 18
        ? "Nothing pressing — a great time to get ahead."
        : "All clear. Time to slow down and recharge.";
  }
  const parts: string[] = [];
  if (events > 0) parts.push(`${events} event${events > 1 ? "s" : ""} today`);
  if (tasks > 0) parts.push(`${tasks} active task${tasks > 1 ? "s" : ""}`);
  return `On your plate: ${parts.join(" and ")}. You've got this.`;
}

/** Current time, refreshed on an interval so the greeting stays accurate. */
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function relDate(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return "today";
  if (isTomorrow(d)) return "tomorrow";
  return format(d, "EEE, MMM d");
}

function prioClass(p: string | null) {
  return p === "high"
    ? "bg-destructive"
    : p === "medium"
    ? "bg-sunbeam"
    : "bg-primary/60";
}

function extractSnippet(content: string | null): string {
  return notebookPlainText(content);
}

function Panel({
  title,
  icon: Icon,
  to,
  children,
}: {
  title: string;
  icon: typeof StickyNote;
  to: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <section className="glass-card group relative overflow-hidden rounded-2xl p-6 border border-white/5 bg-white/[0.02]">
      <div className="relative mb-4 flex items-center justify-between">
        <Link
          to={to}
          className="group/title flex items-center gap-2 font-display text-base font-semibold text-foreground hover:text-primary transition-colors"
        >
          <Icon className="h-4 w-4 text-muted-foreground group-hover/title:text-primary transition-colors" />
          <span>{title}</span>
        </Link>
        <Link
          to={to}
          className="group/link inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <span>View all</span>
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
        </Link>
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

function Empty({ text, to, actionText = "Open page" }: { text: string; to: string; actionText?: string }) {
  return (
    <Link
      to={to}
      className="group block rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-muted-foreground transition-all duration-200 hover:border-white/25 hover:bg-white/[0.05] hover:text-foreground cursor-pointer"
    >
      <p>{text}</p>
      <span className="mt-2 inline-flex items-center gap-1 text-xs text-primary/80 opacity-75 group-hover:opacity-100 group-hover:underline">
        {actionText} <ArrowUpRight className="h-3 w-3" />
      </span>
    </Link>
  );
}

// ─── Progress helpers ────────────────────────────────────────────────────────

const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

/** Count what you did each day: things created, pages edited, tasks finished, money logged. */
function buildActivity(items: Item[], expenses: { created_at: string }[], incomes: { created_at: string }[]) {
  const map = new Map<string, number>();
  const bump = (iso: string | null | undefined) => {
    if (!iso) return;
    const k = dayKey(new Date(iso));
    map.set(k, (map.get(k) ?? 0) + 1);
  };
  for (const i of items) {
    bump(i.created_at);
    const edited = dayKey(new Date(i.updated_at)) !== dayKey(new Date(i.created_at));
    if (i.type === "task" && i.completed) {
      if (edited) bump(i.updated_at);
    } else if (edited && (i.type === "notebook_page" || i.type === "sticky")) {
      bump(i.updated_at);
    }
  }
  for (const e of expenses) bump(e.created_at);
  for (const i of incomes) bump(i.created_at);
  return map;
}

function currentStreak(activity: Map<string, number>, today: Date) {
  let d = today;
  // Today doesn't break the streak until it's over
  if (!activity.get(dayKey(d))) d = subDays(d, 1);
  let n = 0;
  while (activity.get(dayKey(d))) {
    n++;
    d = subDays(d, 1);
  }
  return n;
}

function longestStreak(activity: Map<string, number>) {
  const days = [...activity.keys()].filter((k) => (activity.get(k) ?? 0) > 0).sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of days) {
    const d = new Date(k + "T12:00:00");
    run = prev && Math.round((d.getTime() - prev.getTime()) / 86_400_000) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

function Ring({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} className="fill-none stroke-muted" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={r}
          className="fill-none stroke-primary transition-all duration-700"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * value) / 100}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-base font-semibold text-foreground">{value}%</p>
          <p className="-mt-0.5 text-[9px] text-muted-foreground">done</p>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-2 py-2.5">
      <p className="font-display text-base font-semibold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

const money = (n: number) => Math.round(n).toLocaleString();

function Money({ label, value, tone, className }: { label: string; value: number; tone?: "good" | "bad"; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-white/5 bg-white/[0.03] p-3", className)}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 font-display text-lg font-semibold tabular-nums", tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-destructive" : "text-foreground")}>
        {money(value)} <span className="text-[11px] font-normal text-muted-foreground">Birr</span>
      </p>
    </div>
  );
}
