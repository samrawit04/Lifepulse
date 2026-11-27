import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import type { VideoInfo } from "@/lib/music-player-context";
import { useUserSetting } from "@/hooks/use-user-setting";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ─── Topics ──────────────────────────────────────────────────────────────────

export const TOPIC_GROUPS = ["Podcasts", "Learning", "Documentaries", "Music", "Entertainment", "My topics"] as const;
export type TopicGroup = (typeof TOPIC_GROUPS)[number];

export type WatchTopic = {
  id: string;
  title: string;
  /** What we search YouTube for. */
  query: string;
  group: TopicGroup;
  /** Prefer long-form videos (20 min+) — podcasts, documentaries. */
  long?: boolean;
};

/** Suggested starting topics, focused on growth and productivity. Users can remove/add their own. */
export const SUGGESTED_TOPICS: WatchTopic[] = [
  { id: "self-dev", title: "Self-development", query: "Mel Robbins podcast self improvement", group: "Podcasts", long: true },
  { id: "career", title: "Career & success", query: "The Diary of a CEO career success podcast", group: "Podcasts", long: true },
  { id: "psychology", title: "Psychology & human nature", query: "Robert Greene psychology human nature interview", group: "Podcasts", long: true },
  { id: "mindset", title: "Mindset & habits", query: "Jay Shetty On Purpose mindset habits podcast", group: "Podcasts", long: true },
  { id: "productivity", title: "Productivity", query: "Ali Abdaal productivity tips", group: "Learning" },
  { id: "ted", title: "TED talks", query: "TED talk personal growth", group: "Learning" },
  { id: "science-docs", title: "Science & nature", query: "full documentary science nature", group: "Documentaries", long: true },
  { id: "history-docs", title: "History", query: "full history documentary", group: "Documentaries", long: true },
  { id: "business-docs", title: "Business & tech", query: "business technology documentary full", group: "Documentaries", long: true },
  { id: "focus-music", title: "Focus & study", query: "lofi focus study music", group: "Music" },
  { id: "calm-music", title: "Calm & relaxing", query: "calm relaxing instrumental music", group: "Music" },
  { id: "comedy", title: "Stand-up comedy", query: "clean stand up comedy special", group: "Entertainment" },
  { id: "trailers", title: "New movie trailers", query: "official movie trailer", group: "Entertainment" },
];

const NO_WORDS: string[] = [];

/** User's topics (saved on their account). Falls back to suggestions + their old music quick words. */
export function useWatchTopics() {
  const { value: saved, hasSavedValue, isLoading, save } = useUserSetting<WatchTopic[] | null>("watch-topics", null);
  const { value: oldQuickWords } = useUserSetting<string[]>("music-quick-words", NO_WORDS);

  const topics = useMemo<WatchTopic[]>(() => {
    if (hasSavedValue && saved) return saved;
    const migrated = oldQuickWords.map((w) => ({ id: `qw-${w}`, title: w, query: w, group: "My topics" as const }));
    return [...SUGGESTED_TOPICS, ...migrated];
  }, [hasSavedValue, saved, oldQuickWords]);

  return {
    topics,
    isLoading,
    save: (next: WatchTopic[]) => save(next),
    resetToSuggested: () => save(SUGGESTED_TOPICS),
  };
}

// ─── YouTube ─────────────────────────────────────────────────────────────────

type Page = { videos: VideoInfo[]; nextPageToken: string | null };

