import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "@/integrations/api/client";
import { Button } from "@/components/ui/button";
import { CalendarDays, StickyNote, NotebookText, CheckCircle2, Sparkles, ArrowRight, Wallet, Music2, Bot } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiClient.auth.getUser().then((user) => {
      if (!mounted) return;
      if (user) {
        navigate({ to: "/dashboard", replace: true });
      } else {
        setChecked(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (!checked) return <div className="min-h-screen bg-cozy-grain" />;

  return (
    <div className="min-h-screen bg-cozy-grain">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="LifePulse Logo" className="h-9 w-9 rounded-xl object-cover border border-white/10" />
          <span className="font-display text-xl font-semibold text-foreground">LifePulse</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/auth">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link to="/auth" search={{ mode: "signup" }}>
            <Button className="bg-primary text-primary-foreground hover:opacity-95 font-medium">
              Get started
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-12">
        <section className="grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl text-foreground">
              Notes, tasks, budget & AI — one calm place for all of it.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              LifePulse brings your notes, tasks, calendar, expenses, music, and AI assistant together in one beautiful workspace.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth" search={{ mode: "signup" }}>
                <Button
                  size="lg"
                  className="group bg-primary text-primary-foreground hover:opacity-95 font-medium"
                >
                  Create your workspace
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="lg" variant="outline" className="border-white/15 bg-white/[0.03] hover:bg-white/[0.06]">
                  I already have an account
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative h-[420px]">
            <div className="glass-card absolute inset-0 rounded-3xl" />
            <div className="pointer-events-none absolute -left-10 top-20 h-40 w-56 rotate-[-6deg] rounded-2xl bg-note-yellow p-4 shadow-note">
              <p className="text-xs font-semibold uppercase tracking-wider text-black/60">Idea</p>
              <p className="mt-2 font-display text-lg text-black/85">
                Sunday Buna ☕ — invite Bethlehem & Yared
              </p>
            </div>
            <div className="pointer-events-none absolute right-4 top-8 h-36 w-52 rotate-[5deg] rounded-2xl bg-note-pink p-4 shadow-note">
              <p className="text-xs font-semibold uppercase tracking-wider text-black/60">Urgent</p>
              <p className="mt-2 font-display text-lg text-black/85">Send Telebirr for electric bill before 3pm</p>
            </div>
            <div className="pointer-events-none absolute bottom-8 left-14 h-32 w-48 rotate-[-2deg] rounded-2xl bg-note-blue p-4 shadow-note">
              <p className="text-xs font-semibold uppercase tracking-wider text-black/60">Reference</p>
              <p className="mt-2 font-display text-lg text-black/85">Enkutatash prep 🌼 · Doro wat recipe</p>
            </div>
            <div className="pointer-events-none absolute bottom-6 right-6 h-32 w-44 rotate-[3deg] rounded-2xl bg-note-lavender p-4 shadow-note">
              <p className="text-xs font-semibold uppercase tracking-wider text-black/60">Later</p>
              <p className="mt-2 font-display text-lg text-black/85">Plan trip to Lalibela ✈️</p>
            </div>
          </div>
        </section>

        <section className="mt-24 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: StickyNote, label: "Sticky Notes", desc: "Colorful draggable notes, always in reach." },
            { icon: NotebookText, label: "Notebooks", desc: "Rich pages with photos, audio, video & attachments." },
            { icon: CheckCircle2, label: "Tasks", desc: "Kanban board with priorities, due dates & folders." },
            { icon: CalendarDays, label: "Calendar", desc: "Plan events and see your week at a glance." },
            { icon: Wallet, label: "Expenses", desc: "Log spending, set budgets, track by category." },
            { icon: Music2, label: "Music & Focus", desc: "YouTube search, ambient presets & playlists." },
            { icon: Bot, label: "AI Assistant", desc: "Gemini-powered chat that knows your data." },
            { icon: Sparkles, label: "Smart Alerts", desc: "Auto-notified on overdue tasks & budget limits." },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="glass-card group relative overflow-hidden rounded-2xl p-5 border border-white/5 bg-white/[0.02] transition-transform hover:-translate-y-0.5">
              <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" strokeWidth={1.75} />
              <h3 className="mt-3 font-display text-base font-semibold text-foreground">{label}</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
