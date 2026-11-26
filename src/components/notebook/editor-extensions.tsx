import { useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Loader2, Mic, Paperclip, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImageLayout } from "@/lib/notebook-content";

// ─── Image (with side-by-side layouts) ───────────────────────────────────────

function isPendingSrc(src: unknown) {
  return typeof src === "string" && (src.startsWith("data:") || src.startsWith("blob:"));
}

function ImageView({ node, updateAttributes, deleteNode, selected, editor }: ReactNodeViewProps) {
  const layout = (node.attrs.layout as ImageLayout) ?? "full";
  const src = node.attrs.src as string;
  const editable = editor.isEditable;
  const [failed, setFailed] = useState(false);

  return (
    <NodeViewWrapper
      className={cn(
        "group relative my-2 overflow-hidden rounded-xl border border-white/10 bg-black/20 shadow-note",
        selected && "ring-2 ring-primary/60"
      )}
      data-drag-handle
    >
      {failed ? (
        <div className="flex h-28 items-center justify-center px-3 text-center text-xs text-muted-foreground">
          This image couldn't be loaded
        </div>
      ) : (
        <img
          src={src}
          alt={(node.attrs.alt as string) ?? ""}
          className={cn(
            "block h-auto max-h-[520px] rounded-xl object-contain",
            layout === "full" ? "mx-auto w-auto max-w-full" : "w-full"
          )}
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}

      {isPendingSrc(src) && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 text-xs font-medium text-white">
          <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
        </div>
      )}

      {editable && (
        <div
          contentEditable={false}
          className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-lg bg-black/75 p-1 text-white opacity-100 backdrop-blur-md transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
        >
          <div className="hidden items-center gap-0.5 rounded bg-white/10 p-0.5 text-[10px] sm:flex">
            {(["full", "half", "third"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateAttributes({ layout: l })}
                className={cn("rounded px-1.5 py-0.5 font-medium transition-colors", layout === l && "bg-primary text-primary-foreground")}
                title={l === "full" ? "Full width" : l === "half" ? "Half width (side by side)" : "One third (side by side)"}
              >
                {l === "full" ? "100%" : l === "half" ? "50%" : "33%"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => deleteNode()}
            title="Remove image"
            className="flex h-6 w-6 items-center justify-center rounded bg-red-500/30 transition-colors hover:bg-red-500/60"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const NoteImage = Image.extend({
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      layout: {
        default: "full",
        parseHTML: (el) => {
          const v = el.getAttribute("data-layout");
          return v === "half" || v === "third" ? v : "full";
        },
        renderHTML: (attrs) => ({ "data-layout": attrs.layout }),
      },
      name: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-name"),
        renderHTML: (attrs) => (attrs.name ? { "data-name": attrs.name } : {}),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView, {
      className: "note-image-node",
      attrs: ({ node }) => ({ "data-layout": String(node.attrs.layout ?? "full") }),
    });
  },
}).configure({ inline: false, allowBase64: true });

// ─── Attachment (audio / video / file) ───────────────────────────────────────

function AttachmentView({ node, deleteNode, selected, editor }: ReactNodeViewProps) {
  const kind = node.attrs.kind as "audio" | "video" | "file";
  const src = node.attrs.src as string;
  const name = (node.attrs.name as string) || "Attachment";
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const editable = editor.isEditable;

  const removeBtn = editable && (
    <button
      type="button"
      contentEditable={false}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => deleteNode()}
      title="Remove"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <X className="h-3 w-3" />
    </button>
  );

  return (
    <NodeViewWrapper className={cn("my-2", selected && "rounded-xl ring-2 ring-primary/60")} data-drag-handle>
      <div contentEditable={false}>
        {kind === "video" ? (
          <div className="group relative overflow-hidden rounded-xl border border-white/10 shadow-note">
            <video ref={videoRef} src={src} className="max-h-72 w-full bg-black object-contain" controls={videoPlaying} />
            {!videoPlaying && (
              <div
                className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/40"
                onClick={() => { setVideoPlaying(true); videoRef.current?.play(); }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur transition-colors hover:bg-white/30">
                  <Play className="h-5 w-5 fill-white text-white" />
                </div>
              </div>
            )}
            <div className="absolute right-2 top-2">{removeBtn}</div>
            <p className="truncate p-1.5 text-[10px] text-muted-foreground/60">{name}</p>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              {kind === "audio" ? <Mic className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 truncate text-xs font-medium text-foreground">{name}</p>
              {kind === "audio" ? (
                <audio controls src={src} className="h-8 w-full" />
              ) : (
                <a href={src} download={name} target="_blank" rel="noreferrer" className="text-[11px] text-primary/70 hover:text-primary">
                  Download
                </a>
              )}
            </div>
            {removeBtn}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const Attachment = Node.create({
  name: "attachment",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      kind: {
        default: "file",
        parseHTML: (el) => el.getAttribute("data-kind") ?? "file",
        renderHTML: (attrs) => ({ "data-kind": attrs.kind }),
      },
      src: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-src") ?? el.getAttribute("src"),
        renderHTML: (attrs) => ({ "data-src": attrs.src }),
      },
      name: {
        default: "Attachment",
        parseHTML: (el) => el.getAttribute("data-name") ?? "Attachment",
        renderHTML: (attrs) => ({ "data-name": attrs.name }),
      },
      mimeType: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-mime"),
        renderHTML: (attrs) => (attrs.mimeType ? { "data-mime": attrs.mimeType } : {}),
      },
    };
  },

  parseHTML() {
    return [
      { tag: "div[data-attachment]" },
      { tag: "audio[src]", getAttrs: (el) => ({ kind: "audio", src: (el as HTMLElement).getAttribute("src"), name: "Audio" }) },
      { tag: "video[src]", getAttrs: (el) => ({ kind: "video", src: (el as HTMLElement).getAttribute("src"), name: "Video" }) },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-attachment": "" }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentView);
  },
});

// ─── Full extension set ──────────────────────────────────────────────────────

export function buildNoteExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
    }),
    Placeholder.configure({ placeholder }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    NoteImage,
    Attachment,
  ];
}
