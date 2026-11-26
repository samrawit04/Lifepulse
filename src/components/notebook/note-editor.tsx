import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { format } from "date-fns";
import { marked } from "marked";
import { toast } from "sonner";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Archive as ArchiveIcon,
  Bold,
  Camera,
  ChevronLeft,
  Code2,
  Eraser,
  Highlighter,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Mic,
  Paperclip,
  Quote,
  Redo2,
  Smile,
  Strikethrough,
  Table2,
  Trash2,
  Type,
  Underline as UnderlineIcon,
  Undo2,
  Video,
} from "lucide-react";
import type { Item } from "@/lib/lifeos-types";
import { cn } from "@/lib/utils";
import { uploadToCloudinary } from "@/lib/cloudinary";
import {
  attachmentNode,
  imageNode,
  parseNotebookContent,
  serializeNotebookContent,
  type JSONNode,
} from "@/lib/notebook-content";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { buildNoteExtensions } from "./editor-extensions";
import { RecorderOverlay, type AttachmentLike } from "./recorder-overlay";
import { EmojiPicker } from "./emoji-picker";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const SAVE_DEBOUNCE_MS = 600;

const TEXT_COLORS = [
  { name: "Default", value: null },
  { name: "Gray", value: "#9ca3af" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Yellow", value: "#eab308" },
  { name: "Green", value: "#22c55e" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
];

const HIGHLIGHTS = [
  { name: "None", value: null },
  { name: "Yellow", value: "#fef08a" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Pink", value: "#fbcfe8" },
  { name: "Orange", value: "#fed7aa" },
  { name: "Purple", value: "#e9d5ff" },
];

function fileKind(file: File): "image" | "audio" | "video" | "file" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

/**
 * Text copied with an app's "copy" button (ChatGPT, Claude, GitHub, Notion export…)
 * often arrives as Markdown with no HTML. Detect that so we can keep its formatting.
 */
function looksLikeMarkdown(text: string): boolean {
  const lines = text.split(/\r?\n/);
  let score = 0;
  let listLines = 0;
  for (const line of lines) {
    if (/^#{1,6}\s+\S/.test(line)) score += 2;
    else if (/^\s*\|.*\|\s*$/.test(line) && /\|\s*:?-{3,}/.test(text)) score += 2;
    else if (/^```/.test(line)) score += 2;
    else if (/^\s*([-*+]|\d+[.)])\s+\S/.test(line)) listLines++;
    else if (/^>\s/.test(line)) score += 1;
    if (/\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/.test(line)) score += 1;
  }
  if (listLines >= 2) score += 2;
  return score >= 2;
}

function markdownToHtml(text: string): string {
  return marked.parse(text, { async: false, gfm: true, breaks: false }) as string;
}

function isPendingSrc(src: unknown): src is string {
  return typeof src === "string" && (src.startsWith("data:") || src.startsWith("blob:"));
}

export function NoteEditor({
  page,
  onClose,
  onChange,
  onArchive,
  onDelete,
}: {
  page: Item;
  onClose: () => void;
  onChange: (p: Partial<Item>) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(page.title ?? "");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [recorderMode, setRecorderMode] = useState<"idle" | "photo" | "audio" | "video">("idle");
  const [hint, setHint] = useState<string | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const lastFocusRef = useRef<"title" | "editor">("editor");

  // ── Save plumbing ──────────────────────────────────────────────────────────
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const titleRef = useRef(title);
  titleRef.current = title;
  const editorRef = useRef<Editor | null>(null);
  const dirtyRef = useRef(false);
  const pendingUploadsRef = useRef(0);
  const processedSrcsRef = useRef(new Set<string>());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((text: string, ms = 2200) => {
    setHint(text);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHint(null), ms);
  }, []);

  /** Persist now (skipped while images are still uploading, so we never save huge data URLs). */
  const saveNow = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed || !dirtyRef.current) return;
    if (pendingUploadsRef.current > 0) return; // will be retried when uploads finish
    dirtyRef.current = false;
    onChangeRef.current({
      title: titleRef.current,
      content: serializeNotebookContent(editor.getJSON() as JSONNode),
    });
  }, []);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveNow, SAVE_DEBOUNCE_MS);
  }, [saveNow]);

  // ── Uploads ────────────────────────────────────────────────────────────────

  /** Upload files and insert them as image / attachment nodes. */
  const insertFiles = useCallback(
    async (files: File[], at?: number) => {
      const editor = editorRef.current;
      if (!editor || files.length === 0) return;

      const accepted = files.filter((f) => {
        if (f.size > MAX_FILE_BYTES) {
          toast.error(`"${f.name || "File"}" is larger than 10 MB.`);
          return false;
        }
        return true;
      });
      if (accepted.length === 0) return;

      pendingUploadsRef.current++;
      flash(accepted.length > 1 ? `Uploading ${accepted.length} files…` : "Uploading…", 60_000);
      try {
        const nodes = (
          await Promise.all(
            accepted.map(async (file) => {
              try {
                const url = await uploadToCloudinary(file);
                const kind = fileKind(file);
                const name =
                  file.name && file.name !== "image.png"
                    ? file.name
                    : `pasted-${kind}-${Date.now()}.${file.type.split("/")[1] ?? "bin"}`;
                processedSrcsRef.current.add(url);
                return kind === "image" ? imageNode(url, { name }) : attachmentNode(kind, url, name, file.type);
              } catch (err: any) {
                toast.error(`Upload failed: ${err?.message || err}`);
                return null;
              }
            })
          )
        ).filter((n): n is JSONNode => n !== null);

        if (nodes.length > 0 && !editor.isDestroyed) {
          const chain = editor.chain().focus();
          (at !== undefined ? chain.insertContentAt(at, nodes) : chain.insertContent(nodes)).run();
          flash(nodes.length > 1 ? `${nodes.length} items added` : "Added");
        } else {
          setHint(null);
        }
      } finally {
        pendingUploadsRef.current--;
        if (pendingUploadsRef.current === 0) scheduleSave();
      }
    },
    [flash, scheduleSave]
  );

  /**
   * After a rich paste, images may arrive as embedded data/blob URLs (Word,
   * screenshots inside HTML…). Upload those so pages stay small, and drop
   * images that point at local files the browser can't read.
   */
  const uploadEmbeddedImages = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return;

    const toUpload = new Set<string>();
    const unreadable: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== "image") return;
      const src = node.attrs.src;
      if (typeof src === "string" && src.startsWith("file:")) unreadable.push(pos);
      else if (isPendingSrc(src) && !processedSrcsRef.current.has(src)) toUpload.add(src);
    });

    if (unreadable.length > 0) {
      const tr = editor.state.tr;
      [...unreadable].reverse().forEach((pos) => {
        const node = tr.doc.nodeAt(pos);
        if (node) tr.delete(pos, pos + node.nodeSize);
      });
      editor.view.dispatch(tr);
      toast.info("Some pasted images were local files and couldn't be included.");
    }

    for (const src of toUpload) {
      processedSrcsRef.current.add(src);
      pendingUploadsRef.current++;
      try {
        const blob = await (await fetch(src)).blob();
        let replacement: string | null = null;
        if (blob.size > MAX_FILE_BYTES) {
          toast.error("A pasted image is larger than 10 MB and was removed.");
        } else {
          const ext = (blob.type.split("/")[1] || "png").split("+")[0];
          replacement = await uploadToCloudinary(new File([blob], `pasted-image-${Date.now()}.${ext}`, { type: blob.type || "image/png" }));
          processedSrcsRef.current.add(replacement);
        }
        const ed = editorRef.current;
        if (!ed || ed.isDestroyed) continue;
        const tr = ed.state.tr;
        const hits: { pos: number; size: number; attrs: Record<string, unknown> }[] = [];
        ed.state.doc.descendants((node, pos) => {
          if (node.type.name === "image" && node.attrs.src === src) hits.push({ pos, size: node.nodeSize, attrs: node.attrs });
        });
        hits.reverse().forEach((h) => {
          if (replacement) tr.setNodeMarkup(h.pos, undefined, { ...h.attrs, src: replacement });
          else tr.delete(h.pos, h.pos + h.size);
        });
        if (hits.length) ed.view.dispatch(tr);
      } catch (err: any) {
        toast.error(`Couldn't upload a pasted image: ${err?.message || err}`);
      } finally {
        pendingUploadsRef.current--;
        if (pendingUploadsRef.current === 0) scheduleSave();
      }
    }
  }, [scheduleSave]);

  // ── Editor ─────────────────────────────────────────────────────────────────
  const extensions = useMemo(() => buildNoteExtensions("Start writing, or paste anything…"), []);
  const initialContent = useMemo(() => parseNotebookContent(page.content), [page.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const editor = useEditor({
    extensions,
    content: initialContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "note-prose focus:outline-none min-h-[50vh] pb-24",
        spellcheck: "true",
      },
      handlePaste: (_view, event) => {
        const dt = event.clipboardData;
        if (!dt) return false;
        const html = dt.getData("text/html");
        const files = Array.from(dt.files ?? []);
        // Pure file paste (screenshots, copied files) → upload them.
        if (!html && files.length > 0) {
          event.preventDefault();
          void insertFiles(files);
          return true;
        }
        // Markdown text (e.g. from a "copy" button) → convert so headings, lists,
        // bold and tables keep their formatting.
        if (!html) {
          const text = dt.getData("text/plain");
          if (text && looksLikeMarkdown(text)) {
            event.preventDefault();
            editorRef.current?.chain().focus().insertContent(markdownToHtml(text)).run();
            flash("Pasted with formatting");
            setTimeout(() => void uploadEmbeddedImages(), 0);
            return true;
          }
        }
        // Rich / plain text paste: let the editor keep the formatting, then
        // upload any embedded images.
        if (html) flash("Pasted with formatting");
        setTimeout(() => void uploadEmbeddedImages(), 0);
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length === 0) {
          setTimeout(() => void uploadEmbeddedImages(), 0);
          return false;
        }
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        void insertFiles(files, coords?.pos);
        return true;
      },
    },
    onUpdate: () => scheduleSave(),
    onFocus: () => {
      lastFocusRef.current = "editor";
    },
  });

  editorRef.current = editor;

  // Flush pending changes when leaving the page
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      const ed = editorRef.current;
      if (dirtyRef.current && ed && !ed.isDestroyed) {
        dirtyRef.current = false;
        onChangeRef.current({
          title: titleRef.current,
          content: serializeNotebookContent(ed.getJSON() as JSONNode),
        });
      }
    };
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleTitleChange = (val: string) => {
    setTitle(val);
    titleRef.current = val;
    scheduleSave();
  };

  const insertEmoji = useCallback(
    (emoji: string) => {
      setShowEmojiPicker(false);
      if (lastFocusRef.current === "title" && titleInputRef.current) {
        const el = titleInputRef.current;
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        handleTitleChange(el.value.slice(0, start) + emoji + el.value.slice(end));
        setTimeout(() => {
          el.focus();
          el.setSelectionRange(start + emoji.length, start + emoji.length);
        }, 20);
        return;
      }
      editor?.chain().focus().insertContent(emoji).run();
    },
    [editor] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleCapture = (att: AttachmentLike) => {
    setRecorderMode("idle");
    if (!editor) return;
    processedSrcsRef.current.add(att.dataUrl);
    const node =
      att.type === "image"
        ? imageNode(att.dataUrl, { name: att.name })
        : attachmentNode(att.type, att.dataUrl, att.name, att.mimeType);
    editor.chain().focus().insertContent(node).run();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void insertFiles(files);
  };

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        {/* ── Formatting toolbar ── */}
        {editor && <FormattingToolbar editor={editor} />}

        {/* ── Writing area ── */}
        <div className="relative min-h-0 flex-1 overflow-auto" onClick={(e) => {
          // Clicking empty space below the text focuses the end of the document
          if (e.target === e.currentTarget) editor?.chain().focus("end").run();
        }}>
          {hint && (
            <div className="pointer-events-none fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-xl border border-border bg-card px-4 py-2 text-xs font-medium text-card-foreground shadow-2xl">
              {hint}
            </div>
          )}
          <div className="mx-auto max-w-4xl px-3 pt-4 sm:px-6 sm:pt-6">
            <input
              ref={titleInputRef}
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              onFocus={() => (lastFocusRef.current = "title")}
              onBlur={() => saveNow()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  editor?.chain().focus("start").run();
                }
              }}
              placeholder="Title"
              className="w-full bg-transparent font-display text-xl font-semibold leading-tight text-foreground placeholder:text-muted-foreground/25 focus:outline-none sm:text-3xl"
            />
            <p className="mb-4 mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
              {format(new Date(page.updated_at), "EEEE, MMM d · yyyy")}
            </p>
            <div className="mb-4 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* ── Bottom toolbar: media & page actions ── */}
        <div className="shrink-0 border-t border-white/[0.06] bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
          <div className="mx-auto max-w-4xl overflow-x-auto scrollbar-none">
            <div className="flex min-w-max items-center gap-0.5 px-2 py-1.5 sm:gap-1 sm:px-3 sm:py-2">
              <button
                onClick={() => { saveNow(); onClose(); }}
                className="mr-1 flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
              <div className="mx-1 h-4 w-px shrink-0 bg-white/[0.08]" />
              <BottomBtn icon={<Camera className="h-4 w-4" />} label="Photo" onClick={() => setRecorderMode("photo")} />
              <BottomBtn icon={<Mic className="h-4 w-4" />} label="Audio" onClick={() => setRecorderMode("audio")} />
              <BottomBtn icon={<Video className="h-4 w-4" />} label="Video" onClick={() => setRecorderMode("video")} />
              <BottomBtn icon={<Paperclip className="h-4 w-4" />} label="File" onClick={() => fileInputRef.current?.click()} />
              <BottomBtn
                icon={<Table2 className="h-4 w-4" />}
                label="Table"
                onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
              />
              <BottomBtn
                btnRef={emojiButtonRef}
                icon={<Smile className="h-4 w-4" />}
                label="Emoji"
                onClick={() => setShowEmojiPicker((p) => !p)}
              />
              {showEmojiPicker && emojiButtonRef.current &&
                createPortal(
                  <EmojiPicker anchorEl={emojiButtonRef.current} onSelect={insertEmoji} onClose={() => setShowEmojiPicker(false)} />,
                  document.body
                )}
              <div className="mx-1 h-4 w-px shrink-0 bg-white/[0.08]" />
              <button
                onClick={onArchive}
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                title="Archive"
              >
                <ArchiveIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Archive</span>
              </button>
              <button
                onClick={() => setDeleteDialogOpen(true)}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive transition-colors hover:bg-destructive/20"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />

      {recorderMode !== "idle" && (
        <RecorderOverlay mode={recorderMode} onCapture={handleCapture} onClose={() => setRecorderMode("idle")} />
      )}

      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete this page?"
        description="This notebook page will be permanently deleted. This cannot be undone."
        confirmLabel="Delete Page"
        onConfirm={onDelete}
      />
    </>
  );
}

