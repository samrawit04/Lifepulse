import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { VideoInfo } from "@/lib/music-player-context";
import { useUserSetting } from "@/hooks/use-user-setting";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ─── Topics ──────────────────────────────────────────────────────────────────

/**
 * A topic is one Netflix-style row. Its keywords are searched separately and the
 * results are mixed together, so "Podcasts" shows self-development, career,
 * psychology… all in a single row.
 */
export type WatchSection = {
  id: string;
  title: string;
  /** Searches mixed into this row (creators, shows, subjects). */
  queries: string[];
  /** Prefer long-form videos (20 min+) — podcasts, documentaries. */
  long?: boolean;
  /** Search YouTube's Music category. */
  music?: boolean;
};

/** Suggested starting topics, focused on growth and productivity. Users can edit everything. */
export const SUGGESTED_SECTIONS: WatchSection[] = [
  {
    id: "documentaries",
    title: "Documentaries",
    long: true,
    queries: ["full documentary science nature", "full history documentary", "business technology documentary"],
  },
  { id: "entertainment", title: "Entertainment", queries: ["clean stand up comedy special", "official movie trailer"] },
  { id: "learning", title: "Learning", queries: ["Ali Abdaal productivity", "TED talk personal growth", "how to learn faster"] },
  {
    id: "podcasts",
    title: "Podcasts",
    long: true,
    queries: [
      "Mel Robbins podcast self improvement",
      "The Diary of a CEO career success",
      "Robert Greene psychology human nature",
      "Jay Shetty On Purpose mindset habits",
    ],
  },
  { id: "music", title: "Music", music: true, queries: ["lofi focus study music", "calm relaxing instrumental music"] },
];

/** Preferred order for the built-in topics (custom topics keep their place after these). */
const PREFERRED_ORDER = ["documentaries", "entertainment", "learning", "podcasts", "music"];
const rankOf = (s: WatchSection) => {
  const i = PREFERRED_ORDER.indexOf(s.title.trim().toLowerCase());
  return i === -1 ? PREFERRED_ORDER.length : i;
};

/** Shape saved by the previous version: one row per keyword with a group name. */
type LegacyTopic = { id: string; title: string; query: string; group: string; long?: boolean };

function fromLegacy(topics: LegacyTopic[]): WatchSection[] {
  const out: WatchSection[] = [];
  for (const t of topics) {
    let sec = out.find((x) => x.title === t.group);
    if (!sec) {
      sec = { id: `s-${t.group.toLowerCase().replace(/\W+/g, "-")}`, title: t.group, queries: [], long: false, music: t.group === "Music" };
      out.push(sec);
    }
    if (!sec.queries.includes(t.query)) sec.queries.push(t.query);
    if (t.long) sec.long = true;
  }
  return out;
}

const NO_WORDS: string[] = [];

/** The user's topics, saved on their account (never only in the browser). */
export function useWatchSections() {
  const { value: saved, hasSavedValue, isLoading, save } = useUserSetting<WatchSection[] | null>("watch-sections", null);
  const { value: legacy, hasSavedValue: hasLegacy } = useUserSetting<LegacyTopic[] | null>("watch-topics", null);
  const { value: oldQuickWords } = useUserSetting<string[]>("music-quick-words", NO_WORDS);

  const sections = useMemo<WatchSection[]>(() => {
    if (hasSavedValue && saved) return saved;
    if (hasLegacy && legacy && legacy.length > 0) return fromLegacy(legacy);
    const base = SUGGESTED_SECTIONS.map((x) => ({ ...x, queries: [...x.queries] }));
    if (oldQuickWords.length > 0) base.push({ id: "my-topics", title: "My topics", queries: [...oldQuickWords] });
    return base;
  }, [hasSavedValue, saved, hasLegacy, legacy, oldQuickWords]);

  return {
    sections,
    hasSaved: hasSavedValue && !!saved,
    isLoading,
    save: (next: WatchSection[]) => save(next),
    resetToSuggested: () => save(SUGGESTED_SECTIONS),
  };
}

// ─── YouTube ─────────────────────────────────────────────────────────────────

type QueryPage = { videos: VideoInfo[]; nextPageToken: string | null };

