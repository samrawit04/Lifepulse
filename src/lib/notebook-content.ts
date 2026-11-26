/**
 * Notebook page content model.
 *
 * v3 (current):  { version: 3, doc: <TipTap/ProseMirror JSON> }  — rich text
 * v2 (legacy):   { version: 2, blocks: [...] }                    — text/media/table blocks
 * v1 (legacy):   { text, attachments }                            — very old pages
 * plain text:    anything that isn't JSON
 *
 * Old pages are converted to v3 on the fly when opened and are re-saved as v3
 * on their next edit, so nothing is lost and no backend migration is needed.
 */

export type JSONNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JSONNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
};

export type ImageLayout = "full" | "half" | "third";
export type AttachmentKind = "audio" | "video" | "file";

// ─── Legacy (v1 / v2) block model ────────────────────────────────────────────

type LegacyTextBlock = { id?: string; kind: "text"; content: string };
type LegacyMediaBlock = {
  id?: string;
  kind: "media";
  type: "image" | "audio" | "video" | "file";
  name?: string;
  dataUrl: string;
  mimeType?: string;
  layout?: "auto" | "full" | "half" | "third";
};
type LegacyTableBlock = { id?: string; kind: "table"; rows: string[][] };
type LegacyBlock = LegacyTextBlock | LegacyMediaBlock | LegacyTableBlock;

function legacyBlocksFromRaw(parsed: any): LegacyBlock[] | null {
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.blocks)) {
    return parsed.blocks as LegacyBlock[];
  }
  if (parsed && typeof parsed === "object" && typeof parsed.text === "string") {
    const blocks: LegacyBlock[] = [{ kind: "text", content: parsed.text }];
    for (const att of Array.isArray(parsed.attachments) ? parsed.attachments : []) {
      if (att?.dataUrl) {
        blocks.push({ kind: "media", type: att.type ?? "file", name: att.name, dataUrl: att.dataUrl, mimeType: att.mimeType });
      }
    }
    return blocks;
  }
  return null;
}

// ─── Builders ────────────────────────────────────────────────────────────────

function paragraph(text?: string): JSONNode {
  return text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
}

/** Plain text → paragraphs, one per line (blank lines kept as empty paragraphs). */
function textToParagraphs(text: string): JSONNode[] {
  return text.replace(/\r\n/g, "\n").split("\n").map((line) => paragraph(line));
}

function tableNode(rows: string[][]): JSONNode {
  const safeRows = rows.length > 0 ? rows : [[""]];
  return {
    type: "table",
    content: safeRows.map((row) => ({
      type: "tableRow",
      content: (row.length > 0 ? row : [""]).map((cell) => ({
        type: "tableCell",
        content: textToParagraphs(String(cell ?? "")),
      })),
    })),
  };
}

export function imageNode(src: string, opts: { name?: string; layout?: ImageLayout } = {}): JSONNode {
  return { type: "image", attrs: { src, alt: opts.name ?? null, title: null, layout: opts.layout ?? "full", name: opts.name ?? null } };
}

export function attachmentNode(kind: AttachmentKind, src: string, name: string, mimeType?: string): JSONNode {
  return { type: "attachment", attrs: { kind, src, name, mimeType: mimeType ?? null } };
}

function legacyToDoc(blocks: LegacyBlock[]): JSONNode {
  const content: JSONNode[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b) continue;

    if (b.kind === "text") {
      content.push(...textToParagraphs(b.content ?? ""));
      continue;
    }

    if (b.kind === "table") {
      if (Array.isArray(b.rows)) content.push(tableNode(b.rows));
      continue;
    }

    if (b.kind === "media") {
      if (b.type === "image") {
        // Old editor laid consecutive non-full images side by side; keep that look.
        const group: LegacyMediaBlock[] = [];
        let j = i;
        while (j < blocks.length) {
          const g = blocks[j];
          if (g && g.kind === "media" && g.type === "image" && g.layout !== "full") {
            group.push(g);
            j++;
          } else break;
        }
        if (group.length === 0) {
          content.push(imageNode(b.dataUrl, { name: b.name, layout: "full" }));
          continue;
        }
        const autoLayout: ImageLayout = group.length === 1 ? "full" : group.length === 2 ? "half" : "third";
        for (const g of group) {
          const layout: ImageLayout = g.layout === "half" || g.layout === "third" ? g.layout : autoLayout;
          content.push(imageNode(g.dataUrl, { name: g.name, layout }));
        }
        i = j - 1;
        continue;
      }
      content.push(attachmentNode(b.type, b.dataUrl, b.name ?? "Attachment", b.mimeType));
    }
  }

  // Trim trailing empty paragraphs the old editor added after media, keep at least one.
  while (content.length > 1) {
    const last = content[content.length - 1];
    const prev = content[content.length - 2];
    if (last.type === "paragraph" && !last.content && prev.type === "paragraph" && !prev.content) content.pop();
    else break;
  }
  if (content.length === 0) content.push(paragraph());
  return { type: "doc", content };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function emptyDoc(): JSONNode {
  return { type: "doc", content: [paragraph()] };
}

/** Parse stored page content (any version) into an editor document. */
export function parseNotebookContent(raw: string | null | undefined): JSONNode {
  if (!raw || !raw.trim()) return emptyDoc();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 3 && parsed.doc && parsed.doc.type === "doc") {
      return parsed.doc as JSONNode;
    }
    const legacy = legacyBlocksFromRaw(parsed);
    if (legacy) return legacyToDoc(legacy);
    if (typeof parsed === "string") return { type: "doc", content: textToParagraphs(parsed) };
  } catch {
    /* not JSON → plain text */
  }
  return { type: "doc", content: textToParagraphs(raw) };
}

export function serializeNotebookContent(doc: JSONNode): string {
  return JSON.stringify({ version: 3, doc });
}

export function emptyPageContent(): string {
  return serializeNotebookContent(emptyDoc());
}

const BLOCK_TYPES = new Set([
  "paragraph", "heading", "blockquote", "codeBlock", "listItem", "taskItem", "tableCell", "tableHeader", "tableRow",
]);

function walk(node: JSONNode, visit: (n: JSONNode) => void) {
  visit(node);
  node.content?.forEach((c) => walk(c, visit));
}

/** Plain-text version of a page (for previews, search and AI context). */
export function notebookPlainText(raw: string | null | undefined): string {
  const doc = parseNotebookContent(raw);
  const parts: string[] = [];
  const collect = (n: JSONNode) => {
    if (n.type === "text" && n.text) parts.push(n.text);
    else if (n.type === "hardBreak") parts.push(" ");
    n.content?.forEach(collect);
    if (BLOCK_TYPES.has(n.type)) parts.push(" ");
  };
  collect(doc);
  return parts.join("").replace(/\s+/g, " ").trim();
}

export function notebookPreview(raw: string | null | undefined): { text: string; firstImage?: string; mediaCount: number } {
  const doc = parseNotebookContent(raw);
  let firstImage: string | undefined;
  let mediaCount = 0;
  walk(doc, (n) => {
    if (n.type === "image" || n.type === "attachment") {
      mediaCount++;
      if (!firstImage && n.type === "image" && typeof n.attrs?.src === "string") firstImage = n.attrs.src as string;
    }
  });
  return { text: notebookPlainText(raw), firstImage, mediaCount };
}

/** Readable text for any item (notebook pages are converted from their JSON content). */
export function itemText(item: { type: string; content: string | null }): string {
  return item.type === "notebook_page" ? notebookPlainText(item.content) : item.content ?? "";
}
