import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Bookmark, BookOpen, Check, ChevronLeft, ChevronRight, ExternalLink, List, Loader2, Minus,
  Pencil, Plus, Search, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient, type GutenbergBook } from "@/integrations/api/client";
import {
  fromGutenberg, useReaderPrefs, useReadingProgress, useShelves,
  type ReaderPrefs, type SavedBook,
} from "@/hooks/use-books";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

export const Route = createFileRoute("/_authenticated/books")({
  component: BooksPage,
  head: () => ({ meta: [{ title: "Books · LifePulse" }] }),
});

// ─── Rows ────────────────────────────────────────────────────────────────────

/** Hand-picked free classics (Project Gutenberg ids) — shows instantly, no catalogue call needed. */
type Pick = [id: number, title: string, author: string];
const CURATED: { id: string; title: string; subtitle: string; books: Pick[] }[] = [
  {
    id: "growth",
    title: "Self-improvement classics",
    subtitle: "Timeless advice on habits, character and living well",
    books: [
      [2680, "Meditations", "Marcus Aurelius"],
      [4507, "As a Man Thinketh", "James Allen"],
      [2274, "How to Live on 24 Hours a Day", "Arnold Bennett"],
      [45109, "The Enchiridion", "Epictetus"],
      [148, "The Autobiography of Benjamin Franklin", "Benjamin Franklin"],
      [2944, "Essays (incl. Self-Reliance)", "Ralph Waldo Emerson"],
      [935, "Self-Help", "Samuel Smiles"],
      [205, "Walden", "Henry David Thoreau"],
      [34258, "Acres of Diamonds", "Russell H. Conwell"],
      [8581, "The Art of Money Getting", "P. T. Barnum"],
      [43855, "The Way to Wealth", "Benjamin Franklin"],
      [216, "Tao Te Ching", "Lao Tzu"],
    ],
  },
  {
    id: "psychology",
    title: "Psychology & human nature",
    subtitle: "How people think, follow and change",
    books: [
      [24518, "Extraordinary Popular Delusions and the Madness of Crowds", "Charles Mackay"],
      [445, "The Crowd", "Gustave Le Bon"],
      [621, "The Varieties of Religious Experience", "William James"],
      [16287, "Talks to Teachers on Psychology", "William James"],
      [15489, "Dream Psychology", "Sigmund Freud"],
      [3351, "Letters to His Son", "Lord Chesterfield"],
    ],
  },
  {
    id: "philosophy",
    title: "Philosophy",
    subtitle: "Stoics, ancients and the big questions",
    books: [
      [1497, "The Republic", "Plato"],
      [1232, "The Prince", "Niccolò Machiavelli"],
      [4363, "Beyond Good and Evil", "Friedrich Nietzsche"],
      [1998, "Thus Spake Zarathustra", "Friedrich Nietzsche"],
      [13726, "Apology, Crito and Phaedo", "Plato"],
      [3330, "The Analects", "Confucius"],
      [34901, "On Liberty", "John Stuart Mill"],
      [3207, "Leviathan", "Thomas Hobbes"],
      [575, "Essays", "Francis Bacon"],
    ],
  },
  {
    id: "strategy",
    title: "Strategy, money & work",
    subtitle: "Classic thinking on winning, wealth and work",
    books: [
      [132, "The Art of War", "Sun Tzu"],
      [3300, "The Wealth of Nations", "Adam Smith"],
      [833, "The Theory of the Leisure Class", "Thorstein Veblen"],
      [6435, "The Principles of Scientific Management", "Frederick W. Taylor"],
    ],
  },
  {
    id: "stories",
    title: "Great stories",
    subtitle: "Novels everyone should read once",
    books: [
      [1342, "Pride and Prejudice", "Jane Austen"],
      [2554, "Crime and Punishment", "Fyodor Dostoyevsky"],
      [1184, "The Count of Monte Cristo", "Alexandre Dumas"],
      [1260, "Jane Eyre", "Charlotte Brontë"],
      [174, "The Picture of Dorian Gray", "Oscar Wilde"],
      [2500, "Siddhartha", "Hermann Hesse"],
      [84, "Frankenstein", "Mary Shelley"],
      [2701, "Moby Dick", "Herman Melville"],
      [1661, "The Adventures of Sherlock Holmes", "Arthur Conan Doyle"],
      [345, "Dracula", "Bram Stoker"],
      [11, "Alice's Adventures in Wonderland", "Lewis Carroll"],
      [1513, "Romeo and Juliet", "William Shakespeare"],
    ],
  },
];

