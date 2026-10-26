import React from "react";
import { SlidersHorizontal, RotateCcw, Check, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useSidebarPreferences } from "@/hooks/use-sidebar-preferences";
import { cn } from "@/lib/utils";

interface CustomizeSidebarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomizeSidebarDialog({ open, onOpenChange }: CustomizeSidebarDialogProps) {
  const { items, preferences, isVisible, toggleItem, resetToDefault, showAll } =
    useSidebarPreferences();

  const visibleCount = items.filter((item) => isVisible(item.to)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-card/95 text-foreground backdrop-blur-2xl shadow-2xl rounded-3xl p-6 sm:p-7">
        <DialogHeader className="space-y-1.5 text-left">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="font-display text-lg sm:text-xl font-bold tracking-tight text-foreground">
                Customize Sidebar
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Choose which modules and workspaces appear in your sidebar.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Quick Toolbar */}
        <div className="flex items-center justify-between border-y border-white/5 py-2.5 mt-2 text-xs">
          <span className="font-medium text-muted-foreground">
            <span className="text-foreground font-semibold">{visibleCount}</span> of {items.length} visible
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={showAll}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            >
              <Eye className="h-3 w-3" />
              <span>Show all</span>
            </button>
            <button
              onClick={resetToDefault}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Items List */}
        <div className="max-h-[380px] overflow-y-auto space-y-2 py-1 pr-1 scrollbar-thin">
          {items.map((item) => {
            const Icon = item.icon;
            const checked = isVisible(item.to);
            const isLocked = item.required;

            return (
              <div
                key={item.to}
                onClick={() => {
                  if (!isLocked) toggleItem(item.to);
                }}
                className={cn(
                  "group flex items-center justify-between gap-3 rounded-2xl border p-3 transition-all duration-200 select-none",
                  isLocked
                    ? "border-white/5 bg-white/[0.01] opacity-90 cursor-default"
                    : "cursor-pointer border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]",
                  checked && !isLocked && "border-primary/20 bg-primary/[0.03]"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition-colors",
                      checked
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-white/5 bg-white/[0.03] text-muted-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm text-foreground truncate">{item.label}</p>
                      {isLocked && (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Always visible
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  </div>
                </div>

                <div className="shrink-0 pl-2" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={checked}
                    disabled={isLocked}
                    onCheckedChange={() => toggleItem(item.to)}
                    aria-label={`Toggle visibility for ${item.label}`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-2 pt-3 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground text-center sm:text-left leading-tight">
            Hidden items remain accessible via Dashboard & Quick Launch.
          </p>
          <Button
            onClick={() => onOpenChange(false)}
            size="sm"
            className="w-full sm:w-auto rounded-xl px-5 h-8 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
