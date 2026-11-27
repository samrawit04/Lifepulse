import { useMemo } from "react";
import type { GutenbergBook } from "@/integrations/api/client";
import { useUserSetting } from "@/hooks/use-user-setting";

/** A book as we keep it on shelves and in reading progress (enough to show it without refetching). */
export type SavedBook = {
  /** "gb:<gutenberg id>" for free books we can open, "ol:<work key>" for Open Library books. */
  id: string;
  title: string;
  author: string;
  cover: string | null;
  source: "gutenberg" | "openlibrary";
  gutenbergId?: number;
  /** Open Library page (borrow / read there). */
  url?: string;
};

export type Shelf = { id: string; name: string; books: SavedBook[] };

export type ReadingProgress = SavedBook & { percent: number; updatedAt: string };

export type ReaderPrefs = { fontSize: number; theme: "dark" | "sepia" | "light" };

const DEFAULT_SHELVES: Shelf[] = [{ id: "want-to-read", name: "Want to read", books: [] }];
const NO_PROGRESS: Record<string, ReadingProgress> = {};
const DEFAULT_PREFS: ReaderPrefs = { fontSize: 19, theme: "dark" };

export function fromGutenberg(b: GutenbergBook): SavedBook {
  return {
    id: `gb:${b.id}`,
    title: b.title,
    author: b.authors[0] ?? "Unknown author",
    cover: b.cover,
    source: "gutenberg",
    gutenbergId: b.id,
  };
}

/** Reading lists, saved on the user's account. */
export function useShelves() {
  const { value: shelves, save } = useUserSetting<Shelf[]>("book-shelves", DEFAULT_SHELVES);

  return useMemo(() => {
    const isSaved = (bookId: string) => shelves.some((s) => s.books.some((b) => b.id === bookId));
    const shelvesWith = (bookId: string) => shelves.filter((s) => s.books.some((b) => b.id === bookId)).map((s) => s.id);
    return {
      shelves,
      isSaved,
      shelvesWith,
      toggle: (shelfId: string, book: SavedBook) =>
        save(
          shelves.map((s) =>
            s.id !== shelfId
              ? s
              : s.books.some((b) => b.id === book.id)
                ? { ...s, books: s.books.filter((b) => b.id !== book.id) }
                : { ...s, books: [book, ...s.books] }
          )
        ),
      create: (name: string, first?: SavedBook) => {
        const shelf: Shelf = { id: `s-${Date.now().toString(36)}`, name, books: first ? [first] : [] };
        save([...shelves, shelf]);
        return shelf;
      },
      rename: (shelfId: string, name: string) => save(shelves.map((s) => (s.id === shelfId ? { ...s, name } : s))),
      remove: (shelfId: string) => save(shelves.filter((s) => s.id !== shelfId)),
    };
  }, [shelves, save]);
}

/** Where the user stopped in each book, saved on their account. */
export function useReadingProgress() {
  const { value, save } = useUserSetting<Record<string, ReadingProgress>>("book-progress", NO_PROGRESS);
  return useMemo(
    () => ({
      progress: value,
      recent: Object.values(value).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
      set: (book: SavedBook, percent: number) =>
        save({ ...value, [book.id]: { ...book, percent: Math.max(0, Math.min(1, percent)), updatedAt: new Date().toISOString() } }),
      clear: (bookId: string) => {
        const next = { ...value };
        delete next[bookId];
        save(next);
      },
    }),
    [value, save]
  );
}

export function useReaderPrefs() {
  const { value, save } = useUserSetting<ReaderPrefs>("book-reader-prefs", DEFAULT_PREFS);
  return { prefs: { ...DEFAULT_PREFS, ...value }, save };
}
