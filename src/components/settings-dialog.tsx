import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useSidebarPreferences } from "@/hooks/use-sidebar-preferences";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: "dark" | "light";
  onSetTheme: (theme: "dark" | "light") => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  theme,
  onSetTheme,
}: SettingsDialogProps) {
  const { items, isVisible, toggleItem, resetToDefault, showAll } =
    useSidebarPreferences();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-card/95 text-foreground backdrop-blur-2xl shadow-2xl rounded-2xl p-6 max-h-[85vh] flex flex-col">
        <DialogHeader className="text-left shrink-0 pb-1">
          <DialogTitle className="font-display text-lg font-semibold text-foreground">
            Settings
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto py-2 space-y-5 scrollbar-none flex-1">
          {/* Appearance Section */}
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <div>
              <p className="text-sm font-medium text-foreground">Appearance</p>
              <p className="text-xs text-muted-foreground">Select color theme</p>
            </div>

            <div className="w-32 shrink-0">
              <Select value={theme} onValueChange={(val) => onSetTheme(val as "dark" | "light")}>
                <SelectTrigger className="h-8 rounded-lg border-white/10 bg-white/[0.03] text-xs font-medium focus:ring-primary/40">
                  <SelectValue placeholder="Theme" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-white/10 bg-card/95 backdrop-blur-xl">
                  <SelectItem value="dark" className="text-xs font-medium cursor-pointer">
                    Dark
                  </SelectItem>
                  <SelectItem value="light" className="text-xs font-medium cursor-pointer">
                    Light
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sidebar Items Section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between pb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sidebar Navigation
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={showAll}
                  className="hover:text-foreground transition-colors cursor-pointer"
                >
                  Show all
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={resetToDefault}
                  className="hover:text-foreground transition-colors cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="divide-y divide-white/5">
              {items.map((item) => {
                const checked = isVisible(item.to);
                const isLocked = item.required;

                return (
                  <div
                    key={item.to}
                    className="flex items-center justify-between py-2.5 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-foreground font-medium truncate">
                        {item.label}
                      </span>
                      {isLocked && (
                        <span className="text-[10px] text-muted-foreground/60 shrink-0">
                          (Always visible)
                        </span>
                      )}
                    </div>

                    <div className="shrink-0 pl-3">
                      <Switch
                        checked={checked}
                        disabled={isLocked}
                        onCheckedChange={() => toggleItem(item.to)}
                        aria-label={`Toggle ${item.label}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-white/5 flex items-center justify-end shrink-0">
          <Button
            onClick={() => onOpenChange(false)}
            size="sm"
            className="rounded-xl px-5 h-8 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
