import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pin, Trash2, Plus, ZoomIn, ZoomOut, Maximize, MousePointerClick } from "lucide-react";
import { useCreateItem, useDeleteItem, useItems, useUpdateItem } from "@/hooks/use-lifeos";
import { NOTE_COLORS, noteColor, noteGradient, type Item } from "@/lib/lifeos-types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

export const Route = createFileRoute("/_authenticated/sticky")({
  component: StickyBoard,
});

const DEFAULT_W = 240;
const DEFAULT_H = 220;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.15;
// Base canvas size — the virtual workspace
const CANVAS_W = 6000;
const CANVAS_H = 4000;

function StickyBoard() {
  const { data: items = [] } = useItems();
  const create = useCreateItem();
  const update = useUpdateItem();
  const del = useDeleteItem();

  const boardRef = useRef<HTMLDivElement>(null);
  const lastTouchRef = useRef<number>(0);

  const [zoom, setZoom] = useState(1);

  const notes = items.filter((i) => i.type === "sticky" && !i.archived);

  // Scaled canvas dimensions — this is what the scrollable area size becomes
  const scaledW = CANVAS_W * zoom;
  const scaledH = CANVAS_H * zoom;

  // Compute the bounding box of all notes to auto-expand canvas if notes go beyond
  const canvasSize = useMemo(() => {
    let maxX = CANVAS_W;
    let maxY = CANVAS_H;
    for (const n of notes) {
      const right = (n.pos_x ?? 0) + (n.width ?? DEFAULT_W) + 200;
      const bottom = (n.pos_y ?? 0) + (n.height ?? DEFAULT_H) + 200;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }
    return { w: maxX * zoom, h: maxY * zoom };
  }, [notes, zoom]);

  // Convert screen click to canvas coordinates (accounting for scroll + zoom)
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const board = boardRef.current;
    if (!board) return { x: 0, y: 0 };
    const rect = board.getBoundingClientRect();
    return {
      x: (clientX - rect.left + board.scrollLeft) / zoom,
      y: (clientY - rect.top + board.scrollTop) / zoom,
    };
  }, [zoom]);

  const spawnNote = useCallback((clientX: number, clientY: number) => {
    const canvasPos = screenToCanvas(clientX, clientY);
    const palette = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];
    create.mutate(
      {
        type: "sticky",
        content: "",
        color: palette.value,
        pos_x: Math.max(10, canvasPos.x - DEFAULT_W / 2),
        pos_y: Math.max(10, canvasPos.y - 30),
        width: DEFAULT_W,
        height: DEFAULT_H,
      },
      { onError: (err) => toast.error(err.message) },
    );
  }, [screenToCanvas, create]);

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-sticky-note]")) return;
    spawnNote(e.clientX, e.clientY);
  };

  // Mobile double-tap touch handler
  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-sticky-note]")) return;
    const now = Date.now();
    if (now - lastTouchRef.current < 300) {
      const touch = e.changedTouches[0];
      if (touch) {
        spawnNote(touch.clientX, touch.clientY);
      }
    }
    lastTouchRef.current = now;
  };

  const handleAddCenter = () => {
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    spawnNote(rect.left + rect.width / 2, rect.top + rect.height / 3);
  };

  // --- Ctrl+Wheel to zoom, normal wheel scrolls naturally ---
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // Let normal scroll through for scrollbars
      e.preventDefault();

      // Get mouse position relative to the board viewport
      const rect = board.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Position in canvas coords before zoom
      const canvasX = (mouseX + board.scrollLeft) / zoom;
      const canvasY = (mouseY + board.scrollTop) / zoom;

      const delta = -e.deltaY * 0.002;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta * zoom));

      setZoom(newZoom);

      // After zoom, adjust scroll so the point under the cursor stays put
      requestAnimationFrame(() => {
        board.scrollLeft = canvasX * newZoom - mouseX;
        board.scrollTop = canvasY * newZoom - mouseY;
      });
    };

    board.addEventListener("wheel", onWheel, { passive: false });
    return () => board.removeEventListener("wheel", onWheel);
  }, [zoom]);

  // --- Zoom controls ---
  const zoomTo = useCallback((newZoom: number) => {
    const board = boardRef.current;
    if (!board) return;
    // Zoom centered on the viewport center
    const rect = board.getBoundingClientRect();
    const centerX = (board.scrollLeft + rect.width / 2) / zoom;
    const centerY = (board.scrollTop + rect.height / 2) / zoom;
    setZoom(newZoom);
    requestAnimationFrame(() => {
      board.scrollLeft = centerX * newZoom - rect.width / 2;
      board.scrollTop = centerY * newZoom - rect.height / 2;
    });
  }, [zoom]);

  const zoomIn = () => zoomTo(Math.min(MAX_ZOOM, zoom + ZOOM_STEP));
  const zoomOut = () => zoomTo(Math.max(MIN_ZOOM, zoom - ZOOM_STEP));
  const zoomReset = () => {
    setZoom(1);
    const board = boardRef.current;
    if (board) {
      requestAnimationFrame(() => {
        board.scrollLeft = 0;
        board.scrollTop = 0;
      });
    }
  };

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="relative flex h-[calc(100dvh-48px)] lg:h-dvh flex-col p-3 sm:p-4 lg:p-6 overflow-hidden">
      <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-background/60 px-4 sm:px-6 py-3 backdrop-blur rounded-2xl mb-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-semibold text-foreground">Sticky Board</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Double-click anywhere to create a sticky note
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:inline">{notes.length} notes</span>
          <Button
            onClick={handleAddCenter}
            size="sm"
            className="h-8 rounded-xl bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-semibold gap-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" /> Add Note
          </Button>
        </div>
      </header>

      {/* Board container with fixed overlays */}
      <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden border border-border/40">
        {/* Scrollable board with native scrollbars */}
        <div
          ref={boardRef}
          onDoubleClick={onDoubleClick}
          onTouchEnd={onTouchEnd}
          className="h-full w-full overflow-auto bg-corkboard sticky-board-scroll"
        >
          {/* Inner canvas — sized to create scrollable area */}
          <div
            className="relative origin-top-left"
            style={{
              width: Math.max(scaledW, canvasSize.w),
              height: Math.max(scaledH, canvasSize.h),
            }}
          >
            {/* Dot grid for spatial awareness — scaled with zoom */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: `radial-gradient(circle, oklch(1 0 0 / 0.06) 1px, transparent 1px)`,
                backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
              }}
            />

            {/* Origin crosshair */}
            <div
              className="pointer-events-none absolute bg-white/10 rounded-full"
              style={{ top: 20 * zoom - 1, left: 0, width: 40 * zoom, height: 2 }}
            />
            <div
              className="pointer-events-none absolute bg-white/10 rounded-full"
              style={{ top: 0, left: 20 * zoom - 1, width: 2, height: 40 * zoom }}
            />

            {notes.map((n) => (
              <Note
                key={n.id}
                note={n}
                onChange={(patch) => update.mutate({ id: n.id, patch })}
                onDelete={() => del.mutate(n.id)}
                zoom={zoom}
              />
            ))}
          </div>
        </div>

        {/* Empty state overlay — centered in visible viewport */}
        {notes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center z-10">
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-8 py-6 text-center backdrop-blur">
              <MousePointerClick className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground font-medium">Double-click anywhere to drop your first note</p>
              <p className="text-xs text-muted-foreground/50 mt-1.5">
                Scroll to navigate • Ctrl + Scroll to zoom
              </p>
            </div>
          </div>
        )}

        {/* Zoom controls — fixed position over canvas (bottom-left corner) */}
        <div
          onDoubleClick={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute bottom-4 left-4 sm:bottom-5 sm:left-5 flex items-center gap-1 rounded-xl border border-border/60 bg-background/85 backdrop-blur-lg shadow-lg px-1.5 py-1 z-20"
        >
          <button
            onClick={zoomOut}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>

          <button
            onClick={zoomReset}
            className="min-w-[3.2rem] rounded-lg px-2 py-1 text-xs font-mono font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors text-center"
            title="Reset zoom & position"
          >
            {zoomPercent}%
          </button>

          <button
            onClick={zoomIn}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          <div className="w-px h-5 bg-border/60 mx-0.5" />

          <button
            onClick={zoomReset}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            title="Fit to view"
          >
            <Maximize className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Note({
  note, onChange, onDelete, zoom,
}: { note: Item; onChange: (patch: Partial<Item>) => void; onDelete: () => void; zoom: number }) {
  const [pos, setPos] = useState({ x: note.pos_x ?? 60, y: note.pos_y ?? 60 });
  const [size, setSize] = useState({ w: note.width ?? DEFAULT_W, h: note.height ?? DEFAULT_H });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const startRef = useRef<{ mx: number; my: number; px: number; py: number; w: number; h: number }>({ mx: 0, my: 0, px: 0, py: 0, w: 0, h: 0 });

  useEffect(() => {
    setPos({ x: note.pos_x ?? 60, y: note.pos_y ?? 60 });
    setSize({ w: note.width ?? DEFAULT_W, h: note.height ?? DEFAULT_H });
  }, [note.pos_x, note.pos_y, note.width, note.height]);

  useEffect(() => {
    if (!dragging && !resizing) return;
    const onMove = (e: MouseEvent) => {
      const s = startRef.current;
      if (dragging) {
        // Divide by zoom so mouse movement maps 1:1 to canvas-space movement
        setPos({
          x: s.px + (e.clientX - s.mx) / zoom,
          y: s.py + (e.clientY - s.my) / zoom,
        });
      } else {
        setSize({
          w: Math.max(180, s.w + (e.clientX - s.mx) / zoom),
          h: Math.max(160, s.h + (e.clientY - s.my) / zoom),
        });
      }
    };
    const onUp = () => {
      if (dragging) onChange({ pos_x: pos.x, pos_y: pos.y });
      if (resizing) onChange({ width: size.w, height: size.h });
      setDragging(false);
      setResizing(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, resizing, pos, size, onChange, zoom]);

  const startDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
    startRef.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y, w: size.w, h: size.h };
    setDragging(true);
  };
  const startResize = (e: React.MouseEvent) => {
    e.stopPropagation();
    startRef.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y, w: size.w, h: size.h };
    setResizing(true);
  };

  const active = noteColor(note.color);

  // Render note at zoomed position and size
  const zoomedLeft = pos.x * zoom;
  const zoomedTop = pos.y * zoom;
  const zoomedW = size.w * zoom;
  const zoomedH = size.h * zoom;

  return (
    <div
      data-sticky-note
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "group absolute overflow-hidden rounded-2xl shadow-note ring-1 ring-black/10 transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-15px_oklch(0_0_0/0.7)]",
        dragging && "cursor-grabbing !shadow-2xl scale-[1.02] rotate-[-0.5deg]",
      )}
      style={{
        left: zoomedLeft,
        top: zoomedTop,
        width: zoomedW,
        height: zoomedH,
        background: noteGradient(note.color),
        fontSize: `${Math.max(10, 15 * zoom)}px`,
      }}
    >
      {/* soft top sheen */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-10"
        style={{ background: "linear-gradient(180deg, oklch(1 0 0 / 0.25), transparent)" }}
      />
      {/* pin */}
      {note.pinned && (
        <div className="pointer-events-none absolute -top-1.5 left-1/2 -translate-x-1/2">
          <div className="h-3 w-3 rounded-full bg-gradient-to-b from-rose-400 to-rose-700 shadow-[0_2px_4px_oklch(0_0_0/0.4)]" />
        </div>
      )}

      <div
        onMouseDown={startDrag}
        className="relative flex h-8 cursor-grab items-center justify-between px-2.5 text-black/70"
      >
        <div className="flex items-center gap-1">
          {NOTE_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={(e) => { e.stopPropagation(); onChange({ color: c.value }); }}
              className={cn(
                "h-2.5 w-2.5 rounded-full border border-black/20 transition-transform hover:scale-125",
                note.color === c.value && "ring-2 ring-black/40 ring-offset-1 ring-offset-transparent scale-110",
              )}
              style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
              title={`${c.name} — ${c.meaning}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); onChange({ pinned: !note.pinned }); }}
            className={cn(
              "rounded-md p-1 transition hover:bg-black/10",
              note.pinned && "text-rose-700",
            )}
            title="Pin"
          >
            <Pin className="h-3.5 w-3.5" fill={note.pinned ? "currentColor" : "none"} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            className="rounded-md p-1 transition hover:bg-black/10 hover:text-rose-700"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <textarea
        defaultValue={note.content ?? ""}
        onBlur={(e) => {
          if (e.target.value !== note.content) onChange({ content: e.target.value });
        }}
        placeholder="Type your note…"
        className="relative w-full resize-none bg-transparent px-4 pb-4 pt-1 font-display leading-relaxed text-black/85 placeholder:font-sans placeholder:text-black/40 focus:outline-none"
        style={{
          height: "calc(100% - 32px)",
          fontSize: "inherit",
        }}
      />

      {/* accent corner */}
      <div
        className="pointer-events-none absolute -bottom-6 -right-6 h-20 w-20 rounded-full opacity-40 blur-2xl"
        style={{ background: active.to }}
      />

      {/* resize handle */}
      <div
        onMouseDown={startResize}
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
        style={{
          background: "linear-gradient(135deg, transparent 50%, oklch(0 0 0 / 0.25) 50%)",
          borderBottomRightRadius: 16,
        }}
      />

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this note?"
        description="The sticky note will be permanently removed. This cannot be undone."
        confirmLabel="Delete Note"
        onConfirm={() => { setConfirmDelete(false); onDelete(); }}
      />
    </div>
  );
}