// ─── Formatting toolbar ─────────────────────────────────────────────────────

function FormattingToolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("codeBlock"),
      quote: e.isActive("blockquote"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      link: e.isActive("link"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      alignCenter: e.isActive({ textAlign: "center" }),
      alignRight: e.isActive({ textAlign: "right" }),
      inTable: e.isActive("table"),
      color: (e.getAttributes("textStyle").color as string | undefined) ?? null,
      highlight: (e.getAttributes("highlight").color as string | undefined) ?? null,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const blockStyle = s.h1 ? "h1" : s.h2 ? "h2" : s.h3 ? "h3" : "p";
  const setBlockStyle = (v: string) => {
    const c = editor.chain().focus();
    if (v === "p") c.setParagraph().run();
    else c.setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
  };

  return (
    <div className="shrink-0 border-b border-white/[0.06] bg-background/70 backdrop-blur-md">
      <div className="mx-auto max-w-4xl overflow-x-auto scrollbar-none">
        <div className="flex min-w-max items-center gap-0.5 px-2 py-1.5 sm:px-3">
          <TBtn title="Undo (Ctrl+Z)" disabled={!s.canUndo} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></TBtn>
          <TBtn title="Redo (Ctrl+Y)" disabled={!s.canRedo} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></TBtn>
          <Sep />
          <select
            value={blockStyle}
            onChange={(e) => setBlockStyle(e.target.value)}
            className="h-8 rounded-lg border border-white/10 bg-transparent px-2 text-xs text-foreground focus:outline-none"
            title="Text style"
          >
            <option value="p" className="bg-card">Normal text</option>
            <option value="h1" className="bg-card">Heading 1</option>
            <option value="h2" className="bg-card">Heading 2</option>
            <option value="h3" className="bg-card">Heading 3</option>
          </select>
          <Sep />
          <TBtn title="Bold (Ctrl+B)" active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></TBtn>
          <TBtn title="Italic (Ctrl+I)" active={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></TBtn>
          <TBtn title="Underline (Ctrl+U)" active={s.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></TBtn>
          <TBtn title="Strikethrough" active={s.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></TBtn>
          <ColorMenu
            title="Text color"
            icon={<Type className="h-4 w-4" />}
            current={s.color}
            options={TEXT_COLORS}
            onPick={(v) => (v ? editor.chain().focus().setColor(v).run() : editor.chain().focus().unsetColor().run())}
          />
          <ColorMenu
            title="Highlight"
            icon={<Highlighter className="h-4 w-4" />}
            current={s.highlight}
            options={HIGHLIGHTS}
            onPick={(v) => (v ? editor.chain().focus().setHighlight({ color: v }).run() : editor.chain().focus().unsetHighlight().run())}
          />
          <Sep />
          <TBtn title="Bulleted list" active={s.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></TBtn>
          <TBtn title="Numbered list" active={s.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></TBtn>
          <TBtn title="Checklist" active={s.task} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks className="h-4 w-4" /></TBtn>
          <TBtn title="Quote" active={s.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></TBtn>
          <TBtn title="Code block" active={s.code} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 className="h-4 w-4" /></TBtn>
          <Sep />
          <TBtn title="Align left" active={!s.alignCenter && !s.alignRight} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="h-4 w-4" /></TBtn>
          <TBtn title="Align center" active={s.alignCenter} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="h-4 w-4" /></TBtn>
          <TBtn title="Align right" active={s.alignRight} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="h-4 w-4" /></TBtn>
          <Sep />
          <LinkMenu editor={editor} active={s.link} />
          <TBtn title="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser className="h-4 w-4" /></TBtn>

          {s.inTable && (
            <>
              <Sep />
              <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Table</span>
              <TextBtn onClick={() => editor.chain().focus().addRowAfter().run()}>+ Row</TextBtn>
              <TextBtn onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Column</TextBtn>
              <TextBtn onClick={() => editor.chain().focus().deleteRow().run()}>− Row</TextBtn>
              <TextBtn onClick={() => editor.chain().focus().deleteColumn().run()}>− Column</TextBtn>
              <TextBtn onClick={() => editor.chain().focus().toggleHeaderRow().run()}>Header row</TextBtn>
              <TextBtn danger onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</TextBtn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TBtn({
  children,
  title,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-30",
        active ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function TextBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "h-8 shrink-0 rounded-lg px-2 text-[11px] font-medium transition-colors",
        danger ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-white/[0.08]" />;
}

function ColorMenu({
  title,
  icon,
  current,
  options,
  onPick,
}: {
  title: string;
  icon: React.ReactNode;
  current: string | null;
  options: { name: string; value: string | null }[];
  onPick: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title}
          aria-label={title}
          onMouseDown={(e) => e.preventDefault()}
          className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
        >
          {icon}
          <span className="absolute bottom-1 left-2 right-2 h-[3px] rounded-full" style={{ background: current ?? "transparent" }} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-xl border-border bg-card p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
        <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        <div className="grid grid-cols-5 gap-1.5">
          {options.map((o) => (
            <button
              key={o.name}
              type="button"
              title={o.name}
              onClick={() => { onPick(o.value); setOpen(false); }}
              className={cn(
                "h-7 w-7 rounded-full border border-white/15 transition hover:scale-110",
                current === o.value && "ring-2 ring-primary ring-offset-1 ring-offset-card"
              )}
              style={o.value ? { background: o.value } : undefined}
            >
              {!o.value && <span className="text-[10px] text-muted-foreground">∅</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LinkMenu({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const onOpenChange = (o: boolean) => {
    if (o) setUrl((editor.getAttributes("link").href as string) ?? "");
    setOpen(o);
  };

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const href = url.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!href) chain.unsetLink().run();
    else chain.setLink({ href: /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}` }).run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Link"
          aria-label="Link"
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors",
            active ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
          )}
        >
          <Link2 className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 rounded-xl border-border bg-card p-3">
        <form onSubmit={apply} className="space-y-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" autoFocus className="h-9 text-sm" />
          <div className="flex justify-end gap-2">
            {active && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-destructive"
                onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setOpen(false); }}
              >
                Remove link
              </Button>
            )}
            <Button type="submit" size="sm" className="h-8 text-xs">Apply</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function BottomBtn({
  icon,
  label,
  onClick,
  btnRef,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  btnRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={btnRef}
      onClick={onClick}
      title={label}
      className="flex shrink-0 items-center gap-1 rounded-xl border border-transparent px-2.5 py-1.5 text-[11px] text-muted-foreground transition-all duration-150 hover:border-white/[0.08] hover:bg-white/[0.08] hover:text-foreground"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
