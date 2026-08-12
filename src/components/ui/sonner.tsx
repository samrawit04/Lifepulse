import { Toaster as Sonner } from "sonner";
import { CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-sidebar/95 group-[.toaster]:text-foreground group-[.toaster]:border-white/10 group-[.toaster]:shadow-[0_16px_40px_-10px_rgba(0,0,0,0.8)] group-[.toaster]:backdrop-blur-xl group-[.toaster]:rounded-2xl group-[.toaster]:p-3.5 group-[.toaster]:gap-3 group-[.toaster]:font-sans",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-xs leading-relaxed",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground font-medium text-xs px-3 py-1.5 rounded-xl transition hover:opacity-90",
          cancelButton:
            "group-[.toast]:bg-white/10 group-[.toast]:text-muted-foreground font-medium text-xs px-3 py-1.5 rounded-xl transition hover:bg-white/15",
          title: "text-xs sm:text-sm font-semibold tracking-tight",
        },
      }}
      icons={{
        success: (
          <div className="grid h-7 w-7 place-items-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        ),
        error: (
          <div className="grid h-7 w-7 place-items-center rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 shrink-0">
            <XCircle className="h-4 w-4" />
          </div>
        ),
        info: (
          <div className="grid h-7 w-7 place-items-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
            <Info className="h-4 w-4" />
          </div>
        ),
        warning: (
          <div className="grid h-7 w-7 place-items-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
            <AlertTriangle className="h-4 w-4" />
          </div>
        ),
      }}
      {...props}
    />
  );
};

export { Toaster };
