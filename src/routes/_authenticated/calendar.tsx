import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays, addMinutes, addMonths, addWeeks, differenceInMinutes, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek, subMonths, subWeeks,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useCreateItem, useDeleteItem, useFolders, useItems, useUpdateItem } from "@/hooks/use-lifeos";
import type { Item } from "@/lib/lifeos-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

type View = "week" | "month" | "day";

function CalendarPage() {
  const { data: items = [] } = useItems();
  const { data: folders = [] } = useFolders();
  const create = useCreateItem();
  const update = useUpdateItem();
  const del = useDeleteItem();

  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const now = useNow(30_000);

  const events = useMemo(() => items.filter((i) => !i.archived && itemTiming(i) !== null), [items]);

  const eventsForDay = (d: Date) =>
    events.filter((e) => {
      const t = itemTiming(e);
      return t !== null && isSameDay(t.start, d);
    });

  const folderColor = (id: string | null) => folders.find((f) => f.id === id)?.color ?? "#3B4A6B";

  const openNew = (d: Date) => setSelectedDate(d);
  const shift = (dir: 1 | -1) => {
    if (view === "month") setCursor((c) => (dir > 0 ? addMonths(c, 1) : subMonths(c, 1)));
    if (view === "week") setCursor((c) => (dir > 0 ? addWeeks(c, 1) : subWeeks(c, 1)));
    if (view === "day") setCursor((c) => addDays(c, dir));
  };

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return items
      .filter((i) => !i.archived && ((i.type === "event" && i.event_date && new Date(i.event_date) >= now) || (i.type === "task" && !i.completed && i.due_date && new Date(i.due_date) >= now)))
      .sort((a, b) => {
        const dtA = itemTiming(a)?.start.getTime() ?? 0;
        const dtB = itemTiming(b)?.start.getTime() ?? 0;
        return dtA - dtB;
      });
  }, [items]);

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-4 sm:py-8">
      <header className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="font-display text-xl sm:text-3xl text-lagoon">
            Calendar
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">Plan your days, weeks and milestones.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList className="bg-muted/60">
              <TabsTrigger value="week" className="text-xs">Week</TabsTrigger>
              <TabsTrigger value="month" className="text-xs">Month</TabsTrigger>
              <TabsTrigger value="day" className="text-xs">Day</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-1 border border-white/10 rounded-xl bg-white/[0.03] p-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-xs font-semibold text-foreground">
              {view === "month"
                ? format(cursor, "MMMM yyyy")
                : view === "week"
                  ? format(startOfWeek(cursor), "'Week of' MMM d")
                  : format(cursor, "EEEE, MMM d")}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            onClick={() => setCursor(new Date())}
            className="h-9 rounded-xl border-white/10 bg-white/[0.03] text-xs"
          >
            Today
          </Button>

          <Button onClick={() => openNew(roundToNextSlot(view === "month" ? cursor : new Date()))} className="bg-lagoon text-cream hover:bg-lagoon/90 text-xs gap-1.5 h-9 rounded-xl">
            <Plus className="h-4 w-4" /> New Event
          </Button>
        </div>
      </header>

      {view === "month" && (
        <MonthGrid cursor={cursor} eventsForDay={eventsForDay} folderColor={folderColor} onDayClick={openNew} onEventClick={setEditing} />
      )}
      {view === "week" && (
        <TimeGrid
          days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))}
          now={now}
          eventsForDay={eventsForDay}
          folderColor={folderColor}
          onSlotClick={openNew}
          onEventClick={setEditing}
        />
      )}
      {view === "day" && (
        <TimeGrid
          days={[startOfDay(cursor)]}
          now={now}
          eventsForDay={eventsForDay}
          folderColor={folderColor}
          onSlotClick={openNew}
          onEventClick={setEditing}
        />
      )}

      {/* ── Upcoming Events List Feature ── */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 backdrop-blur">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold text-foreground">Upcoming Schedule</h2>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
              {upcomingEvents.length}
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => openNew(new Date())}
            className="h-8 rounded-xl bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-medium gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add Event
          </Button>
        </div>

        {upcomingEvents.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No upcoming events or tasks scheduled. Click "+ Add Event" to plan your day.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcomingEvents.map((ev) => {
              const timing = itemTiming(ev)!;
              const dt = timing.start;
              const color = folderColor(ev.folder_id);
              return (
                <div
                  key={ev.id}
                  onClick={() => setEditing(ev)}
                  className="group relative flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 transition hover:bg-white/[0.07] hover:border-white/20 cursor-pointer"
                >
                  <div
                    className="h-3 w-3 rounded-full shrink-0 mt-1"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs sm:text-sm text-foreground truncate">
                      {ev.title || "Untitled"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {timing.allDay
                        ? format(dt, "EEE, MMM d")
                        : `${format(dt, "EEE, MMM d · p")}${timing.hasEnd ? ` – ${format(timing.end, "p")}` : ""}`}
                    </p>
                    {ev.content && (
                      <p className="text-[10px] text-muted-foreground/75 truncate mt-1">
                        {ev.content}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] capitalize rounded bg-white/5 px-1.5 py-0.5 text-muted-foreground shrink-0">
                    {ev.type}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <EventDialog
        open={!!selectedDate || !!editing}
        onClose={() => { setSelectedDate(null); setEditing(null); }}
        date={selectedDate}
        existing={editing}
        folders={folders}
        onCreate={(payload) => create.mutate(payload)}
        onUpdate={(id, patch) => update.mutate({ id, patch })}
        onDelete={(id) => { setEditing(null); setSelectedDate(null); setConfirmDeleteId(id); }}
      />

      <ConfirmDeleteDialog
        open={confirmDeleteId !== null}
        onOpenChange={(o) => !o && setConfirmDeleteId(null)}
        title="Delete this event?"
        description="This event will be permanently deleted from your calendar."
        confirmLabel="Delete Event"
        onConfirm={() => {
          if (confirmDeleteId) {
            del.mutate(confirmDeleteId);
            setConfirmDeleteId(null);
          }
        }}
      />
    </div>
  );
}

function MonthGrid({
  cursor, eventsForDay, folderColor, onDayClick, onEventClick,
}: { cursor: Date; eventsForDay: (d: Date) => Item[]; folderColor: (id: string | null) => string; onDayClick: (d: Date) => void; onEventClick: (i: Item) => void }) {
  const start = startOfWeek(startOfMonth(cursor));
  const end = endOfWeek(endOfMonth(cursor));
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-clay">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-1.5 sm:px-3 py-2 text-center">
            <span className="block sm:hidden">{d.charAt(0)}</span>
            <span className="hidden sm:block">{d}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const inMonth = isSameMonth(d, cursor);
          const evs = eventsForDay(d);
          const today = isSameDay(d, new Date());
          return (
            <button
              key={d.toISOString()}
              onClick={() => onDayClick(d)}
              className={cn(
                "min-h-[64px] sm:min-h-[110px] border-b border-r p-1 sm:p-2 text-left transition hover:bg-accent/20",
                !inMonth && "bg-muted/20 text-muted-foreground",
              )}
            >
              <div className={cn("mb-1 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[10px] sm:text-xs font-semibold",
                today ? "bg-lagoon text-cream" : "text-lagoon/80")}>
                {format(d, "d")}
              </div>

              {/* Desktop view: full tags */}
              <div className="hidden sm:block space-y-1">
                {evs.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                    className="truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium text-lagoon"
                    style={{ background: (e.color ?? folderColor(e.folder_id)) + "33" }}
                  >
                    {e.type === "task" ? "☑ " : ""}{e.title || "Untitled"}
                  </div>
                ))}
                {evs.length > 3 && <div className="text-[10px] text-muted-foreground">+{evs.length - 3} more</div>}
              </div>

              {/* Mobile view: compact dot indicators */}
              <div className="flex sm:hidden flex-wrap items-center justify-center gap-0.5 max-w-full overflow-hidden mt-0.5">
                {evs.slice(0, 4).map((e) => (
                  <span
                    key={e.id}
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: e.color ?? folderColor(e.folder_id) }}
                    title={e.title ?? undefined}
                  />
                ))}
                {evs.length > 4 && (
                  <span className="text-[8px] font-bold text-muted-foreground">+</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Time helpers ────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 48; // px per hour in the time grid
const DEFAULT_EVENT_MINUTES = 60;
const DEFAULT_TASK_MINUTES = 30;

type Timing = { start: Date; end: Date; allDay: boolean; hasEnd: boolean };

/** Where an item sits on the calendar (null = not scheduled). */
function itemTiming(i: Item): Timing | null {
  if (i.type === "event" && i.event_date) {
    const start = new Date(i.event_date);
    const end = i.end_at ? new Date(i.end_at) : addMinutes(start, DEFAULT_EVENT_MINUTES);
    return { start, end, allDay: false, hasEnd: Boolean(i.end_at) };
  }
  if (i.type === "task") {
    if (i.start_at) {
      const start = new Date(i.start_at);
      const end = i.end_at ? new Date(i.end_at) : addMinutes(start, DEFAULT_TASK_MINUTES);
      return { start, end, allDay: false, hasEnd: Boolean(i.end_at) };
    }
    if (i.due_date) {
      const start = new Date(i.due_date);
      return { start, end: start, allDay: true, hasEnd: false };
    }
  }
  return null;
}

/** Live clock that re-renders every `intervalMs`. */
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Next 30-minute slot after `base` (keeps the date of `base`). */
function roundToNextSlot(base: Date) {
  const now = new Date();
  const d = new Date(base);
  if (isSameDay(base, now)) {
    d.setHours(now.getHours(), now.getMinutes() < 30 ? 30 : 60, 0, 0);
  } else {
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

/** Assign overlapping timed items to side-by-side lanes. */
function layoutDay(items: Item[]) {
  const timed = items
    .map((item) => ({ item, t: itemTiming(item)! }))
    .filter((x) => x.t && !x.t.allDay)
    .sort((a, b) => a.t.start.getTime() - b.t.start.getTime());

  const placed: { item: Item; t: Timing; lane: number; lanes: number }[] = [];
  let cluster: typeof placed = [];
  let clusterEnd = 0;
  const laneEnds: number[] = [];

  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => (c.lanes = lanes));
    placed.push(...cluster);
    cluster = [];
    laneEnds.length = 0;
  };

  for (const x of timed) {
    const s = x.t.start.getTime();
    const e = Math.max(x.t.end.getTime(), s + 15 * 60_000);
    if (cluster.length && s >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = e;
    cluster.push({ ...x, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return placed;
}

// ─── Time grid (Week / Day) with a live "now" indicator ─────────────────────

function TimeGrid({
  days, now, eventsForDay, folderColor, onSlotClick, onEventClick,
}: {
  days: Date[];
  now: Date;
  eventsForDay: (d: Date) => Item[];
  folderColor: (id: string | null) => string;
  onSlotClick: (d: Date) => void;
  onEventClick: (i: Item) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const showsToday = days.some((d) => isSameDay(d, now));
  const nowTop = (now.getHours() * 60 + now.getMinutes()) * (HOUR_HEIGHT / 60);
  const isWeek = days.length > 1;

  // Scroll so "now" (or 8 AM) is in view when the grid opens or the range changes
  const rangeKey = days[0]?.toDateString();
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = showsToday ? nowTop - el.clientHeight / 3 : 8 * HOUR_HEIGHT;
    el.scrollTop = Math.max(0, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  const gridCols = { gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` };
  // Header rows reserve the same scrollbar space as the hour grid so columns line up
  const gutter: React.CSSProperties = { overflowY: "hidden", scrollbarGutter: "stable" };

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
      <div className="overflow-x-auto">
        <div className={cn(isWeek && "min-w-[720px]")}>
          {/* Day headers */}
          <div className="grid border-b" style={{ ...gridCols, ...gutter }}>
            <div className="flex items-end justify-center pb-1 text-[9px] font-medium text-muted-foreground">
              {format(now, "O")}
            </div>
            {days.map((d) => {
              const today = isSameDay(d, now);
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => onSlotClick(roundToNextSlot(d))}
                  className={cn(
                    "relative flex flex-col items-start border-l px-3 pb-2 pt-2.5 text-left transition hover:bg-accent/20",
                    today && "text-primary"
                  )}
                >
                  {today && <span className="absolute inset-x-0 top-0 h-[3px] bg-primary" />}
                  <span className={cn("font-display text-xl leading-none sm:text-2xl", today ? "font-semibold text-primary" : "text-foreground/80")}>
                    {format(d, "d")}
                  </span>
                  <span className={cn("mt-1 text-[11px]", today ? "font-semibold text-primary" : "text-muted-foreground")}>
                    {format(d, isWeek && days.length > 5 ? "EEE" : "EEEE")}
                  </span>
                </button>
              );
            })}
          </div>

          {/* All-day row (tasks with a date but no time) */}
          {days.some((d) => eventsForDay(d).some((e) => itemTiming(e)?.allDay)) && (
            <div className="grid border-b bg-muted/20" style={{ ...gridCols, ...gutter }}>
              <div className="flex items-center justify-end pr-2 text-[9px] font-medium uppercase text-muted-foreground">
                All day
              </div>
              {days.map((d) => (
                <div key={d.toISOString()} className="min-w-0 space-y-1 border-l p-1">
                  {eventsForDay(d)
                    .filter((e) => itemTiming(e)?.allDay)
                    .map((e) => (
                      <button
                        key={e.id}
                        onClick={() => onEventClick(e)}
                        className={cn(
                          "block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-lagoon",
                          e.completed && "line-through opacity-60"
                        )}
                        style={{ background: (e.color ?? folderColor(e.folder_id)) + "33" }}
                      >
                        {e.type === "task" ? "☑ " : ""}{e.title || "Untitled"}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          )}

          {/* Scrollable hours */}
          <div ref={scrollRef} className="relative max-h-[65vh] overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
            <div className="relative grid" style={{ ...gridCols, height: 24 * HOUR_HEIGHT }}>
              {/* Hour gutter */}
              <div className="relative">
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-transparent px-2 pt-1 text-right text-[10px] text-muted-foreground tabular-nums"
                    style={{ top: h * HOUR_HEIGHT }}
                  >
                    {format(new Date(2000, 0, 1, h), "h a")}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {days.map((d) => {
                const today = isSameDay(d, now);
                const placed = layoutDay(eventsForDay(d));
                return (
                  <div
                    key={d.toISOString()}
                    className="relative border-l"
                    onClick={(ev) => {
                      const rect = (ev.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const minutes = Math.floor(((ev.clientY - rect.top) / HOUR_HEIGHT) * 2) * 30;
                      const slot = startOfDay(d);
                      slot.setMinutes(Math.min(Math.max(minutes, 0), 23 * 60 + 30));
                      onSlotClick(slot);
                    }}
                  >
                    {/* hour + half-hour lines */}
                    {hours.map((h) => (
                      <div key={h} className="pointer-events-none absolute inset-x-0" style={{ top: h * HOUR_HEIGHT }}>
                        <div className="border-t border-border/60" />
                        <div className="border-t border-dashed border-border/25" style={{ marginTop: HOUR_HEIGHT / 2 - 1 }} />
                      </div>
                    ))}

                    {/* events */}
                    {placed.map(({ item, t, lane, lanes }) => {
                      const dayStart = startOfDay(d);
                      const startMin = Math.max(0, differenceInMinutes(t.start, dayStart));
                      const endMin = Math.min(24 * 60, Math.max(startMin + 20, differenceInMinutes(t.end, dayStart)));
                      const color = item.color ?? folderColor(item.folder_id);
                      const past = t.end < now;
                      const live = t.start <= now && now < t.end;
                      return (
                        <button
                          key={item.id}
                          onClick={(ev) => { ev.stopPropagation(); onEventClick(item); }}
                          className={cn(
                            "absolute z-10 overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left shadow-sm transition hover:z-20 hover:shadow-md",
                            past && "opacity-60",
                            live && "ring-1 ring-primary/60",
                            item.completed && "line-through"
                          )}
                          style={{
                            top: startMin * (HOUR_HEIGHT / 60),
                            height: (endMin - startMin) * (HOUR_HEIGHT / 60) - 2,
                            left: `calc(${(lane / lanes) * 100}% + 2px)`,
                            width: `calc(${100 / lanes}% - 4px)`,
                            background: color + "2e",
                            borderLeftColor: color,
                          }}
                          title={`${item.title || "Untitled"} · ${format(t.start, "p")} – ${format(t.end, "p")}`}
                        >
                          <p className="truncate text-[11px] font-semibold leading-tight text-lagoon">
                            {item.type === "task" ? "☑ " : ""}{item.title || "Untitled"}
                          </p>
                          {endMin - startMin >= 40 && (
                            <p className="truncate text-[10px] text-muted-foreground">
                              {format(t.start, "p")} – {format(t.end, "p")}
                            </p>
                          )}
                        </button>
                      );
                    })}

                    {/* Current time: solid line in today's column, dotted across the other days (Teams-style) */}
                    {showsToday && (
                      <div
                        className="pointer-events-none absolute inset-x-0 z-30 -translate-y-1/2"
                        style={{
                          top: nowTop,
                          borderTop: today ? "2px solid #e3572b" : "1px dotted #e3572b",
                        }}
                        title={today ? `Now · ${format(now, "p")}` : undefined}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventDialog({
  open, onClose, date, existing, folders, onCreate, onUpdate, onDelete,
}: {
  open: boolean; onClose: () => void; date: Date | null; existing: Item | null;
  folders: any[];
  onCreate: (p: any) => void; onUpdate: (id: string, p: any) => void; onDelete: (id: string) => void;
}) {
  const initialDate = existing?.event_date ?? existing?.due_date ?? date?.toISOString() ?? new Date().toISOString();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [when, setWhen] = useState(toLocal(existing?.start_at ?? initialDate));
  const [until, setUntil] = useState(existing?.end_at ? toLocal(existing.end_at) : "");
  const [folderId, setFolderId] = useState<string>(existing?.folder_id ?? "none");
  const [color, setColor] = useState(existing?.color ?? "#E48CA5");

  // reset when opened for a different item
  useMemo(() => {
    setTitle(existing?.title ?? "");
    setContent(existing?.content ?? "");
    const startIso = existing?.start_at ?? existing?.event_date ?? existing?.due_date ?? date?.toISOString() ?? new Date().toISOString();
    setWhen(toLocal(startIso));
    setUntil(
      existing?.end_at
        ? toLocal(existing.end_at)
        : existing
          ? ""
          : toLocal(addMinutes(new Date(startIso), DEFAULT_EVENT_MINUTES).toISOString())
    );
    setFolderId(existing?.folder_id ?? "none");
    setColor(existing?.color ?? "#E48CA5");
  }, [existing?.id, date?.toISOString()]);

  const save = () => {
    const startDate = new Date(when);
    if (Number.isNaN(startDate.getTime())) return;
    const iso = startDate.toISOString();
    const endDate = until ? new Date(until) : null;
    if (endDate && endDate <= startDate) {
      toast.error("End time must be after the start time.");
      return;
    }
    const endIso = endDate ? endDate.toISOString() : null;

    if (existing) {
      const patch: any = { title, content, color, folder_id: folderId === "none" ? null : folderId, end_at: endIso };
      if (existing.type === "event") {
        patch.event_date = iso;
      } else {
        patch.due_date = iso;
        // Keep task time windows in sync when it was scheduled with a time
        if (existing.start_at || endIso) patch.start_at = iso;
      }
      onUpdate(existing.id, patch);
    } else {
      onCreate({
        type: "event", title, content, color, event_date: iso, end_at: endIso,
        folder_id: folderId === "none" ? null : folderId,
      });
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit" : "New event"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Starts</span>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Ends (optional)</span>
              <Input type="datetime-local" value={until} min={when} onChange={(e) => setUntil(e.target.value)} />
            </label>
          </div>
          <Textarea placeholder="Notes…" value={content ?? ""} onChange={(e) => setContent(e.target.value)} />
          <div className="flex gap-2">
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 p-1" />
          </div>
          <div className="flex justify-between pt-2">
            {existing ? (
              <Button variant="outline" onClick={() => { onDelete(existing.id); onClose(); }} className="text-destructive">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={save} className="bg-lagoon text-cream hover:bg-lagoon/90">Save</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function toLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
