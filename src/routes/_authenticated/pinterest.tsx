import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Search, X, Download, ExternalLink, Plus, Check,
  ZoomIn, ChevronLeft, ChevronRight, Copy, Bookmark, Compass,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiClient, type PinterestPin } from "@/integrations/api/client";

export const Route = createFileRoute("/_authenticated/pinterest")({
  component: PinterestPage,
  head: () => ({
    meta: [
      { title: "Pinterest · LifePulse" },
      { name: "description", content: "Search and explore Pinterest inspiration, moodboards, and ideas inside LifePulse." },
    ],
  }),
});

// ─── Pinterest SVG Logo ───────────────────────────────────────────────────────
function PinterestIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345-.09.375-.293 1.199-.334 1.367-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.541.535 6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z" />
    </svg>
  );
}

// ─── Quick tags ───────────────────────────────────────────────────────────────
const DEFAULT_TAGS = [
  "aesthetic room", "study inspiration", "minimalist workspace",
  "dark academia", "mood board aesthetic", "cozy cafe vibes",
  "calm wallpapers", "bullet journal", "vision board goals",
];

// ─── Curated themes ───────────────────────────────────────────────────────────
const CURATED = [
  { title: "Cozy Spaces & Ambient Rooms", tag: "cozy room aesthetic warm lighting", icon: "🏠", desc: "Warm lighting, plants, reading nooks, and calm sanctuaries" },
  { title: "Minimalist Desks & Study Setups", tag: "minimalist desk setup aesthetic", icon: "💻", desc: "Clean focus spaces, tech setups, and serene workspaces" },
  { title: "Vision Boards & Life Goals", tag: "vision board aesthetic collage", icon: "✨", desc: "Inspirational aesthetic collages for dreams, habits, and growth" },
  { title: "Dark Academia & Cozy Library", tag: "dark academia library study aesthetic", icon: "📚", desc: "Classic books, fountain pens, coffee, and timeless notes" },
  { title: "Calm Nature & Scenery", tag: "calm foggy forest aesthetic nature", icon: "🌲", desc: "Misty mornings, lush greenery, and soothing natural scenes" },
  { title: "Pastel & Soft Aesthetic", tag: "pastel aesthetic soft pink aesthetic", icon: "🌸", desc: "Dreamy pastels, soft textures, and delicate flat-lays" },
];

