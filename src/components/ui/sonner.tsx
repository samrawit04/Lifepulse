import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * App-wide toasts, styled like the app's dialogs (e.g. the "Name your new page"
 * wizard): a clean card with a bold title and muted description — no icons.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="bottom-center"
      className="toaster group"
      style={{ "--width": "380px" } as React.CSSProperties}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-card-foreground shadow-2xl font-sans",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: "font-display text-sm font-bold text-foreground leading-snug",
          description: "text-xs text-muted-foreground leading-relaxed",
          icon: "hidden",
          error: "border-destructive/40",
          actionButton:
            "shrink-0 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90",
          cancelButton:
            "shrink-0 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
