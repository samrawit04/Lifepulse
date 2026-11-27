import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "@/integrations/api/client";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Bot,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  NotebookText,
  StickyNote,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "LifePulse · Notes, tasks, money and more in one place" },
      {
        name: "description",
        content: "LifePulse keeps your notes, tasks, calendar, budget, books and an AI assistant in one simple workspace.",
      },
    ],
  }),
});

const FEATURES = [
  { icon: NotebookText, title: "Notes & notebooks", text: "Write pages with tables, checklists, photos and voice notes. Sticky notes for quick thoughts." },
  { icon: CheckCircle2, title: "Tasks", text: "See what's active, what's next and what's done. Pin what's urgent." },
  { icon: CalendarDays, title: "Calendar", text: "Plan your week with events and the tasks you choose to schedule." },
  { icon: Wallet, title: "Money", text: "Log spending, income and debts. Set budgets and see where your money goes." },
  { icon: BookOpen, title: "Books & videos", text: "Read free classics, save reading lists and watch podcasts on topics you pick." },
  { icon: Bot, title: "AI assistant", text: "Ask what to focus on or get a weekly review. It knows your tasks, notes and budget." },
];

function Landing() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiClient.auth.getUser().then((user) => {
      if (!mounted) return;
      if (user) navigate({ to: "/dashboard", replace: true });
      else setChecked(true);
    });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (!checked) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <style>{`
        @keyframes lp-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        .lp-in { animation: lp-in .6s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .lp-in { animation: none; } }
      `}</style>

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-xl border border-white/10 object-cover" />
            <span className="font-display text-lg font-semibold">LifePulse</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link to="/auth" className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
              Sign in
            </Link>
            <Link to="/auth" search={{ mode: "signup" }} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/15 blur-[110px]" />
          <div className="relative mx-auto max-w-3xl px-5 pb-14 pt-20 text-center sm:pt-28">
            <h1 className="lp-in font-display text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
              Your day, in one <span className="text-primary">calm</span> place.
            </h1>
            <p className="lp-in mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg" style={{ animationDelay: "80ms" }}>
              Notes, tasks, calendar and money together, with an assistant that helps you plan. No more jumping between apps.
            </p>
            <div className="lp-in mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ animationDelay: "160ms" }}>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:-translate-y-0.5"
              >
                Start for free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link to="/auth" className="text-sm font-medium text-muted-foreground hover:text-foreground">
                I already have an account
              </Link>
            </div>
            <p className="lp-in mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground" style={{ animationDelay: "220ms" }}>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Free</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Works on your phone</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Sign in with Google</span>
            </p>
          </div>

          {/* A quiet look at the app */}
          <div className="lp-in relative mx-auto max-w-4xl px-5 pb-20" style={{ animationDelay: "300ms" }}>
            <AppPreview />
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border/50 bg-muted/20">
          <div className="mx-auto max-w-5xl px-5 py-20">
            <h2 className="text-center font-display text-3xl font-semibold tracking-tight sm:text-4xl">Everything in one app</h2>
            <p className="mx-auto mt-3 max-w-lg text-center text-muted-foreground">Simple tools that work together, so your plans, notes and money stay connected.</p>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl border border-border bg-card/60 p-6 transition hover:border-primary/40">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-3xl px-5 py-20 text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Ready when you are.</h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">Create your workspace in a minute. It's free.</p>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="group mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:-translate-y-0.5"
          >
            Get started
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </section>
      </main>

      <footer className="border-t border-border/50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-5 w-5 rounded-md object-cover" />
            LifePulse · {new Date().getFullYear()}
          </span>
          <Link to="/auth" className="hover:text-foreground">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}

function AppPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
      </div>
      <div className="grid gap-4 p-4 text-left sm:grid-cols-[1.4fr_1fr] sm:p-6">
        <div>
          <p className="text-xs text-muted-foreground">Monday, March 9</p>
          <p className="font-display text-xl font-semibold">
            Good morning, <span className="text-primary">Sara</span>
          </p>
          <div className="mt-4 rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Active tasks</p>
            {[
              ["Send proposal to Lina", true],
              ["Gym at 6:00 PM", false],
              ["Review March budget", false],
            ].map(([t, done]) => (
              <div key={t as string} className="flex items-center gap-2.5 border-b border-border/60 py-2 text-sm last:border-0">
                <span className={cn("grid h-4 w-4 place-items-center rounded border", done ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {done && <Check className="h-3 w-3" />}
                </span>
                <span className={cn(done && "text-muted-foreground line-through")}>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground">Spent this month</p>
            <p className="font-display text-lg font-semibold">12,480 Birr</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-2/3 rounded-full bg-primary" />
            </div>
          </div>
          <div className="rounded-xl bg-note-yellow p-3 text-sm text-black/80 shadow-note">Call the insurer before Friday</div>
          <div className="flex items-start gap-2 rounded-xl border border-border p-3">
            <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs leading-relaxed text-muted-foreground">Start with the proposal, it's due at 2 PM. You're on track with your budget this week.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border p-3 text-xs text-muted-foreground">
            <StickyNote className="h-4 w-4 text-primary" /> 46 notes
          </div>
        </div>
      </div>
    </div>
  );
}