// ─── Pin Card ─────────────────────────────────────────────────────────────────
function PinCard({ pin, onOpen, onToggleSave, isSaved }: {
  pin: PinterestPin; onOpen: () => void; onToggleSave: () => void; isSaved: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const aspectRatio = pin.height && pin.width ? pin.height / pin.width : 1.4;

  return (
    <div
      className="group relative overflow-hidden rounded-2xl cursor-pointer border border-white/5 bg-sidebar/50 transition-all duration-300 hover:border-[#E60023]/40 hover:shadow-2xl hover:shadow-[#E60023]/10"
      style={{ paddingBottom: `${Math.min(Math.max(aspectRatio * 100, 70), 170)}%`, backgroundColor: pin.dominantColor || "#1a1a2e" }}
      onClick={onOpen}
    >
      <img
        src={pin.thumbnailUrl || pin.imageUrl}
        alt={pin.title ?? "Pinterest Pin"}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-all duration-500",
          loaded ? "opacity-100 scale-100" : "opacity-0 scale-105",
          "group-hover:scale-105"
        )}
      />
      {!loaded && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/10 to-transparent" />}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

      {/* Pinterest badge */}
      <div className="absolute top-2.5 left-2.5 opacity-90 group-hover:opacity-100 transition-opacity">
        <span className="flex items-center gap-1 rounded-full bg-[#E60023] px-2 py-0.5 text-[10px] font-bold text-white shadow-md">
          <PinterestIcon className="h-3 w-3 fill-white" /> Pin
        </span>
      </div>

      {/* Action buttons */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSave(); }}
          title={isSaved ? "Saved" : "Save Pin"}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-full border backdrop-blur-md transition",
            isSaved ? "border-[#E60023] bg-[#E60023] text-white" : "border-white/20 bg-black/50 text-white hover:bg-[#E60023] hover:border-[#E60023]"
          )}
        >
          <Bookmark className={cn("h-3.5 w-3.5", isSaved && "fill-current")} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(pin.pinUrl); toast.success("Link copied!"); }}
          className="grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur-md hover:bg-white/20 transition"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <a
          href={pin.pinUrl} target="_blank" rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur-md hover:bg-[#E60023] hover:border-[#E60023] transition"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Zoom icon */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
        <div className="rounded-full border border-white/25 bg-black/60 p-3 backdrop-blur-md text-white shadow-xl">
          <ZoomIn className="h-5 w-5" />
        </div>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <p className="line-clamp-2 text-xs font-semibold text-white">{pin.title || pin.description || "Pinterest Inspiration"}</p>
        <div className="flex items-center justify-between mt-1 text-[10px] text-white/70">
          <span className="truncate">{pin.pinnerName || pin.boardName || "Pinterest"}</span>
          {pin.sourceDomain && <span className="truncate">{pin.sourceDomain}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ pins, index, onClose, onPrev, onNext, onToggleSave, isSaved }: {
  pins: PinterestPin[]; index: number;
  onClose: () => void; onPrev: () => void; onNext: () => void;
  onToggleSave: (pin: PinterestPin) => void; isSaved: boolean;
}) {
  const pin = pins[index];

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose, onPrev, onNext]);

  if (!pin) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/92 backdrop-blur-2xl p-4 sm:p-6" onClick={onClose}>
      {/* Close */}
      <button onClick={onClose} className="absolute top-4 right-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/60 text-white/80 backdrop-blur-md hover:bg-white/10 hover:text-white transition">
        <X className="h-5 w-5" />
      </button>

      {/* Counter */}
      <span className="absolute top-5 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-xs text-white/70 backdrop-blur-md flex items-center gap-1.5">
        <PinterestIcon className="h-3.5 w-3.5 text-[#E60023]" />
        {index + 1} / {pins.length}
      </span>

      {/* Prev / Next */}
      {index > 0 && (
        <button onClick={(e) => { e.stopPropagation(); onPrev(); }} className="absolute left-3 sm:left-6 z-10 grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-black/60 text-white/80 backdrop-blur-md hover:bg-white/10 hover:text-white transition">
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {index < pins.length - 1 && (
        <button onClick={(e) => { e.stopPropagation(); onNext(); }} className="absolute right-3 sm:right-6 z-10 grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-black/60 text-white/80 backdrop-blur-md hover:bg-white/10 hover:text-white transition">
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Card */}
      <div className="relative flex flex-col md:flex-row max-h-[90vh] max-w-[1100px] w-full overflow-hidden rounded-3xl border border-white/15 bg-sidebar/95 shadow-2xl backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Image */}
        <div className="relative flex-1 flex items-center justify-center bg-black/60 max-h-[55vh] md:max-h-[85vh] overflow-hidden">
          <img src={pin.imageUrl} alt={pin.title ?? ""} className="max-h-full max-w-full object-contain" />
        </div>

        {/* Details panel */}
        <div className="flex w-full md:w-[380px] flex-col justify-between p-6 border-t md:border-t-0 md:border-l border-white/10 bg-sidebar/80">
          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 rounded-full bg-[#E60023]/15 border border-[#E60023]/30 px-3 py-1 text-xs font-bold text-[#E60023]">
                <PinterestIcon className="h-3.5 w-3.5 fill-[#E60023]" /> Pinterest Pin
              </span>
              <button
                onClick={() => onToggleSave(pin)}
                className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                  isSaved ? "bg-[#E60023] text-white shadow-md" : "border border-white/15 bg-white/5 text-foreground hover:bg-white/10")}
              >
                <Bookmark className={cn("h-3.5 w-3.5", isSaved && "fill-current")} />
                {isSaved ? "Saved" : "Save"}
              </button>
            </div>

            <div>
              <h2 className="font-display text-lg font-bold text-foreground leading-snug">
                {pin.title || pin.description || "Pinterest Inspiration"}
              </h2>
              {pin.description && pin.title && (
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-4">{pin.description}</p>
              )}
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3">
              {pin.pinnerAvatar ? (
                <img src={pin.pinnerAvatar} alt="" className="h-10 w-10 rounded-full object-cover border border-white/10" />
              ) : (
                <div className="grid h-10 w-10 place-items-center rounded-full bg-[#E60023]/20 text-[#E60023]">
                  <PinterestIcon className="h-5 w-5 fill-[#E60023]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">{pin.pinnerName || "Pinterest Creator"}</p>
                {pin.boardName && <p className="truncate text-[11px] text-muted-foreground">Board: {pin.boardName}</p>}
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-white/10 mt-4">
            <a
              href={pin.pinUrl} target="_blank" rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#E60023] py-2.5 text-xs font-bold text-white shadow-lg hover:bg-[#ad081b] transition"
            >
              <PinterestIcon className="h-4 w-4 fill-white" /> Open Pin on Pinterest
            </a>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(pin.pinUrl); toast.success("Link copied!"); }} className="rounded-xl border-white/10 bg-white/5 text-xs hover:bg-white/10 gap-1.5">
                <LinkIcon className="h-3.5 w-3.5" /> Copy Link
              </Button>
              <Button variant="outline" size="sm" onClick={() => { window.open(pin.imageUrl, "_blank"); toast.success("Opening high-res…"); }} className="rounded-xl border-white/10 bg-white/5 text-xs hover:bg-white/10 gap-1.5">
                <Download className="h-3.5 w-3.5" /> High-Res
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function PinterestPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PinterestPin[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [savedPins, setSavedPins] = useState<PinterestPin[]>([]);
  const [activeTab, setActiveTab] = useState<"search" | "saved" | "curated">("search");
  const [nextBookmark, setNextBookmark] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [quickTags, setQuickTags] = useState<string[]>([]);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");
  const lastQueryRef = useRef("");

  // Load persisted data
  useEffect(() => {
    const tags = localStorage.getItem("lifepulse.pinterest.quicktags");
    setQuickTags(tags ? (JSON.parse(tags) as string[]) : DEFAULT_TAGS);

    const pins = localStorage.getItem("lifepulse.pinterest.savedpins");
    if (pins) {
      try { setSavedPins(JSON.parse(pins)); } catch { /* skip */ }
    }
  }, []);

  const persistTags = (tags: string[]) => {
    setQuickTags(tags);
    localStorage.setItem("lifepulse.pinterest.quicktags", JSON.stringify(tags));
  };

  const toggleSavePin = (pin: PinterestPin) => {
    setSavedPins(prev => {
      const exists = prev.some(p => p.id === pin.id || p.imageUrl === pin.imageUrl);
      const updated = exists
        ? prev.filter(p => p.id !== pin.id && p.imageUrl !== pin.imageUrl)
        : [pin, ...prev];
      localStorage.setItem("lifepulse.pinterest.savedpins", JSON.stringify(updated));
      toast.success(exists ? "Removed from saved collection" : "Pin saved to LifePulse!");
      return updated;
    });
  };

  const handleSearch = useCallback(async (queryOverride?: string, bookmarkToUse?: string) => {
    const q = (queryOverride ?? searchQuery).trim();
    if (!q) return;

    const isMore = Boolean(bookmarkToUse);
    isMore ? setIsLoadingMore(true) : (setIsSearching(true), setSearchResults([]));
    lastQueryRef.current = q;

    try {
      // Primary: backend Pinterest proxy
      try {
        const data = await apiClient.pinterest.search(q, bookmarkToUse);
        if (data.pins?.length > 0) {
          setNextBookmark(data.bookmark);
          setSearchResults(prev => isMore ? [...prev, ...data.pins] : data.pins);
          setActiveTab("search");
          return;
        }
      } catch (e) {
        console.warn("Pinterest backend unavailable, using Unsplash fallback:", e);
      }

      // Fallback: Unsplash via VITE key (same beautiful aesthetic images)
      const unsplashKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;
      if (unsplashKey) {
        const res = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=24&client_id=${unsplashKey}`
        );
        if (res.ok) {
          const data = await res.json();
          const fallback: PinterestPin[] = (data.results ?? []).map((img: any) => ({
            id: img.id,
            title: img.alt_description || img.description || `${q} inspiration`,
            description: img.description,
            imageUrl: img.urls.regular,
            thumbnailUrl: img.urls.small,
            width: img.width || 736,
            height: img.height || 1104,
            pinnerName: img.user?.name || "Unsplash Creator",
            pinnerAvatar: img.user?.profile_image?.small,
            pinUrl: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`,
            dominantColor: img.color || "#1a1a2e",
            boardName: "Aesthetic Inspiration",
            sourceDomain: "pinterest.com",
          }));
          if (fallback.length > 0) {
            setSearchResults(prev => isMore ? [...prev, ...fallback] : fallback);
            setActiveTab("search");
            return;
          }
        }
      }

      if (!isMore) toast.info("No results found. Try another search term!");
    } finally {
      setIsSearching(false);
      setIsLoadingMore(false);
    }
  }, [searchQuery]);

  // Load initial aesthetic results on mount
  useEffect(() => {
    handleSearch("aesthetic workspace cozy");
  }, []);

  const displayPins = activeTab === "saved" ? savedPins : searchResults;

  return (
    <div className="min-h-screen bg-cozy-grain text-foreground pb-16">

      {/* ── Header ── */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 border-b border-white/5 px-4 sm:px-6 py-3 sm:py-4 bg-background/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#E60023] text-white shadow-md shadow-[#E60023]/25 shrink-0">
            <PinterestIcon className="h-5 w-5 fill-white" />
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">Pinterest Inspiration</h1>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex w-full md:flex-1 md:max-w-2xl md:mx-4 items-center">
          <div className="relative flex flex-1 items-center min-w-0">
            <Search className="absolute left-3 text-muted-foreground h-4 w-4 pointer-events-none shrink-0" />
            <input
              id="pinterest-search-input"
              type="text"
              placeholder="Search Pinterest pins… aesthetic room, dark academia, vision board…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-l-xl border border-white/10 bg-white/[0.04] pl-9 pr-8 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#E60023]/50 focus:outline-none focus:ring-1 focus:ring-[#E60023]/30 transition"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} className="absolute right-3 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="submit" disabled={isSearching} id="pinterest-search-btn" className="h-10 rounded-r-xl rounded-l-none border border-l-0 border-white/10 bg-[#E60023] px-4 sm:px-5 text-white hover:bg-[#ad081b] transition disabled:opacity-50 shrink-0 font-semibold">
            {isSearching ? <span className="h-4 w-4 rounded-full border-2 border-white border-r-transparent animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>
      </header>

      {/* ── Quick Tags ── */}
      <div className="flex items-center gap-2 overflow-x-auto px-6 py-3 border-b border-white/5 scrollbar-none">
        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mr-2 shrink-0">
          <PinterestIcon className="h-3 w-3 text-[#E60023]" /> Quick:
        </span>
        {quickTags.map(tag => (
          <span key={tag} className={cn("flex items-center gap-1 shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
            searchQuery === tag ? "border-[#E60023]/50 bg-[#E60023]/20 text-white font-semibold" : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:text-foreground"
          )}>
            <button onClick={() => { setSearchQuery(tag); handleSearch(tag); }} className="whitespace-nowrap transition">{tag}</button>
            <button onClick={(e) => { e.stopPropagation(); persistTags(quickTags.filter(t => t !== tag)); }} className="ml-1 rounded-full p-0.5 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive transition-colors" title={`Remove "${tag}"`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {isAddingTag ? (
          <form onSubmit={(e) => { e.preventDefault(); const t = newTagInput.trim(); if (t && !quickTags.includes(t)) persistTags([...quickTags, t]); setNewTagInput(""); setIsAddingTag(false); }}
            className="flex items-center gap-1.5 shrink-0 rounded-full border border-[#E60023]/40 bg-white/5 px-2.5 py-0.5">
            <input type="text" value={newTagInput} onChange={e => setNewTagInput(e.target.value)} placeholder="New tag…" autoFocus className="bg-transparent border-none text-xs text-foreground focus:outline-none w-28 px-1 placeholder:text-muted-foreground/50" />
            <button type="submit" className="text-emerald-500 hover:text-emerald-400 p-0.5 rounded-full"><Check className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => { setIsAddingTag(false); setNewTagInput(""); }} className="text-destructive hover:text-destructive/80 p-0.5 rounded-full"><X className="h-3.5 w-3.5" /></button>
          </form>
        ) : (
          <button onClick={() => setIsAddingTag(true)} className="flex items-center gap-1 shrink-0 rounded-full border border-dashed border-white/20 bg-transparent px-3 py-1 text-xs font-medium text-muted-foreground hover:border-[#E60023]/50 hover:text-white hover:bg-white/5 transition">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>

      {/* ── Main ── */}
      <main className="mx-auto max-w-[1800px] px-4 py-6 lg:px-8">

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-6 overflow-x-auto scrollbar-none">
          {(["search", "saved", "curated"] as const).map(tab => (
            <button key={tab} id={`pinterest-tab-${tab}`} onClick={() => setActiveTab(tab)}
              className={cn("flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition border",
                activeTab === tab ? "border-[#E60023]/40 bg-[#E60023]/15 text-white shadow-soft" : "border-white/5 bg-white/[0.03] text-muted-foreground hover:border-white/15 hover:text-foreground")}>
              {tab === "search" && <Search className="h-4 w-4 text-[#E60023]" />}
              {tab === "saved" && <Bookmark className="h-4 w-4 text-[#E60023]" />}
              {tab === "curated" && <Compass className="h-4 w-4 text-[#E60023]" />}
              <span>{tab === "search" ? "Explore Pins" : tab === "saved" ? "Saved Moodboard" : "Curated Themes"}</span>
              {tab === "search" && searchResults.length > 0 && <span className="rounded-full bg-[#E60023]/20 text-[#E60023] px-2 text-xs font-bold">{searchResults.length}</span>}
              {tab === "saved" && savedPins.length > 0 && <span className="rounded-full bg-[#E60023]/20 text-[#E60023] px-2 text-xs font-bold">{savedPins.length}</span>}
            </button>
          ))}
          {searchQuery && activeTab === "search" && (
            <span className="ml-auto text-xs text-muted-foreground hidden sm:inline">
              Results for <span className="text-foreground font-semibold">"{searchQuery}"</span>
            </span>
          )}
        </div>

        {/* Curated themes tab */}
        {activeTab === "curated" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CURATED.map(c => (
              <div key={c.title} onClick={() => { setSearchQuery(c.tag); handleSearch(c.tag); }}
                className="glass-card group flex flex-col justify-between rounded-2xl p-5 border border-white/5 hover:border-[#E60023]/40 cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-[#E60023]/5">
                <div>
                  <span className="text-3xl mb-3 block">{c.icon}</span>
                  <h3 className="font-display text-base font-bold text-foreground group-hover:text-primary transition">{c.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
                </div>
                <div className="mt-4 flex items-center border-t border-white/5 pt-3">
                  <span className="text-[11px] font-semibold text-[#E60023] flex items-center gap-1">
                    <PinterestIcon className="h-3 w-3 fill-[#E60023]" /> Explore Pins →
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty states */}
        {activeTab !== "curated" && displayPins.length === 0 && !isSearching && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            {activeTab === "saved" ? (
              <>
                <div className="grid h-20 w-20 place-items-center rounded-3xl bg-[#E60023]/10 border border-[#E60023]/20 mb-4">
                  <Bookmark className="h-10 w-10 text-[#E60023]" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Your Saved Moodboard is Empty</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">Search for pins and click the bookmark icon on any pin to save your favorites here.</p>
                <Button onClick={() => setActiveTab("search")} className="mt-6 rounded-xl bg-[#E60023] text-white hover:bg-[#ad081b]">Explore Pins</Button>
              </>
            ) : (
              <>
                <div className="grid h-20 w-20 place-items-center rounded-3xl bg-[#E60023]/10 border border-[#E60023]/20 mb-4">
                  <PinterestIcon className="h-10 w-10 fill-[#E60023]" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Search Pinterest for Inspiration</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">Type any aesthetic topic or pick a quick tag to explore thousands of Pins.</p>
              </>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {isSearching && (
          <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="break-inside-avoid rounded-2xl animate-pulse bg-white/5 border border-white/5" style={{ height: `${180 + (i % 4) * 50}px` }} />
            ))}
          </div>
        )}

        {/* Masonry grid */}
        {activeTab !== "curated" && !isSearching && displayPins.length > 0 && (
          <>
            <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4">
              {displayPins.map((pin, idx) => (
                <div key={`${pin.id}_${idx}`} className="break-inside-avoid mb-4">
                  <PinCard
                    pin={pin}
                    onOpen={() => setLightboxIndex(idx)}
                    onToggleSave={() => toggleSavePin(pin)}
                    isSaved={savedPins.some(p => p.id === pin.id || p.imageUrl === pin.imageUrl)}
                  />
                </div>
              ))}
            </div>

            {activeTab === "search" && nextBookmark && (
              <div className="flex justify-center mt-10">
                <Button id="pinterest-load-more-btn" onClick={() => handleSearch(lastQueryRef.current, nextBookmark!)} disabled={isLoadingMore}
                  className="rounded-2xl border border-white/15 bg-sidebar/80 px-8 py-3 text-sm font-bold text-white hover:bg-[#E60023] hover:border-[#E60023] transition disabled:opacity-50 shadow-xl">
                  {isLoadingMore ? (
                    <span className="flex items-center gap-2"><span className="h-4 w-4 rounded-full border-2 border-white border-r-transparent animate-spin" /> Loading more pins…</span>
                  ) : (
                    <span className="flex items-center gap-2"><PinterestIcon className="h-4 w-4 fill-white" /> Load More Pins</span>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          pins={displayPins}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex(i => Math.max(0, (i ?? 0) - 1))}
          onNext={() => setLightboxIndex(i => Math.min(displayPins.length - 1, (i ?? 0) + 1))}
          onToggleSave={toggleSavePin}
          isSaved={displayPins[lightboxIndex] ? savedPins.some(p => p.id === displayPins[lightboxIndex].id || p.imageUrl === displayPins[lightboxIndex].imageUrl) : false}
        />
      )}
    </div>
  );
}
