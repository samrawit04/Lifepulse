import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format, isToday, isTomorrow, isWithinInterval, addDays, startOfDay } from "date-fns";
import {
  StickyNote,
  NotebookText,
  CheckSquare,
  CalendarDays,
  Pin,
  ArrowUpRight,
  Wallet,
  Music,
  Sparkles,
  Archive,
  SlidersHorizontal,
} from "lucide-react";
import { useItems } from "@/hooks/use-lifeos";
import { noteColorCss } from "@/lib/lifeos-types";
import { cn } from "@/lib/utils";
import { CustomizeSidebarDialog } from "@/components/customize-sidebar-dialog";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: items = [] } = useItems();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const active = items.filter((i) => !i.archived);
  const today = startOfDay(new Date());
  const in7 = addDays(today, 7);

  const todayEvents = active
    .filter((i) => i.type === "event" && i.event_date && isToday(new Date(i.event_date)))
    .sort((a, b) => (a.event_date! < b.event_date! ? -1 : 1));

  const upcomingTasks = active
    .filter((i) => i.type === "task" && !i.completed && i.due_date && isWithinInterval(new Date(i.due_date), { start: today, end: in7 }))
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));

  const pinnedNotes = active.filter((i) => i.type === "sticky" && i.pinned).slice(0, 4);
  const recentNotes = active.filter((i) => i.type === "sticky").slice(0, 6);
  const notebookPages = active.filter((i) => i.type === "notebook_page").slice(0, 4);

  const stats = [
    {
      label: "Sticky notes",
      value: active.filter((i) => i.type === "sticky").length,
      icon: StickyNote,
      to: "/sticky" as const,
      hint: "Open sticky board",
    },
    {
      label: "Notebook pages",
      value: active.filter((i) => i.type === "notebook_page").length,
      icon: NotebookText,
      to: "/notebooks" as const,
      hint: "Open notebooks",
    },
    {
      label: "Open tasks",
      value: active.filter((i) => i.type === "task" && !i.completed).length,
      icon: CheckSquare,
      to: "/tasks" as const,
      hint: "Open task board",
    },
    {
      label: "Events this week",
      value: active.filter((i) => i.type === "event" && i.event_date && isWithinInterval(new Date(i.event_date), { start: today, end: in7 })).length,
      icon: CalendarDays,
      to: "/calendar" as const,
      hint: "Open calendar",
    },
  ];

  const quickLinks = [
    { label: "Sticky Notes", to: "/sticky" as const, icon: StickyNote },
    { label: "Notebooks", to: "/notebooks" as const, icon: NotebookText },
    { label: "Tasks", to: "/tasks" as const, icon: CheckSquare },
    { label: "Calendar", to: "/calendar" as const, icon: CalendarDays },
    { label: "Expenses", to: "/expenses" as const, icon: Wallet },
    { label: "Music", to: "/music" as const, icon: Music },
    { label: "Pinterest", to: "/pinterest" as const, icon: Sparkles },
    { label: "Archive", to: "/archive" as const, icon: Archive },
  ];

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 py-3 sm:py-12">
      <header className="mb-5 sm:mb-8 flex flex-wrap items-end justify-between gap-4 sm:gap-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            {format(new Date(), "EEEE · MMMM d, yyyy")}
          </div>
          <h1 className="mt-2 sm:mt-4 font-display text-xl sm:text-3xl lg:text-4xl font-semibold leading-tight text-foreground">
            Good {greeting()}.
          </h1>
        </div>
      </header>

      {/* Quick Launch Shortcuts */}
      <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap mr-1">Quick launch:</span>
        {quickLinks.map(({ label, to, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur transition-all duration-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-foreground whitespace-nowrap"
          >
            <Icon className="h-3.5 w-3.5 text-muted-foreground/80" />
            <span>{label}</span>
          </Link>
        ))}
        <button
          onClick={() => setCustomizeOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-white/20 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur transition-all duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-primary whitespace-nowrap cursor-pointer ml-auto"
          title="Customize sidebar navigation"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
          <span>Customize sidebar</span>
        </button>
      </div>

      {/* 4 Main Stat Cards - Clickable links */}
      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, to, hint }) => (
          <Link
            key={label}
            to={to}
            title={hint}
            className="glass-card group relative block overflow-hidden rounded-2xl p-5 border border-white/5 bg-white/[0.02] transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:bg-white/[0.05] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.14em] font-medium text-muted-foreground group-hover:text-foreground transition-colors">{label}</p>
              <div className="flex items-center gap-1">
                <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 -translate-x-1 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:text-primary" />
              </div>
            </div>
            <p className="mt-2 font-display text-3xl font-semibold text-foreground group-hover:text-primary transition-colors">{value}</p>
          </Link>
        ))}
      </div>

      {/* Calendar & Tasks Panels */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Today's calendar" icon={CalendarDays} to="/calendar" accent="from-primary/20">
          {todayEvents.length === 0 ? (
            <Empty text="Nothing scheduled. Enjoy the space." to="/calendar" actionText="Open calendar" />
          ) : (
            <ul className="space-y-2">
              {todayEvents.map((e) => (
                <li key={e.id}>
                  <Link
                    to="/calendar"
                    className="group flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-sm cursor-pointer"
                  >
                    <div
                      className="mt-1.5 h-2.5 w-2.5 rounded-full shadow-[0_0_10px_currentColor] shrink-0"
                      style={{ background: e.color ?? "var(--primary)", color: e.color ?? "var(--primary)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground group-hover:text-primary transition-colors">{e.title || "Untitled event"}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(e.event_date!), "p")}
                      </p>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 shrink-0 mt-1" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Upcoming tasks" icon={CheckSquare} to="/tasks" accent="from-accent/20">
          {upcomingTasks.length === 0 ? (
            <Empty text="Inbox zero this week." to="/tasks" actionText="Go to tasks" />
          ) : (
            <ul className="space-y-2">
              {upcomingTasks.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <Link
                    to="/tasks"
                    className="group flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-sm cursor-pointer"
                  >
                    <div className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", prioClass(t.priority))} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground group-hover:text-primary transition-colors">{t.title || "Untitled task"}</p>
                      <p className="text-xs text-muted-foreground">
                        Due {relDate(t.due_date!)}
                      </p>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 shrink-0 mt-1" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Notebook Pages Section (when notebook pages exist) */}
      {notebookPages.length > 0 && (
        <section className="mt-12">
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
      <section className="mt-12">
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(pinnedNotes.length > 0 ? pinnedNotes : recentNotes).map((n, i) => (
              <Link
                key={n.id}
                to="/sticky"
                className="group relative aspect-square rounded-2xl p-4 shadow-note transition-all duration-300 hover:-translate-y-1.5 hover:rotate-0 hover:shadow-xl cursor-pointer block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                style={{
                  background: `linear-gradient(160deg, ${noteColorCss(n.color)}, color-mix(in oklab, ${noteColorCss(n.color)} 70%, black))`,
                  transform: `rotate(${(i % 2 === 0 ? -1 : 1) * (1 + (i % 3))}deg)`,
                }}
              >
                {n.pinned && <Pin className="absolute right-3 top-3 h-3.5 w-3.5 text-black/50" />}
                {n.title && <p className="font-display text-lg text-black/85 group-hover:text-black transition-colors">{n.title}</p>}
                <p className="mt-1 line-clamp-6 whitespace-pre-wrap text-sm text-black/75">{n.content}</p>
                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowUpRight className="h-4 w-4 text-black/60" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <CustomizeSidebarDialog open={customizeOpen} onOpenChange={setCustomizeOpen} />
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
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
  if (!content) return "";
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((b: { kind?: string; content?: string }) => b.kind === "text" && typeof b.content === "string")
        .map((b: { content: string }) => b.content)
        .join(" ")
        .trim();
    }
  } catch {
    // raw text fallback
  }
  return content.trim();
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