const pickToBook = ([id, title, author]: Pick): SavedBook => ({
  id: `gb:${id}`,
  title,
  author,
  cover: null,
  source: "gutenberg",
  gutenbergId: id,
});

/** Modern books from Open Library — borrowed and read on their site (free account). */
const MODERN_ROWS: { id: string; title: string; subject: string }[] = [
  { id: "ol-self-help", title: "Modern self-help", subject: "self-help" },
  { id: "ol-productivity", title: "Productivity & focus", subject: "time_management" },
  { id: "ol-success", title: "Success & leadership", subject: "success" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setInView(true), { rootMargin: "300px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView]);
  return { ref, inView };
}

function hueFor(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** A clean typographic cover (real covers from Gutenberg don't load reliably everywhere). */
function Cover({ book, className }: { book: SavedBook; className?: string }) {
  const [failed, setFailed] = useState(false);
  const hue = hueFor(book.title + book.author);
  if (book.cover && !failed) {
    return (
      <div className={cn("relative aspect-[2/3] overflow-hidden rounded-md shadow-md ring-1 ring-black/10", className)}>
        <img src={book.cover} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className={cn("relative flex aspect-[2/3] flex-col overflow-hidden rounded-md p-[9%] text-center shadow-[0_6px_18px_-6px_rgba(0,0,0,.5)]", className)}
      style={{ background: `linear-gradient(155deg, oklch(0.42 0.09 ${hue}), oklch(0.27 0.06 ${(hue + 25) % 360}))` }}
    >
      {/* spine shading */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/35 to-transparent" />
      <div className="pointer-events-none absolute inset-[5%] rounded-sm border border-white/25" />
      <div className="relative flex flex-1 flex-col items-center justify-center gap-2">
        <span className="h-px w-1/3 bg-white/40" />
        <p className="line-clamp-5 font-serif text-[0.8rem] font-semibold leading-snug text-white sm:text-sm" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
          {book.title}
        </p>
        <span className="h-px w-1/3 bg-white/40" />
      </div>
      <p className="relative line-clamp-2 text-[9px] font-medium uppercase tracking-[0.14em] text-white/75">{book.author}</p>
    </div>
  );
}

function BookCard({ book, badge, progress, onOpen }: { book: SavedBook; badge?: ReactNode; progress?: number; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="group w-32 shrink-0 snap-start text-left sm:w-36">
      <div className="relative transition duration-300 group-hover:-translate-y-1">
        <Cover book={book} />
        {badge && <div className="absolute left-1.5 top-1.5">{badge}</div>}
        {progress !== undefined && (
          <div className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-black/40">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-xs font-medium leading-snug text-foreground">{book.title}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{book.author}</p>
    </button>
  );
}

function Scroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const by = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <div className="group/row relative">
      <div ref={ref} className="flex snap-x gap-4 overflow-x-auto pb-2 scrollbar-none">{children}</div>
      <button onClick={() => by(-1)} className="absolute left-1 top-[30%] hidden h-9 w-9 place-items-center rounded-full border border-border bg-card shadow-lg group-hover/row:grid" aria-label="Scroll left">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button onClick={() => by(1)} className="absolute right-1 top-[30%] hidden h-9 w-9 place-items-center rounded-full border border-border bg-card shadow-lg group-hover/row:grid" aria-label="Scroll right">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="w-32 shrink-0 sm:w-36">
          <div className="aspect-[2/3] animate-pulse rounded-lg bg-muted" />
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function RowHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 className="truncate font-display text-lg font-semibold text-foreground sm:text-xl">{title}</h2>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const FreeBadge = () => <span className="rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Free</span>;
const BorrowBadge = () => <span className="rounded-md bg-sky-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Borrow</span>;

// ─── Discover rows ───────────────────────────────────────────────────────────

function CuratedRow({ row, onOpen }: { row: (typeof CURATED)[number]; onOpen: (b: SavedBook) => void }) {
  const { progress } = useReadingProgress();
  return (
    <section>
      <RowHeader title={row.title} subtitle={row.subtitle} />
      <Scroller>
        {row.books.map((p) => {
          const b = pickToBook(p);
          return <BookCard key={b.id} book={b} badge={<FreeBadge />} progress={progress[b.id]?.percent} onOpen={() => onOpen(b)} />;
        })}
      </Scroller>
    </section>
  );
}

type OLWork = { key: string; title: string; authors?: { name: string }[]; cover_id?: number | null };

function ModernRow({ row, onOpen }: { row: (typeof MODERN_ROWS)[number]; onOpen: (b: SavedBook) => void }) {
  const { ref, inView } = useInView<HTMLElement>();
  const q = useQuery({
    queryKey: ["books-ol", row.subject],
    queryFn: async () => {
      const res = await fetch(`https://openlibrary.org/subjects/${row.subject}.json?limit=18&ebooks=true`);
      if (!res.ok) throw new Error("Open Library didn't respond");
      const data = await res.json();
      return (data.works ?? []) as OLWork[];
    },
    enabled: inView,
    staleTime: 1000 * 60 * 60 * 6,
    refetchOnWindowFocus: false,
  });
  const books: SavedBook[] = (q.data ?? []).map((w) => ({
    id: `ol:${w.key}`,
    title: w.title,
    author: w.authors?.[0]?.name ?? "Unknown author",
    cover: w.cover_id ? `https://covers.openlibrary.org/b/id/${w.cover_id}-M.jpg` : null,
    source: "openlibrary",
    url: `https://openlibrary.org${w.key}`,
  }));

  return (
    <section ref={ref}>
      <RowHeader title={row.title} subtitle="Borrow free on Open Library with a free account" />
      {!inView || q.isLoading ? (
        <RowSkeleton />
      ) : q.isError || books.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">Couldn't load these right now.</p>
      ) : (
        <Scroller>
          {books.map((b) => (
            <BookCard key={b.id} book={b} badge={<BorrowBadge />} onOpen={() => onOpen(b)} />
          ))}
        </Scroller>
      )}
    </section>
  );
}

function SearchResults({ query, onOpen }: { query: string; onOpen: (b: SavedBook, extra?: GutenbergBook) => void }) {
  const q = useInfiniteQuery({
    queryKey: ["books-search", query],
    queryFn: ({ pageParam }) => apiClient.books.search({ q: query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next_page ?? undefined,
    staleTime: 1000 * 60 * 30,
  });
  const books = useMemo(() => (q.data?.pages ?? []).flatMap((p) => p.books).filter((b) => b.has_text), [q.data]);

  return (
    <section>
      <RowHeader title={`Free books for "${query}"`} subtitle={q.data ? `${q.data.pages[0]?.count ?? 0} matches in the Project Gutenberg library` : undefined} />
      {q.isLoading ? (
        <RowSkeleton />
      ) : q.isError ? (
        <p className="text-sm text-muted-foreground">Search failed. Try again in a moment.</p>
      ) : books.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          No free copies found. Newer books usually aren't free.{" "}
          <a href={`https://openlibrary.org/search?q=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
            Search Open Library
          </a>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {books.map((b) => (
              <div key={b.id} className="[&>button]:w-full">
                <BookCard book={fromGutenberg(b)} badge={<FreeBadge />} onOpen={() => onOpen(fromGutenberg(b), b)} />
              </div>
            ))}
          </div>
          {q.hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} className="gap-1.5 rounded-full">
                {q.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />} Load more
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ─── Book details & shelves picker ───────────────────────────────────────────

function ShelfPicker({ book }: { book: SavedBook }) {
  const shelves = useShelves();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const on = shelves.shelvesWith(book.id);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-foreground">Save to a shelf</p>
      <div className="flex flex-wrap gap-1.5">
        {shelves.shelves.map((s) => {
          const active = on.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => {
                shelves.toggle(s.id, book);
                toast.success(active ? `Removed from ${s.name}` : `Saved to ${s.name}`);
              }}
              className={cn(
                "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition",
                active ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {active && <Check className="h-3 w-3 text-primary" />} {s.name}
            </button>
          );
        })}
        {adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = name.trim();
              if (!n) return;
              shelves.create(n, book);
              toast.success(`Saved to ${n}`);
              setName("");
              setAdding(false);
            }}
            className="flex items-center gap-1 rounded-full border border-primary/40 px-2 py-0.5"
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Shelf name" className="w-28 bg-transparent px-1 py-1 text-xs text-foreground focus:outline-none" />
            <button type="submit" className="rounded-full p-0.5 text-primary"><Check className="h-3.5 w-3.5" /></button>
          </form>
        ) : (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Plus className="h-3 w-3" /> New shelf
          </button>
        )}
      </div>
    </div>
  );
}

function BookDialog({ book, extra, onClose, onRead }: { book: SavedBook | null; extra?: GutenbergBook; onClose: () => void; onRead: (b: SavedBook) => void }) {
  const { progress } = useReadingProgress();
  if (!book) return null;
  const p = progress[book.id];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl sm:max-w-xl sm:p-6">
        <DialogHeader className="sr-only">
          <DialogTitle>{book.title}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-4 sm:gap-5">
          <Cover book={book} className="w-28 shrink-0 sm:w-36" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold leading-snug text-foreground sm:text-xl">{book.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{book.author}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {book.source === "gutenberg" ? <FreeBadge /> : <BorrowBadge />}
              {extra?.downloads ? <span className="text-[11px] text-muted-foreground">{extra.downloads.toLocaleString()} readers this month</span> : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {book.source === "gutenberg" ? (
                <Button onClick={() => onRead(book)} className="gap-1.5 rounded-full">
                  <BookOpen className="h-4 w-4" /> {p ? `Continue · ${Math.round(p.percent * 100)}%` : "Read now"}
                </Button>
              ) : (
                <a href={book.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                  Borrow on Open Library <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
        {extra?.summary && <p className="mt-5 line-clamp-[8] text-sm leading-relaxed text-muted-foreground">{extra.summary}</p>}
        {extra?.subjects?.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {extra.subjects.map((s) => (
              <span key={s} className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">{s}</span>
            ))}
          </div>
        ) : null}
        <div className="mt-5 border-t border-border pt-4">
          <ShelfPicker book={book} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Shelves tab ─────────────────────────────────────────────────────────────

function ShelvesTab({ onOpen }: { onOpen: (b: SavedBook) => void }) {
  const shelves = useShelves();
  const { progress } = useReadingProgress();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  return (
    <div className="space-y-10">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = newName.trim();
          if (!n) return;
          shelves.create(n);
          setNewName("");
          toast.success(`Created ${n}`);
        }}
        className="flex max-w-md gap-2"
      >
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New shelf, e.g. Summer reading" maxLength={40} className="h-10" />
        <Button type="submit" disabled={!newName.trim()} className="h-10 gap-1.5 rounded-xl">
          <Plus className="h-4 w-4" /> Create
        </Button>
      </form>

      {shelves.shelves.map((s) => (
        <section key={s.id}>
          <div className="mb-3 flex items-center gap-2">
            {renaming === s.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) shelves.rename(s.id, draft.trim());
                  setRenaming(null);
                }}
                className="flex items-center gap-2"
              >
                <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={40} className="h-9 w-56" />
                <Button type="submit" size="sm" className="h-9 rounded-xl">Save</Button>
              </form>
            ) : (
              <>
                <h2 className="font-display text-lg font-semibold text-foreground sm:text-xl">{s.name}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{s.books.length}</span>
                <button onClick={() => { setRenaming(s.id); setDraft(s.name); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Rename">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setDeleting(s.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete shelf">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
          {s.books.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
              Empty. Open any book and tap a shelf name to save it here.
            </p>
          ) : (
            <Scroller>
              {s.books.map((b) => (
                <BookCard
                  key={b.id}
                  book={b}
                  badge={b.source === "gutenberg" ? <FreeBadge /> : <BorrowBadge />}
                  progress={progress[b.id]?.percent}
                  onOpen={() => onOpen(b)}
                />
              ))}
            </Scroller>
          )}
        </section>
      ))}

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this shelf?"
        description="The shelf is removed. The books stay available in Discover."
        confirmLabel="Delete shelf"
        onConfirm={() => {
          if (deleting) shelves.remove(deleting);
          setDeleting(null);
        }}
      />
    </div>
  );
}

// ─── Reader ──────────────────────────────────────────────────────────────────

type Block = { kind: "heading" | "para" | "verse"; text: string };

/** Turn Gutenberg's hard-wrapped plain text into headings and paragraphs. */
function toBlocks(text: string): Block[] {
  return text
    .split(/\n\s*\n/)
    .map((raw) => raw.replace(/\s+$/g, ""))
    .filter((raw) => raw.trim().length > 0)
    .map((raw) => {
      const lines = raw.split("\n");
      const flat = lines.map((l) => l.trim()).join(" ").replace(/\s+/g, " ").replace(/_([^_]+)_/g, "$1");
      const isHeading =
        flat.length < 70 && (/^(chapter|book|part|section|letter|canto)\b/i.test(flat) || (flat === flat.toUpperCase() && /[A-Z]/.test(flat) && lines.length <= 2));
      if (isHeading) return { kind: "heading" as const, text: flat };
      const avg = lines.reduce((a, l) => a + l.trim().length, 0) / lines.length;
      if (lines.length > 1 && avg < 48) return { kind: "verse" as const, text: lines.map((l) => l.trim()).join("\n") };
      return { kind: "para" as const, text: flat };
    });
}

const THEMES: Record<ReaderPrefs["theme"], { bg: string; fg: string; muted: string; bar: string; label: string }> = {
  dark: { bg: "#141414", fg: "#dedad2", muted: "#8a8780", bar: "#1d1d1d", label: "Dark" },
  sepia: { bg: "#f4ecd8", fg: "#3b2f1e", muted: "#8a7a5e", bar: "#ebe1c8", label: "Sepia" },
  light: { bg: "#ffffff", fg: "#1c1c1c", muted: "#777777", bar: "#f3f3f3", label: "Light" },
};

function Reader({ book, onClose }: { book: SavedBook; onClose: () => void }) {
  const { progress, set } = useReadingProgress();
  const { prefs, save: savePrefs } = useReaderPrefs();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [percent, setPercent] = useState(progress[book.id]?.percent ?? 0);
  const [showContents, setShowContents] = useState(false);
  const restored = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const latest = useRef(percent);
  const setRef = useRef(set);
  setRef.current = set;

  const text = useQuery({
    queryKey: ["book-text", book.gutenbergId],
    queryFn: () => apiClient.books.text(book.gutenbergId!),
    enabled: !!book.gutenbergId,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
    retry: 1,
  });
  const blocks = useMemo(() => (text.data ? toBlocks(text.data.text) : []), [text.data]);
  const headings = useMemo(() => blocks.map((b, i) => ({ ...b, i })).filter((b) => b.kind === "heading").slice(0, 300), [blocks]);
  const t = THEMES[prefs.theme];

  // Back to where you stopped
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || restored.current || blocks.length === 0) return;
    restored.current = true;
    const start = progress[book.id]?.percent ?? 0;
    requestAnimationFrame(() => {
      el.scrollTop = start * (el.scrollHeight - el.clientHeight);
    });
  }, [blocks.length, book.id, progress]);

  // Save progress on close
  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (restored.current) setRef.current(book, latest.current);
    };
  }, [book]);

  // Esc closes, keep the page behind from scrolling
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || !restored.current) return;
    const p = el.scrollHeight - el.clientHeight > 0 ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0;
    latest.current = p;
    setPercent(p);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => setRef.current(book, latest.current), 2000);
  };

  const jumpTo = (i: number) => {
    document.getElementById(`blk-${i}`)?.scrollIntoView({ block: "start" });
    setShowContents(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: t.bg, color: t.fg }}>
      <header className="flex shrink-0 items-center gap-2 px-3 py-2 sm:px-5" style={{ background: t.bar }}>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:opacity-70" aria-label="Close book">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{book.title}</p>
          <p className="truncate text-[11px]" style={{ color: t.muted }}>{book.author} · {Math.round(percent * 100)}%</p>
        </div>
        {headings.length > 1 && (
          <button onClick={() => setShowContents((v) => !v)} className="grid h-9 w-9 place-items-center rounded-full hover:opacity-70" title="Contents">
            <List className="h-5 w-5" />
          </button>
        )}
        <div className="flex items-center rounded-full border px-1" style={{ borderColor: t.muted + "55" }}>
          <button onClick={() => savePrefs({ ...prefs, fontSize: Math.max(14, prefs.fontSize - 1) })} className="grid h-8 w-8 place-items-center" title="Smaller text">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-6 text-center text-xs">{prefs.fontSize}</span>
          <button onClick={() => savePrefs({ ...prefs, fontSize: Math.min(28, prefs.fontSize + 1) })} className="grid h-8 w-8 place-items-center" title="Bigger text">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="hidden items-center gap-1 sm:flex">
          {(Object.keys(THEMES) as ReaderPrefs["theme"][]).map((k) => (
            <button
              key={k}
              onClick={() => savePrefs({ ...prefs, theme: k })}
              title={THEMES[k].label}
              className={cn("h-7 w-7 rounded-full border-2", prefs.theme === k ? "border-emerald-500" : "border-transparent")}
              style={{ background: THEMES[k].bg, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)" }}
            />
          ))}
        </div>
      </header>
      <div className="h-0.5 shrink-0" style={{ background: t.muted + "33" }}>
        <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${percent * 100}%` }} />
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain">
          {text.isLoading ? (
            <div className="grid h-full place-items-center text-sm" style={{ color: t.muted }}>
              <span className="flex flex-col items-center gap-2 text-center"><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Opening the book…</span><span className="text-xs opacity-70">The first time can take a few seconds.</span></span>
            </div>
          ) : text.isError ? (
            <div className="mx-auto max-w-md px-6 py-24 text-center text-sm" style={{ color: t.muted }}>
              <p>This book couldn't be opened right now.</p>
              <a href={`https://www.gutenberg.org/ebooks/${book.gutenbergId}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-semibold text-emerald-600">
                Read it on Project Gutenberg <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : (
            <article className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14" style={{ fontSize: prefs.fontSize, lineHeight: 1.75, fontFamily: "Georgia, 'Iowan Old Style', 'Times New Roman', serif" }}>
              <h1 className="mb-1 text-center font-display text-3xl font-semibold leading-tight">{book.title}</h1>
              <p className="mb-12 text-center text-sm" style={{ color: t.muted }}>{book.author}</p>
              {blocks.map((b, i) =>
                b.kind === "heading" ? (
                  <h2 id={`blk-${i}`} key={i} className="mb-4 mt-12 scroll-mt-4 text-center text-[0.95em] font-bold uppercase tracking-[0.12em]">
                    {b.text}
                  </h2>
                ) : b.kind === "verse" ? (
                  <p id={`blk-${i}`} key={i} className="mb-5 whitespace-pre-line pl-4 italic">{b.text}</p>
                ) : (
                  <p id={`blk-${i}`} key={i} className="mb-5 text-justify [hyphens:auto]">{b.text}</p>
                )
              )}
              <div className="mt-16 border-t pt-8 text-center text-sm" style={{ borderColor: t.muted + "44", color: t.muted }}>
                The end. This free edition comes from Project Gutenberg.
              </div>
            </article>
          )}
        </div>

        {showContents && (
          <div className="absolute inset-y-0 right-0 z-10 w-full max-w-xs overflow-y-auto border-l p-4 shadow-2xl" style={{ background: t.bar, borderColor: t.muted + "33" }}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Contents</p>
              <button onClick={() => setShowContents(false)} className="rounded-full p-1 hover:opacity-70"><X className="h-4 w-4" /></button>
            </div>
            <ul className="space-y-0.5">
              {headings.map((h) => (
                <li key={h.i}>
                  <button onClick={() => jumpTo(h.i)} className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs hover:opacity-70">{h.text}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function BooksPage() {
  const [tab, setTab] = useState<"discover" | "shelves">("discover");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ book: SavedBook; extra?: GutenbergBook } | null>(null);
  const [reading, setReading] = useState<SavedBook | null>(null);
  const { recent } = useReadingProgress();
  const shelves = useShelves();
  const savedCount = new Set(shelves.shelves.flatMap((s) => s.books.map((b) => b.id))).size;

  const open = (book: SavedBook, extra?: GutenbergBook) => setSelected({ book, extra });
  const read = (book: SavedBook) => {
    setSelected(null);
    setReading(book);
  };

  return (
    <div className="flex h-[calc(100dvh-48px)] flex-col overflow-hidden lg:h-dvh">
      <header className="shrink-0 border-b border-border/60 bg-background/70 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-xl font-semibold text-foreground sm:text-2xl">Books</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(input.trim());
              setTab("discover");
            }}
            className="relative order-3 w-full sm:order-none sm:ml-4 sm:w-auto sm:flex-1 sm:max-w-xl"
          >
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search free books by title or author"
              className="h-10 w-full rounded-full border border-border bg-muted/50 pl-10 pr-9 text-base text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm"
            />
            {(input || query) && (
              <button
                type="button"
                onClick={() => {
                  setInput("");
                  setQuery("");
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </form>
          <div className="ml-auto flex items-center rounded-full bg-muted p-1 text-xs font-semibold">
            {(["discover", "shelves"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition", tab === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
              >
                {k === "shelves" && <Bookmark className="h-3.5 w-3.5" />}
                {k === "discover" ? "Discover" : "My shelves"}
                {k === "shelves" && savedCount > 0 && <span className="tabular-nums">{savedCount}</span>}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-7xl space-y-10">
          {tab === "shelves" ? (
            <ShelvesTab onOpen={(b) => open(b)} />
          ) : query ? (
            <SearchResults query={query} onOpen={open} />
          ) : (
            <>
              {recent.length > 0 && (
                <section>
                  <RowHeader title="Continue reading" />
                  <Scroller>
                    {recent.map((p) => (
                      <BookCard key={p.id} book={p} progress={p.percent} onOpen={() => read(p)} />
                    ))}
                  </Scroller>
                </section>
              )}
              {CURATED.slice(0, 2).map((r) => <CuratedRow key={r.id} row={r} onOpen={(b) => open(b)} />)}
              <ModernRow row={MODERN_ROWS[0]} onOpen={(b) => open(b)} />
              {CURATED.slice(2).map((r) => <CuratedRow key={r.id} row={r} onOpen={(b) => open(b)} />)}
              {MODERN_ROWS.slice(1).map((r) => <ModernRow key={r.id} row={r} onOpen={(b) => open(b)} />)}
              <p className="pb-4 text-center text-[11px] text-muted-foreground">
                Free books are public-domain classics from Project Gutenberg. Modern books open on Open Library, where you can borrow them with a free account.
              </p>
            </>
          )}
        </div>
      </div>

      {selected && <BookDialog book={selected.book} extra={selected.extra} onClose={() => setSelected(null)} onRead={read} />}
      {reading && <Reader book={reading} onClose={() => setReading(null)} />}
    </div>
  );
}