async function searchYouTube(apiKey: string, q: string, sec: WatchSection, max: number, pageToken?: string): Promise<QueryPage> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: String(max),
    q,
    safeSearch: "moderate",
    videoEmbeddable: "true",
    key: apiKey,
  });
  if (sec.long) params.set("videoDuration", "long");
  if (sec.music) params.set("videoCategoryId", "10");
  if (pageToken) params.set("pageToken", pageToken);

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const reason = err?.error?.errors?.[0]?.reason;
    throw new Error(reason === "quotaExceeded" ? "YouTube's daily limit was reached — try again tomorrow." : "Couldn't load videos.");
  }
  const data = await res.json();
  return {
    videos: (data.items ?? [])
      .filter((it: any) => it?.id?.videoId)
      .map((it: any) => ({
        videoId: it.id.videoId,
        title: it.snippet?.title ?? "Untitled",
        channelName: it.snippet?.channelTitle ?? "YouTube",
        thumbnail: it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.medium?.url || `https://img.youtube.com/vi/${it.id.videoId}/hqdefault.jpg`,
        durationSeconds: 0,
      })),
    nextPageToken: data.nextPageToken ?? null,
  };
}

/** Page tokens per keyword; a keyword with `null` has no more results. */
type Cursor = Record<string, string | null>;
type MixedPage = { videos: VideoInfo[]; cursor: Cursor };

/** Fetch every keyword of a topic in parallel and interleave the results into one list. */
async function fetchMixed(apiKey: string, sec: WatchSection, cursor: Cursor | null): Promise<MixedPage> {
  const queries = cursor ? sec.queries.filter((q) => cursor[q]) : sec.queries;
  const perQuery = Math.max(4, Math.min(10, Math.ceil(20 / Math.max(1, sec.queries.length))));
  const settled = await Promise.allSettled(queries.map((q) => searchYouTube(apiKey, q, sec, perQuery, cursor?.[q] ?? undefined)));

  const ok = settled.filter((r): r is PromiseFulfilledResult<QueryPage> => r.status === "fulfilled");
  if (ok.length === 0 && settled.length > 0) throw (settled[0] as PromiseRejectedResult).reason;

  const next: Cursor = {};
  settled.forEach((r, i) => (next[queries[i]] = r.status === "fulfilled" ? r.value.nextPageToken : null));

  const lists = settled.map((r) => (r.status === "fulfilled" ? r.value.videos : []));
  const mixed: VideoInfo[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const l of lists) if (l[i]) mixed.push(l[i]);
  return { videos: mixed, cursor: next };
}

