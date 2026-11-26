import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ─── Emoji Picker ──────────────────────────────────────────────────────────────

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  { label: "Smileys", emojis: ["😀","😄","😂","🤣","😊","😍","🥰","😘","😎","🤩","😜","🤪","😏","😒","😔","😢","😭","😤","😠","🤯","😱","😨","🥶","🤔","🤗","🫡","😴","🤐","🥳","🥺"] },
  { label: "Nature", emojis: ["🌸","🌺","🌻","🌹","🌷","🍀","🌿","🍃","🌱","🌲","🌳","🌴","🍄","🌾","🌊","🌈","☀️","🌙","⭐","❄️","🔥","💧","🌍","🌺","🦋","🐝","🦄","🐶","🐱","🦊"] },
  { label: "Food", emojis: ["🍕","🍔","🌮","🍜","🍣","🍦","🎂","🍩","🍎","🍓","🍇","☕","🍵","🧃","🍺","🥂","🥑","🥦","🍋","🍊","🍉","🍒","🍑","🥐","🧇","🥗","🍱","🍿","🥜","🫙"] },
  { label: "Activities", emojis: ["⚽","🏀","🎮","🎵","🎨","📚","✈️","🚀","🏆","🎯","🎲","🎭","🎤","🎸","🎹","📸","🎬","🏋️","🚴","🧘","⛷️","🏄","🎪","🎠","🎡","🎢","🎃","🎄","🎉","🎊"] },
  { label: "Objects", emojis: ["💡","🔑","💎","📱","💻","🖥️","📷","🎙️","📝","📌","📎","✏️","🖊️","🔒","🔓","💰","💳","🎁","🛍️","🧳","⏰","📅","🗂️","📊","🔬","🔭","⚙️","🧲","💊","🏥"] },
  { label: "Symbols", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","💕","💖","✨","⚡","💫","🌟","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","✅","❌","⭕","💯","🔔","💬","👍"] },
];

export function EmojiPicker({ anchorEl, onSelect, onClose }: { anchorEl: HTMLElement; onSelect: (emoji: string) => void; onClose: () => void }) {
  const [activeCategory, setActiveCategory] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const rect = anchorEl.getBoundingClientRect();
    const pickerWidth = 288; // w-72 = 18rem = 288px
    const pickerHeight = 240;
    const left = Math.max(8, Math.min(rect.right - pickerWidth, window.innerWidth - pickerWidth - 8));
    const top = rect.top - pickerHeight - 8;
    setPos({ top: Math.max(8, top), left });
  }, [anchorEl]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, anchorEl]);

  if (!pos) return null;

  return (
    <div
      ref={ref}
      style={{ top: pos.top, left: pos.left }}
      className="fixed w-72 rounded-2xl border border-white/10 bg-[#1a1e1a]/98 dark:bg-[#1a1e1a]/98 backdrop-blur-xl shadow-2xl z-[9999] overflow-hidden"
    >
      <div className="flex border-b border-white/[0.07] overflow-x-auto scrollbar-none">
        {EMOJI_CATEGORIES.map((cat, i) => (
          <button
            key={i}
            onMouseDown={(e) => { e.preventDefault(); setActiveCategory(i); }}
            className={cn(
              "shrink-0 px-3 py-2 text-[10px] font-medium whitespace-nowrap transition-colors",
              activeCategory === i
                ? "text-primary border-b-2 border-primary -mb-px"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <div className="p-2 grid grid-cols-8 gap-0.5 max-h-48 overflow-y-auto">
        {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, i) => (
          <button
            key={i}
            onMouseDown={(e) => { e.preventDefault(); onSelect(emoji); }}
            className="h-8 w-8 flex items-center justify-center text-lg rounded-lg hover:bg-white/10 transition-colors"
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
