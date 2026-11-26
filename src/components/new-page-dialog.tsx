import { useEffect, useState } from "react";
import { FileText, Loader2, NotebookText, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_TITLE = 120;

/**
 * Wizard shown before a notebook page is created, so every page starts with a
 * real name instead of "Untitled".
 */
export function NewPageDialog({
  open,
  onOpenChange,
  notebookName,
  isPending,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notebookName?: string | null;
  isPending?: boolean;
  onCreate: (title: string) => void;
}) {
  const [title, setTitle] = useState("");

  // Fresh field every time the wizard opens
  useEffect(() => {
    if (open) setTitle("");
  }, [open]);

  const trimmed = title.trim();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || isPending) return;
    onCreate(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border border-border bg-card text-card-foreground shadow-2xl rounded-2xl w-[calc(100vw-2rem)] sm:max-w-md p-5 sm:p-6">
        <form onSubmit={submit}>
          <DialogHeader className="text-left">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <DialogTitle className="font-display text-lg font-bold text-foreground">Name your new page</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Give it a clear title so it's easy to find later. You can rename it any time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-5">
            {notebookName && (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
                <NotebookText className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">
                  In <span className="font-semibold text-foreground">{notebookName}</span>
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="new-page-title" className="text-xs font-semibold text-foreground">
                Page name
              </Label>
              <Input
                id="new-page-title"
                value={title}
                maxLength={MAX_TITLE}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Meeting notes – Monday"
                autoFocus
                autoComplete="off"
                className="h-10 rounded-xl border-input bg-background text-sm text-foreground"
              />
              <p className="text-right text-[10px] text-muted-foreground/60">
                {title.length}/{MAX_TITLE}
              </p>
            </div>
          </div>

          <DialogFooter className="flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-xl border-border bg-background text-xs text-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!trimmed || isPending}
              className="h-9 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
              Create page
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