/** Becomes true once the element scrolls near the viewport (so rows load lazily and save API quota). */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const obs = new IntersectionObserver(([entry]) => entry.isIntersecting && setInView(true), { rootMargin: "300px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView]);
  return { ref, inView };
}

// ─── UI ──────────────────────────────────────────────────────────────────────

type CardProps = {
  activeVideoId?: string | null;
  onPlay: (v: VideoInfo, queue: VideoInfo[]) => void;
  renderActions?: (v: VideoInfo) => ReactNode;
};

function RowCard({ video, active, onPlay, actions }: { video: VideoInfo; active: boolean; onPlay: () => void; actions?: ReactNode }) {
  return (
    <div
      onClick={onPlay}
      className={cn(
        "group w-56 shrink-0 cursor-pointer snap-start sm:w-64",
        active && "rounded-xl ring-2 ring-primary/60 ring-offset-2 ring-offset-background"
      )}
    >
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black/40">
        <img src={video.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        {actions && (
          <div className="absolute right-1.5 top-1.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-foreground" dangerouslySetInnerHTML={{ __html: video.title }} />
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{video.channelName}</p>
    </div>
  );
}

function Scroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.85), behavior: "smooth" });
  return (
    <div className="group/row relative">
      <div ref={ref} className="flex snap-x gap-3 overflow-x-auto scroll-smooth pb-2 scrollbar-none">
        {children}
      </div>
      <button
        onClick={() => scrollBy(-1)}
        className="absolute left-1 top-[28%] hidden h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground shadow-lg transition hover:scale-105 group-hover/row:grid"
        aria-label="Scroll left"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        onClick={() => scrollBy(1)}
        className="absolute right-1 top-[28%] hidden h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground shadow-lg transition hover:scale-105 group-hover/row:grid"
        aria-label="Scroll right"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function TopicRow({ section, apiKey, onEdit, ...card }: { section: WatchSection; apiKey: string; onEdit: () => void } & CardProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const q = useInfiniteQuery({
    queryKey: ["watch-mixed-row", section.queries, section.long ?? false, section.music ?? false],
    queryFn: ({ pageParam }) => fetchMixed(apiKey, section, pageParam),
    initialPageParam: null as Cursor | null,
    getNextPageParam: (last) => (Object.values(last.cursor).some(Boolean) ? last.cursor : undefined),
    enabled: inView && !!apiKey && section.queries.length > 0,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 120,
    refetchOnWindowFocus: false,
  });

  const videos = useMemo(() => {
    const seen = new Set<string>();
    return (q.data?.pages ?? []).flatMap((p) => p.videos).filter((v) => (seen.has(v.videoId) ? false : (seen.add(v.videoId), true)));
  }, [q.data]);

  return (
    <section ref={ref} className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-semibold text-foreground sm:text-xl">{section.title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {q.hasNextPage && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
              className="h-7 gap-1 px-2 text-xs text-primary"
            >
              {q.isFetchingNextPage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              More
            </Button>
          )}
          <button
            onClick={onEdit}
            title={`Edit "${section.title}"`}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {section.queries.length === 0 ? (
        <button
          onClick={onEdit}
          className="w-full rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground hover:border-primary/50 hover:text-primary"
        >
          Add keywords to fill this row
        </button>
      ) : !inView || q.isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-56 shrink-0 sm:w-64">
              <div className="aspect-video animate-pulse rounded-xl bg-muted" />
              <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : q.isError ? (
        <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-xs text-muted-foreground">
          {(q.error as Error).message}
          <button onClick={() => q.refetch()} className="font-medium text-primary hover:underline">Try again</button>
        </div>
      ) : videos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          Nothing found for this topic. Try different keywords.
        </p>
      ) : (
        <Scroller>
          {videos.map((v) => (
            <RowCard
              key={v.videoId}
              video={v}
              active={card.activeVideoId === v.videoId}
              onPlay={() => card.onPlay(v, videos)}
              actions={card.renderActions?.(v)}
            />
          ))}
          {q.hasNextPage && (
            <button
              onClick={() => q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
              className="grid aspect-video w-40 shrink-0 snap-start place-items-center rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground transition hover:border-primary/50 hover:text-primary"
            >
              {q.isFetchingNextPage ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="flex items-center gap-1"><Plus className="h-4 w-4" /> Load more</span>}
            </button>
          )}
        </Scroller>
      )}
    </section>
  );
}

/** Create or edit one topic: its name, the keywords mixed into its row, and options. */
function TopicDialog({
  section,
  open,
  onOpenChange,
  onSave,
  onDelete,
}: {
  section: WatchSection | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (s: WatchSection) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [queries, setQueries] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [long, setLong] = useState(false);
  const [music, setMusic] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(section?.title ?? "");
    setQueries(section ? [...section.queries] : []);
    setDraft("");
    setLong(section?.long ?? false);
    setMusic(section?.music ?? false);
  }, [open, section]);

  const pushDraft = () => {
    const v = draft.trim().replace(/\s+/g, " ");
    if (!v) return;
    if (!queries.some((q) => q.toLowerCase() === v.toLowerCase())) setQueries((prev) => [...prev, v]);
    setDraft("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const pending = draft.trim();
    const qs = pending && !queries.includes(pending) ? [...queries, pending] : queries;
    if (qs.length === 0) return toast.error("Add at least one keyword");
    onSave({ id: section?.id ?? `s-${Date.now().toString(36)}`, title: t, queries: qs, long, music });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl sm:max-w-md sm:p-6">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold">{section ? "Edit topic" : "Add a topic"}</DialogTitle>
            <p className="text-xs text-muted-foreground">Each topic is one row. Videos from all its keywords are mixed together.</p>
          </DialogHeader>
          <div className="space-y-4 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="topic-title" className="text-xs font-semibold">Topic name</Label>
              <Input id="topic-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Podcasts, Personal finance" autoFocus={!section} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topic-query" className="text-xs font-semibold">Keywords</Label>
              {queries.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {queries.map((q, i) => (
                    <span key={q} className="flex items-center gap-1 rounded-full border border-border bg-muted/50 py-1 pl-3 pr-1.5 text-xs text-foreground">
                      {q}
                      <button
                        type="button"
                        onClick={() => setQueries((prev) => prev.filter((_, j) => j !== i))}
                        className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title={`Remove "${q}"`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  id="topic-query"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      pushDraft();
                    }
                  }}
                  placeholder="e.g. Ramit Sethi money podcast"
                  className="h-10"
                />
                <Button type="button" variant="outline" onClick={pushDraft} className="h-10 shrink-0 rounded-xl px-3">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Name creators, shows or subjects. Press Enter to add each one.</p>
            </div>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={long} onChange={(e) => setLong(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                Long videos only (20+ min)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={music} onChange={(e) => setMusic(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                Music only
              </label>
            </div>
          </div>
          <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
            {onDelete ? (
              <Button type="button" variant="ghost" size="sm" onClick={onDelete} className="h-9 gap-1 text-xs text-destructive hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" /> Delete topic
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-9 rounded-xl text-xs">Cancel</Button>
              <Button type="submit" size="sm" disabled={!title.trim()} className="h-9 rounded-xl px-4 text-xs font-semibold">
                {section ? "Save" : "Add topic"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Netflix-style discovery: one mixed row per topic. */
export function Discover({ apiKey, ...card }: { apiKey: string } & CardProps) {
  const { sections, hasSaved, save, resetToSuggested } = useWatchSections();
  const { value: reordered, isLoading: orderLoading, save: markReordered } = useUserSetting<boolean>("watch-sections-reordered", false);

  // One time: put Documentaries, Entertainment, Learning, Podcasts, Music first for people who already saved topics
  useEffect(() => {
    if (orderLoading || reordered || !hasSaved) return;
    const sorted = [...sections].map((s, i) => ({ s, i })).sort((a, b) => rankOf(a.s) - rankOf(b.s) || a.i - b.i).map((x) => x.s);
    if (sorted.some((s, i) => s.id !== sections[i].id)) save(sorted);
    markReordered(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderLoading, reordered, hasSaved]);
  // undefined = closed, null = new topic, otherwise the topic being edited
  const [editing, setEditing] = useState<WatchSection | null | undefined>(undefined);

  const upsert = (s: WatchSection) => {
    const exists = sections.some((x) => x.id === s.id);
    save(exists ? sections.map((x) => (x.id === s.id ? s : x)) : [...sections, s]);
    setEditing(undefined);
    toast.success(exists ? `Saved "${s.title}"` : `Added "${s.title}"`);
  };

  const remove = (id: string) => {
    const s = sections.find((x) => x.id === id);
    save(sections.filter((x) => x.id !== id));
    setEditing(undefined);
    if (s) toast.success(`Removed "${s.title}"`);
  };

  const move = (id: string, dir: -1 | 1) => {
    const i = sections.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Rows load as you scroll. Edit a topic to change what it shows.</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={resetToSuggested} className="h-8 gap-1.5 text-xs text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
          <Button size="sm" onClick={() => setEditing(null)} className="h-8 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Add topic
          </Button>
        </div>
      </div>

      {sections.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No topics yet. Add one, or reset to the suggested topics.
        </div>
      )}

      {sections.map((s, idx) => (
        <div key={s.id} className="group/topic relative">
          <TopicRow section={s} apiKey={apiKey} onEdit={() => setEditing(s)} {...card} />
          <div className="absolute -left-1 top-1 hidden -translate-x-full flex-col gap-0.5 xl:group-hover/topic:flex">
            <button disabled={idx === 0} onClick={() => move(s.id, -1)} title="Move up" className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button disabled={idx === sections.length - 1} onClick={() => move(s.id, 1)} title="Move down" className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}

      <TopicDialog
        section={editing ?? null}
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        onSave={upsert}
        onDelete={editing ? () => remove(editing.id) : undefined}
      />
    </div>
  );
}