async function searchYouTube(apiKey: string, topic: WatchTopic, pageToken?: string): Promise<Page> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "12",
    q: topic.query,
    safeSearch: "moderate",
    videoEmbeddable: "true",
    key: apiKey,
  });
  if (topic.long) params.set("videoDuration", "long");
  if (topic.group === "Music") params.set("videoCategoryId", "10");
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
        className="absolute left-0 top-[28%] hidden h-9 w-9 -translate-x-1/2 place-items-center rounded-full border border-border bg-card text-foreground shadow-lg transition hover:scale-105 group-hover/row:grid"
        aria-label="Scroll left"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        onClick={() => scrollBy(1)}
        className="absolute right-0 top-[28%] hidden h-9 w-9 translate-x-1/2 place-items-center rounded-full border border-border bg-card text-foreground shadow-lg transition hover:scale-105 group-hover/row:grid"
        aria-label="Scroll right"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function TopicRow({ topic, apiKey, onRemove, ...card }: { topic: WatchTopic; apiKey: string; onRemove: () => void } & CardProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const q = useInfiniteQuery({
    queryKey: ["watch-row", topic.query, topic.long ?? false, topic.group === "Music"],
    queryFn: ({ pageParam }) => searchYouTube(apiKey, topic, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextPageToken,
    enabled: inView && !!apiKey,
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
        <h3 className="truncate text-base font-semibold text-foreground">{topic.title}</h3>
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
            onClick={onRemove}
            title={`Remove "${topic.title}"`}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!inView || q.isLoading ? (
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

function AddTopicDialog({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (t: WatchTopic) => void }) {
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<TopicGroup>("My topics");
  const [long, setLong] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setQuery("");
      setGroup("My topics");
      setLong(false);
    }
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    onAdd({ id: `t-${Date.now().toString(36)}`, title: t, query: query.trim() || t, group, long });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl sm:max-w-md sm:p-6">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold">Add a topic</DialogTitle>
            <p className="text-xs text-muted-foreground">It becomes a new row of videos you can browse.</p>
          </DialogHeader>
          <div className="space-y-4 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="topic-title" className="text-xs font-semibold">Topic name</Label>
              <Input id="topic-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Personal finance" autoFocus className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topic-query" className="text-xs font-semibold">Search keywords (optional)</Label>
              <Input id="topic-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Ramit Sethi money podcast" className="h-10" />
              <p className="text-[11px] text-muted-foreground">Name creators or shows you like for better results.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Section</Label>
              <div className="flex flex-wrap gap-1.5">
                {TOPIC_GROUPS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setGroup(g);
                      setLong(g === "Podcasts" || g === "Documentaries");
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition",
                      group === g ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={long} onChange={(e) => setLong(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
              Long videos only (20+ min)
            </label>
          </div>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-9 rounded-xl text-xs">Cancel</Button>
            <Button type="submit" size="sm" disabled={!title.trim()} className="h-9 rounded-xl px-4 text-xs font-semibold">Add topic</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Netflix-style discovery: one row per topic, grouped into sections. */
export function Discover({
  apiKey,
  pickedForYou,
  ...card
}: {
  apiKey: string;
  /** Optional personalised row (from the user's playlists) shown first. */
  pickedForYou?: { videos: VideoInfo[]; loading: boolean; subtitle?: string };
} & CardProps) {
  const { topics, save, resetToSuggested } = useWatchTopics();
  const [adding, setAdding] = useState(false);

  const removeTopic = (id: string) => {
    const t = topics.find((x) => x.id === id);
    save(topics.filter((x) => x.id !== id));
    if (t) toast.success(`Removed "${t.title}"`);
  };

  const groups = TOPIC_GROUPS.map((g) => ({ group: g, items: topics.filter((t) => t.group === g) })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Rows load as you scroll. Remove topics you don't want, or add your own.</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={resetToSuggested} className="h-8 gap-1.5 text-xs text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
          <Button size="sm" onClick={() => setAdding(true)} className="h-8 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Add topic
          </Button>
        </div>
      </div>

      {pickedForYou && (pickedForYou.loading || pickedForYou.videos.length > 0) && (
        <section className="space-y-2.5">
          <div>
            <h3 className="text-base font-semibold text-foreground">Picked for you</h3>
            {pickedForYou.subtitle && <p className="text-xs text-muted-foreground">{pickedForYou.subtitle}</p>}
          </div>
          {pickedForYou.loading ? (
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-video w-56 shrink-0 animate-pulse rounded-xl bg-muted sm:w-64" />
              ))}
            </div>
          ) : (
            <Scroller>
              {pickedForYou.videos.map((v) => (
                <RowCard
                  key={v.videoId}
                  video={v}
                  active={card.activeVideoId === v.videoId}
                  onPlay={() => card.onPlay(v, pickedForYou.videos)}
                  actions={card.renderActions?.(v)}
                />
              ))}
            </Scroller>
          )}
        </section>
      )}

      {groups.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No topics yet. Add one, or reset to the suggested topics.
        </div>
      )}

      {groups.map(({ group, items }) => (
        <div key={group} className="space-y-5">
          <h2 className="font-display text-lg font-semibold text-foreground sm:text-xl">{group}</h2>
          {items.map((t) => (
            <TopicRow key={t.id} topic={t} apiKey={apiKey} onRemove={() => removeTopic(t.id)} {...card} />
          ))}
        </div>
      ))}

      <AddTopicDialog
        open={adding}
        onOpenChange={setAdding}
        onAdd={(t) => {
          save([...topics, t]);
          setAdding(false);
          toast.success(`Added "${t.title}"`);
        }}
      />
    </div>
  );
}
