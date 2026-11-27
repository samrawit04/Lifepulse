import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Search, X, Download, ExternalLink, Plus, Check, ChevronLeft, ChevronRight, Link as LinkIcon,
  Loader2, Bookmark, Info, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUserSetting } from "@/hooks/use-user-setting";
import { apiClient, type PinterestPin, type PinterestSource } from "@/integrations/api/client";

export const Route = createFileRoute("/_authenticated/pinterest")({
  component: PinterestPage,
  head: () => ({
    meta: [
      { title: "Pinterest · LifePulse" },
      { name: "description", content: "Search and save visual inspiration inside LifePulse." },
    ],
  }),
});

const RED = "#E60023";

function PinterestIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345-.09.375-.293 1.199-.334 1.367-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.541.535 6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z" />
    </svg>
  );
}

const DEFAULT_IDEAS = [
  "minimalist workspace", "cozy reading nook", "vision board", "study aesthetic",
  "home office ideas", "bullet journal", "calm wallpapers", "healthy meal prep",
];
const NO_PINS: PinterestPin[] = [];
const SOURCE_NAME: Record<PinterestSource, string> = {
  pinterest: "Pinterest",
  pexels: "Pexels",
  unsplash: "Unsplash",
  openverse: "Openverse",
  none: "",
};

const pinterestSearchUrl = (q: string) => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`;
const samePin = (a: PinterestPin, b: PinterestPin) => a.id === b.id || a.imageUrl === b.imageUrl;

// ─── Pin card ────────────────────────────────────────────────────────────────

function PinCard({ pin, saved, onOpen, onToggleSave }: { pin: PinterestPin; saved: boolean; onOpen: () => void; onToggleSave: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ratio = pin.width && pin.height ? Math.min(Math.max(pin.height / pin.width, 0.6), 1.8) : 1.3;
  if (failed) return null;

  return (
    <div className="mb-3 break-inside-avoid sm:mb-4">
      <div
        onClick={onOpen}
        className="group relative cursor-zoom-in overflow-hidden rounded-2xl"
        style={{ aspectRatio: `1 / ${ratio}`, backgroundColor: pin.dominantColor || "hsl(var(--muted))" }}
      >
        <img
          src={pin.thumbnailUrl || pin.imageUrl}
          alt={pin.title ?? ""}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]",
            loaded ? "opacity-100" : "opacity-0"
          )}
        />
        {!loaded && <div className="absolute inset-0 animate-pulse bg-white/5" />}

        <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/35" />

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSave();
          }}
          className={cn(
            "absolute right-2 top-2 rounded-full px-3.5 py-2 text-xs font-bold text-white shadow-lg transition",
            saved ? "bg-black/70 opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          )}
          style={saved ? undefined : { backgroundColor: RED }}
        >
          {saved ? "Saved" : "Save"}
        </button>

        <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 opacity-0 transition group-hover:opacity-100">
          {pin.sourceDomain ? (
            <a
              href={pin.pinUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex min-w-0 items-center gap-1 truncate rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-black hover:bg-white"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{pin.sourceDomain}</span>
            </a>
          ) : (
            <span />
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(pin.pinUrl);
              toast.success("Link copied");
            }}
            title="Copy link"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/90 text-black hover:bg-white"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {(pin.title || pin.pinnerName) && (
        <div className="px-1 pt-1.5">
          {pin.title && <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">{pin.title}</p>}
          {pin.pinnerName && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{pin.pinnerName}</p>}
        </div>
      )}
    </div>
  );
}

function Masonry({ pins, isSaved, onOpen, onToggleSave }: {
  pins: PinterestPin[];
  isSaved: (p: PinterestPin) => boolean;
  onOpen: (i: number) => void;
  onToggleSave: (p: PinterestPin) => void;
}) {
  return (
    <div className="columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4 2xl:columns-6">
      {pins.map((pin, i) => (
        <PinCard key={`${pin.id}_${i}`} pin={pin} saved={isSaved(pin)} onOpen={() => onOpen(i)} onToggleSave={() => onToggleSave(pin)} />
      ))}
    </div>
  );
}

// ─── Lightbox ────────────────────────────────────────────────────────────────

function Lightbox({ pins, index, onClose, onIndex, isSaved, onToggleSave }: {
  pins: PinterestPin[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
  isSaved: (p: PinterestPin) => boolean;
  onToggleSave: (p: PinterestPin) => void;
}) {
  const pin = pins[index];

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < pins.length - 1) onIndex(index + 1);
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [index, pins.length, onClose, onIndex]);

  if (!pin) return null;
  const saved = isSaved(pin);

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/85 p-0 backdrop-blur-xl sm:p-6" onClick={onClose}>
      <button onClick={onClose} className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close">
        <X className="h-5 w-5" />
      </button>
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }}
          className="absolute left-2 z-10 hidden h-12 w-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:grid"
          aria-label="Previous"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {index < pins.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }}
          className="absolute right-2 z-10 hidden h-12 w-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:grid"
          aria-label="Next"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <div
        className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-card sm:h-auto sm:max-h-[88vh] sm:flex-row sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
          <img src={pin.imageUrl} alt={pin.title ?? ""} className="max-h-[60vh] max-w-full object-contain sm:max-h-[88vh]" />
        </div>
        <div className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto p-5 sm:w-[340px] sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <a
              href={pin.pinUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
            <button
              onClick={() => onToggleSave(pin)}
              className={cn("rounded-full px-5 py-2.5 text-sm font-bold text-white", saved && "bg-black dark:bg-white dark:text-black")}
              style={saved ? undefined : { backgroundColor: RED }}
            >
              {saved ? "Saved" : "Save"}
            </button>
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold leading-snug text-foreground">{pin.title || "Inspiration"}</h2>
            {pin.description && pin.description !== pin.title && (
              <p className="mt-2 line-clamp-6 text-sm leading-relaxed text-muted-foreground">{pin.description}</p>
            )}
          </div>
          {(pin.pinnerName || pin.boardName) && (
            <div className="flex items-center gap-3">
              {pin.pinnerAvatar ? (
                <img src={pin.pinnerAvatar} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-sm font-semibold text-foreground">
                  {(pin.pinnerName || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{pin.pinnerName}</p>
                {pin.boardName && <p className="truncate text-xs text-muted-foreground">{pin.boardName}</p>}
              </div>
            </div>
          )}
          <div className="mt-auto grid grid-cols-2 gap-2 pt-2">
            <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs" onClick={() => { navigator.clipboard.writeText(pin.pinUrl); toast.success("Link copied"); }}>
              <LinkIcon className="h-3.5 w-3.5" /> Copy link
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs" onClick={() => window.open(pin.imageUrl, "_blank", "noopener")}>
              <Download className="h-3.5 w-3.5" /> Full size
            </Button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">{index + 1} of {pins.length}</p>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function PinterestPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState(DEFAULT_IDEAS[0]);
  const [tab, setTab] = useState<"explore" | "saved">("explore");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [addingIdea, setAddingIdea] = useState(false);
  const [ideaDraft, setIdeaDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Ideas and saved pins live on the server, per user
  const { value: ideas, save: saveIdeas } = useUserSetting<string[]>("pinterest-quick-tags", DEFAULT_IDEAS);
  const { value: savedPins, save: saveSavedPins } = useUserSetting<PinterestPin[]>("pinterest-saved-pins", NO_PINS);

  const results = useInfiniteQuery({
    queryKey: ["pinterest-search", query],
    queryFn: ({ pageParam }) => apiClient.pinterest.search(query, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore && last.bookmark ? last.bookmark : undefined),
    enabled: query.trim().length > 0,
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const pins = useMemo(() => {
    const out: PinterestPin[] = [];
    for (const p of results.data?.pages.flatMap((pg) => pg.pins) ?? []) if (!out.some((x) => samePin(x, p))) out.push(p);
    return out;
  }, [results.data]);
  const source = results.data?.pages[0]?.source ?? "pinterest";

  // Infinite scroll inside the scrolling content area
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || tab !== "explore") return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && results.hasNextPage && !results.isFetchingNextPage) results.fetchNextPage();
      },
      { root: scrollRef.current, rootMargin: "600px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [tab, results.hasNextPage, results.isFetchingNextPage, results.fetchNextPage]);

  const runSearch = (q: string) => {
    const t = q.trim();
    if (!t) return;
    setInput(t);
    setQuery(t);
    setTab("explore");
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const isSaved = (p: PinterestPin) => savedPins.some((s) => samePin(s, p));
  const toggleSave = (p: PinterestPin) => {
    const exists = isSaved(p);
    saveSavedPins(exists ? savedPins.filter((s) => !samePin(s, p)) : [p, ...savedPins]);
    toast.success(exists ? "Removed from saved" : "Saved");
  };

  const addIdea = () => {
    const t = ideaDraft.trim();
    setIdeaDraft("");
    setAddingIdea(false);
    if (t && !ideas.some((i) => i.toLowerCase() === t.toLowerCase())) saveIdeas([...ideas, t]);
  };

  const shown = tab === "saved" ? savedPins : pins;

  return (
    <div className="flex h-[calc(100dvh-48px)] flex-col overflow-hidden text-foreground lg:h-dvh">
      {/* Header — stays put */}
      <header className="shrink-0 space-y-3 border-b border-border/60 bg-background/70 px-4 pb-3 pt-3 backdrop-blur-md sm:px-6 sm:pt-4">
        <div className="flex items-center gap-3">
          <div className="hidden h-9 w-9 shrink-0 place-items-center rounded-full text-white sm:grid" style={{ backgroundColor: RED }}>
            <PinterestIcon className="h-5 w-5" />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runSearch(input);
            }}
            className="relative flex-1"
          >
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search for ideas"
              className="h-11 w-full rounded-full border border-transparent bg-muted pl-11 pr-10 text-base text-foreground placeholder:text-muted-foreground focus:border-[#E60023]/40 focus:outline-none focus:ring-4 focus:ring-[#E60023]/15 sm:text-sm"
            />
            {input && (
              <button type="button" onClick={() => setInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground" aria-label="Clear">
                <X className="h-4 w-4" />
              </button>
            )}
          </form>
          <div className="flex shrink-0 items-center rounded-full bg-muted p-1 text-xs font-semibold">
            {(["explore", "saved"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 transition sm:px-4",
                  tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "saved" && <Bookmark className="h-3.5 w-3.5" />}
                {t === "explore" ? "Explore" : <span className="hidden sm:inline">Saved</span>}
                {t === "saved" && savedPins.length > 0 && <span className="tabular-nums">{savedPins.length}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Ideas */}
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6">
          {ideas.map((idea) => (
            <span
              key={idea}
              className={cn(
                "group/idea flex shrink-0 items-center rounded-full text-xs font-medium transition",
                query === idea && tab === "explore" ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-muted/70"
              )}
            >
              <button onClick={() => runSearch(idea)} className="whitespace-nowrap py-1.5 pl-3.5 pr-2">{idea}</button>
              <button
                onClick={() => saveIdeas(ideas.filter((i) => i !== idea))}
                className="mr-1.5 rounded-full p-0.5 opacity-60 hover:opacity-100"
                title={`Remove "${idea}"`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {addingIdea ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addIdea();
              }}
              className="flex shrink-0 items-center gap-1 rounded-full border border-[#E60023]/40 px-2 py-0.5"
            >
              <input
                autoFocus
                value={ideaDraft}
                onChange={(e) => setIdeaDraft(e.target.value)}
                onBlur={addIdea}
                onKeyDown={(e) => e.key === "Escape" && (setIdeaDraft(""), setAddingIdea(false))}
                placeholder="New idea"
                maxLength={40}
                className="w-28 bg-transparent px-1 py-1 text-xs text-foreground focus:outline-none"
              />
              <button type="submit" className="rounded-full p-0.5 text-emerald-500"><Check className="h-3.5 w-3.5" /></button>
            </form>
          ) : (
            <button
              onClick={() => setAddingIdea(true)}
              className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-[#E60023]/50 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Add idea
            </button>
          )}
        </div>
      </header>

      {/* Only this area scrolls */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6">
        {tab === "explore" && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <h1 className="font-display text-lg font-semibold text-foreground sm:text-xl">{query}</h1>
              <a href={pinterestSearchUrl(query)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                <PinterestIcon className="h-3.5 w-3.5" /> See it on Pinterest <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {source !== "pinterest" && source !== "none" && pins.length > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Pinterest didn't answer our server just now, so these are similar photos from {SOURCE_NAME[source]}. Saving works the same.
                </span>
              </div>
            )}

            {results.isLoading ? (
              <div className="columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4 2xl:columns-6">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div key={i} className="mb-3 break-inside-avoid animate-pulse rounded-2xl bg-muted sm:mb-4" style={{ height: 160 + ((i * 47) % 140) }} />
                ))}
              </div>
            ) : results.isError ? (
              <div className="flex flex-col items-center gap-3 py-20 text-center">
                <p className="text-sm text-muted-foreground">Couldn't load ideas right now.</p>
                <Button variant="outline" size="sm" onClick={() => results.refetch()} className="gap-1.5 rounded-full">
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </Button>
              </div>
            ) : pins.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-20 text-center">
                <p className="text-sm text-muted-foreground">No ideas found for "{query}".</p>
                <a href={pinterestSearchUrl(query)} target="_blank" rel="noreferrer" className="rounded-full px-4 py-2 text-xs font-bold text-white" style={{ backgroundColor: RED }}>
                  Search on Pinterest
                </a>
              </div>
            ) : (
              <>
                <Masonry pins={pins} isSaved={isSaved} onOpen={setLightbox} onToggleSave={toggleSave} />
                <div ref={sentinelRef} className="flex justify-center py-6">
                  {results.isFetchingNextPage && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                  {!results.hasNextPage && pins.length > 0 && <p className="text-xs text-muted-foreground">That's everything for now.</p>}
                </div>
              </>
            )}
          </>
        )}

        {tab === "saved" &&
          (savedPins.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
                <Bookmark className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground">Nothing saved yet</h3>
              <p className="max-w-xs text-sm text-muted-foreground">Tap Save on any idea and it shows up here.</p>
              <Button onClick={() => setTab("explore")} className="mt-2 rounded-full text-white" style={{ backgroundColor: RED }}>
                Explore ideas
              </Button>
            </div>
          ) : (
            <>
              <h1 className="mb-3 px-1 font-display text-lg font-semibold text-foreground sm:text-xl">Saved ideas</h1>
              <Masonry pins={savedPins} isSaved={isSaved} onOpen={setLightbox} onToggleSave={toggleSave} />
            </>
          ))}
      </div>

      {lightbox !== null && (
        <Lightbox pins={shown} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} isSaved={isSaved} onToggleSave={toggleSave} />
      )}
    </div>
  );
}
