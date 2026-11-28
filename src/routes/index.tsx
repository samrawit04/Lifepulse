import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { apiClient } from "@/integrations/api/client";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  LayoutDashboard,
  Lock,
  Menu,
  NotebookText,
  Search,
  Smartphone,
  StickyNote,
  Wallet,
  X,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "LifePulse · Your whole life, in one calm workspace" },
      {
        name: "description",
        content:
          "Notes, tasks, calendar, budget, books and an AI assistant that knows your week. LifePulse replaces the six apps you juggle every day.",
      },
    ],
  }),
});

// ─── Small helpers ───────────────────────────────────────────────────────────

/** Fades/slides children in the first time they scroll into view. */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100",
        className
      )}
    >
      {children}
    </div>
  );
}

function PrimaryCta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Link
      to="/auth"
      search={{ mode: "signup" }}
      className={cn(
        "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[0_10px_40px_-10px_var(--primary)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_50px_-12px_var(--primary)]",
        className
      )}
    >
      <span className="lp-shine pointer-events-none absolute inset-0" />
      <span className="relative">{children}</span>
      <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

const FEATURES_MARQUEE = [
  "Sticky notes", "Rich notebooks", "Kanban tasks", "Calendar", "Budget & income", "Debt tracking",
  "AI weekly review", "Smart reminders", "Watch & learn", "Free books", "Voice notes", "Works on your phone",
];

const FAQ = [
  {
    q: "Is LifePulse free?",
    a: "Yes. You can create an account and use every feature for free. No credit card needed.",
  },
  {
    q: "Where is my data stored?",
    a: "In a private database tied to your account, not in your browser. Sign in on any device and everything is there.",
  },
  {
    q: "What does the AI assistant know about me?",
    a: "Only what you keep in LifePulse: your tasks, notes, events and spending. It uses that to plan your day, review your week and answer questions. It remembers your past chats so you don't have to repeat yourself.",
  },
  {
    q: "Does it work on my phone?",
    a: "Yes. Every page is built to work on small screens, from the notebook editor to the budget.",
  },
  {
    q: "Can I bring my notes from somewhere else?",
    a: "Paste them in. Headings, bold text, lists and tables keep their formatting.",
  },
];

// ─── Page ────────────────────────────────────────────────────────────────────

function Landing() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!checked) return <div className="min-h-screen bg-background" />;

  const nav = [
    { href: "#features", label: "Features" },
    { href: "#ai", label: "AI assistant" },
    { href: "#how", label: "How it works" },
    { href: "#faq", label: "FAQ" },
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <LandingStyles />

      {/* Background: soft aurora + grid */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[1100px] overflow-hidden">
        <div className="lp-blob absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-primary/25 blur-[120px]" />
        <div className="lp-blob lp-blob-2 absolute -right-32 top-20 h-[460px] w-[460px] rounded-full bg-emerald-300/15 blur-[120px]" />
        <div className="lp-blob lp-blob-3 absolute left-1/3 top-[420px] h-[380px] w-[380px] rounded-full bg-teal-400/15 blur-[120px]" />
        <div className="lp-grid absolute inset-0" />
      </div>

      {/* Nav */}
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300",
          scrolled ? "border-b border-border/60 bg-background/75 backdrop-blur-xl" : "bg-transparent"
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-xl border border-white/10 object-cover" />
            <span className="font-display text-lg font-semibold">LifePulse</span>
          </a>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className="rounded-full px-3.5 py-2 text-sm text-muted-foreground transition hover:text-foreground">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="hidden rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground sm:inline-flex">
              Sign in
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="hidden rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 sm:inline-flex"
            >
              Get started
            </Link>
            <button onClick={() => setMenuOpen((v) => !v)} className="grid h-10 w-10 place-items-center rounded-full md:hidden" aria-label="Menu">
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="border-t border-border/60 bg-background/95 px-5 pb-5 pt-2 backdrop-blur-xl md:hidden">
            {nav.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-3 text-base text-foreground">
                {n.label}
              </a>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link to="/auth" className="rounded-full border border-border px-4 py-2.5 text-center text-sm font-medium">Sign in</Link>
              <Link to="/auth" search={{ mode: "signup" }} className="rounded-full bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground">
                Get started
              </Link>
            </div>
          </div>
        )}
      </header>

      <main id="top" className="relative">
        {/* ── Hero ── */}
        <section className="mx-auto max-w-6xl px-5 pb-10 pt-32 text-center sm:px-6 sm:pt-40">
          <Reveal>
            <a href="#ai" className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 py-1 pl-1 pr-3 text-xs font-medium text-foreground transition hover:bg-primary/15">
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">New</span>
              Your AI now reviews your week
              <ArrowRight className="h-3 w-3" />
            </a>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mx-auto mt-6 max-w-4xl font-display text-[2.6rem] font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Your whole life,
              <br />
              <span className="lp-gradient-text">in one calm workspace.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Notes, tasks, calendar, money and books, with an AI assistant that actually knows your week.
              Stop switching between six apps. Start getting things done.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <PrimaryCta>Start free</PrimaryCta>
              <a href="#features" className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-6 py-3 text-sm font-semibold backdrop-blur transition hover:bg-muted">
                See what's inside
              </a>
            </div>
            <p className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Free to use</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> No credit card</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Sign in with Google</span>
            </p>
          </Reveal>

          <Reveal delay={320} className="relative mx-auto mt-16 max-w-5xl">
            <HeroMockup />
          </Reveal>
        </section>

        {/* ── Marquee ── */}
        <section aria-label="Everything included" className="relative border-y border-border/60 bg-muted/20 py-5">
          <div className="lp-marquee-mask overflow-hidden">
            <div className="lp-marquee flex w-max gap-10">
              {[...FEATURES_MARQUEE, ...FEATURES_MARQUEE].map((f, i) => (
                <span key={i} className="flex items-center gap-2 whitespace-nowrap text-sm font-medium text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {f}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Problem → solution ── */}
        <section className="mx-auto max-w-6xl px-5 py-24 sm:px-6">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">One app instead of six</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl">
              Your day is scattered. <span className="text-muted-foreground">It doesn't have to be.</span>
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-4 md:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-3xl border border-border bg-card/40 p-6 sm:p-8">
                <p className="text-sm font-semibold text-muted-foreground">Before</p>
                <ul className="mt-5 space-y-3">
                  {["A notes app for ideas", "A to-do app for tasks", "A calendar for meetings", "A spreadsheet for money", "A reading app for books", "A chatbot that knows nothing about you"].map((t) => (
                    <li key={t} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <X className="h-4 w-4 shrink-0 text-destructive/70" />
                      <span className="line-through decoration-muted-foreground/40">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="relative h-full overflow-hidden rounded-3xl border border-primary/30 bg-primary/[0.06] p-6 sm:p-8">
                <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-primary/20 blur-3xl" />
                <p className="relative text-sm font-semibold text-primary">With LifePulse</p>
                <ul className="relative mt-5 space-y-3">
                  {["Every note, task and event in one place", "Budget, income and debts next to your plans", "Reminders before things are due", "Free books to read right in the app", "An assistant that knows your week", "Synced on every device"].map((t) => (
                    <li key={t} className="flex items-center gap-3 text-sm text-foreground">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Bento features ── */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-24 sm:px-6">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Features</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl">Everything you need. Nothing you don't.</h2>
            <p className="mt-4 text-muted-foreground">Tools that share one brain, so your notes know about your tasks and your budget knows about your plans.</p>
          </Reveal>

          <div className="mt-14 grid gap-4 md:grid-cols-6">
            <Bento className="md:col-span-4" icon={NotebookText} title="Notebooks that feel like paper" text="Rich pages with headings, tables, checklists, photos, voice notes and video. Paste from anywhere and the formatting stays.">
              <NotebookArt />
            </Bento>
            <Bento className="md:col-span-2" icon={StickyNote} title="A sticky board" text="Drop a thought anywhere. Drag, color and pin it.">
              <StickyArt />
            </Bento>
            <Bento className="md:col-span-2" icon={CheckCircle2} title="Tasks that move" text="Board or list, with priorities, time blocks and sub-tasks.">
              <TasksArt />
            </Bento>
            <Bento className="md:col-span-2" icon={CalendarDays} title="Your week at a glance" text="Events and time blocks with a live now-line.">
              <CalendarArt />
            </Bento>
            <Bento className="md:col-span-2" icon={Wallet} title="Money, sorted" text="Spending, income, budgets and who owes whom.">
              <MoneyArt />
            </Bento>
            <Bento className="md:col-span-3" icon={Clapperboard} title="Watch to grow" text="Podcasts, talks and documentaries picked around the topics you choose.">
              <WatchArt />
            </Bento>
            <Bento className="md:col-span-3" icon={BookOpen} title="Books to read" text="Free classics in a built-in reader, and shelves to save books for later.">
              <BooksArt />
            </Bento>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              { icon: Bell, t: "Smart reminders", d: "A heads-up before tasks, events and budgets need you." },
              { icon: Smartphone, t: "Made for your phone", d: "Every page works on small screens, not just the dashboard." },
              { icon: Lock, t: "Private by default", d: "Your data lives in your account, never in a shared space." },
            ].map(({ icon: Icon, t, d }, i) => (
              <Reveal key={t} delay={i * 80}>
                <div className="flex h-full gap-4 rounded-2xl border border-border bg-card/40 p-5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{t}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── AI spotlight ── */}
        <section id="ai" className="relative scroll-mt-20 overflow-hidden border-y border-border/60 bg-muted/20 py-24">
          <div aria-hidden className="pointer-events-none absolute right-0 top-1/2 h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-primary/15 blur-[120px]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-6 lg:grid-cols-2">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">AI assistant</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl">An assistant that has read your week.</h2>
              <p className="mt-5 text-muted-foreground">
                Ask what to focus on, whether you're overspending, or what you promised someone on Tuesday. It sees your tasks, notes, events
                and budget, and it remembers your past conversations.
              </p>
              <ul className="mt-7 space-y-3 text-sm">
                {["Weekly review with honest, specific feedback", "Plans your day around what's due", "Remembers past chats across devices", "Full-screen mode when you want to think"].map((t) => (
                  <li key={t} className="flex items-center gap-3">
                    <Zap className="h-4 w-4 shrink-0 text-primary" /> {t}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <PrimaryCta>Try the assistant</PrimaryCta>
              </div>
            </Reveal>
            <Reveal delay={150}>
              <ChatMock />
            </Reveal>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24 sm:px-6">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">How it works</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl">Up and running in a minute.</h2>
          </Reveal>
          <div className="relative mt-14 grid gap-6 md:grid-cols-3">
            <div aria-hidden className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
            {[
              { n: "1", t: "Create your account", d: "Sign up with Google or email. It's free." },
              { n: "2", t: "Drop in your life", d: "Add tasks, paste notes, log what you spend. Everything lands in one place." },
              { n: "3", t: "Let it work for you", d: "Get reminders, a clear dashboard every morning and a weekly review from your assistant." },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 120}>
                <div className="relative text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-primary/30 bg-background font-display text-xl font-semibold text-primary shadow-[0_0_0_6px_var(--background)]">
                    {s.n}
                  </div>
                  <h3 className="mt-5 font-display text-lg font-semibold">{s.t}</h3>
                  <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 pb-24 sm:px-6">
          <Reveal className="text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Questions, answered</h2>
          </Reveal>
          <div className="mt-10 divide-y divide-border rounded-3xl border border-border bg-card/40">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 sm:px-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-sm font-semibold sm:text-base [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="-mt-1 pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2rem] border border-primary/30 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent px-6 py-16 text-center sm:px-12 sm:py-20">
              <div aria-hidden className="lp-grid absolute inset-0 opacity-60" />
              <div aria-hidden className="lp-blob absolute -bottom-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/30 blur-[90px]" />
              <div className="relative">
                <h2 className="mx-auto max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-5xl">Give your days a calmer rhythm.</h2>
                <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Set up your workspace in a minute. Your future self will thank you.</p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <PrimaryCta>Create your free workspace</PrimaryCta>
                  <Link to="/auth" className="text-sm font-medium text-muted-foreground hover:text-foreground">I already have an account</Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-6 w-6 rounded-lg object-cover" />
            <span className="font-display font-semibold text-foreground">LifePulse</span>
            <span>· {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
            <Link to="/auth" className="hover:text-foreground">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Hero product mockup ─────────────────────────────────────────────────────

function HeroMockup() {
  return (
    <div className="relative">
      <div aria-hidden className="absolute -inset-x-10 -bottom-10 top-10 rounded-[3rem] bg-primary/20 blur-3xl" />
      <div className="lp-tilt relative overflow-hidden rounded-2xl border border-white/10 bg-card/90 text-left shadow-2xl backdrop-blur-xl sm:rounded-3xl">
        <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          <div className="mx-auto flex h-6 w-56 items-center justify-center gap-1.5 rounded-md bg-muted/60 text-[10px] text-muted-foreground">
            <Lock className="h-2.5 w-2.5" /> lifepulse.app/dashboard
          </div>
        </div>
        <div className="grid grid-cols-[150px_1fr] sm:grid-cols-[190px_1fr]">
          <aside className="hidden border-r border-border/70 p-3 sm:block">
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-1.5 text-[10px] text-muted-foreground">
              <Search className="h-3 w-3" /> Search everything
            </div>
            {[
              { i: LayoutDashboard, l: "Dashboard", a: true },
              { i: StickyNote, l: "Sticky Notes" },
              { i: NotebookText, l: "Notebooks" },
              { i: CalendarDays, l: "Calendar" },
              { i: CheckCircle2, l: "Tasks" },
              { i: Wallet, l: "Expenses" },
              { i: Clapperboard, l: "Watch" },
              { i: BookOpen, l: "Books" },
            ].map(({ i: I, l, a }) => (
              <div key={l} className={cn("mb-0.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px]", a ? "bg-primary/15 font-semibold text-foreground" : "text-muted-foreground")}>
                <I className={cn("h-3.5 w-3.5", a && "text-primary")} /> {l}
              </div>
            ))}
          </aside>
          <div className="col-span-2 p-4 sm:col-span-1 sm:p-6">
            <p className="text-[10px] text-muted-foreground sm:text-xs">Monday, March 9</p>
            <p className="font-display text-lg font-semibold sm:text-2xl">
              Good morning, <span className="text-primary">Sara</span>
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              {[
                ["Open tasks", "8"],
                ["Events today", "3"],
                ["Spent this week", "2,140"],
                ["Notes", "46"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-border/70 bg-background/40 p-2.5 sm:p-3">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</p>
                  <p className="mt-0.5 font-display text-base font-semibold sm:text-xl">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1.3fr_1fr]">
              <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                <p className="mb-2 text-[11px] font-semibold">Today</p>
                {[
                  ["Send proposal to Lina", "high", true],
                  ["Gym · 6:00 PM", "medium", false],
                  ["Review March budget", "low", false],
                ].map(([t, p, done]) => (
                  <div key={t as string} className="flex items-center gap-2 border-b border-border/50 py-1.5 text-[11px] last:border-0">
                    <span className={cn("grid h-3.5 w-3.5 place-items-center rounded border", done ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                      {done && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className={cn("flex-1", done && "text-muted-foreground line-through")}>{t}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase",
                        p === "high" ? "bg-destructive/15 text-destructive" : p === "medium" ? "bg-amber-500/15 text-amber-500" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {p}
                    </span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                <p className="mb-2 text-[11px] font-semibold">Spending this week</p>
                <div className="flex h-20 items-end gap-1.5">
                  {[40, 65, 30, 80, 55, 25, 60].map((h, i) => (
                    <div key={i} className="lp-bar flex-1 rounded-t bg-primary/70" style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="lp-float absolute -left-4 top-24 hidden w-48 rotate-[-5deg] rounded-2xl bg-note-yellow p-4 text-left shadow-note md:block lg:-left-14">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-black/55">Idea</p>
        <p className="mt-1 font-display text-sm text-black/85">Turn Friday's notes into a client checklist</p>
      </div>
      <div className="lp-float lp-float-2 absolute -right-4 top-10 hidden w-60 rounded-2xl border border-border bg-card/95 p-3 text-left shadow-2xl backdrop-blur md:block lg:-right-14">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="h-4 w-4" />
          </div>
          <p className="text-xs font-semibold">Weekly review</p>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">You finished 14 of 18 tasks. Mornings are your best focus time, so try moving deep work before noon.</p>
      </div>
      <div className="lp-float lp-float-3 absolute -bottom-6 right-10 hidden items-center gap-2.5 rounded-2xl border border-border bg-card/95 px-3.5 py-2.5 text-left shadow-2xl backdrop-blur sm:flex">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-amber-500/15 text-amber-500">
          <Bell className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-semibold">Team sync in 15 min</p>
          <p className="text-[10px] text-muted-foreground">Calendar · 10:30 AM</p>
        </div>
      </div>
    </div>
  );
}

// ─── Bento card + illustrations ──────────────────────────────────────────────

function Bento({ className, icon: Icon, title, text, children }: { className?: string; icon: typeof Bot; title: string; text: string; children: ReactNode }) {
  return (
    <Reveal className={cn("h-full", className)}>
      <div className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card/50 p-6 transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_20px_60px_-25px_var(--primary)]">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <h3 className="font-display text-base font-semibold">{title}</h3>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{text}</p>
        <div className="mt-5 flex-1">{children}</div>
      </div>
    </Reveal>
  );
}

function NotebookArt() {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
      <div className="mb-3 flex gap-1.5">
        {["B", "I", "U", "H1", "List", "Table"].map((t) => (
          <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{t}</span>
        ))}
      </div>
      <p className="font-display text-base font-semibold">Q2 planning</p>
      <p className="mt-1 text-xs text-muted-foreground">Goals for the next three months, in priority order.</p>
      <div className="mt-3 overflow-hidden rounded-lg border border-border/70 text-[11px]">
        {[["Goal", "Owner", "Due"], ["Launch new site", "Me", "Apr 30"], ["Hire designer", "Lina", "May 15"]].map((r, i) => (
          <div key={i} className={cn("grid grid-cols-3 border-b border-border/60 last:border-0", i === 0 && "bg-muted/60 font-semibold")}>
            {r.map((c) => <span key={c} className="px-2.5 py-1.5">{c}</span>)}
          </div>
        ))}
      </div>
    </div>
  );
}

function StickyArt() {
  return (
    <div className="relative h-36">
      <div className="lp-float absolute left-2 top-2 w-28 rotate-[-6deg] rounded-xl bg-note-pink p-2.5 text-[11px] text-black/80 shadow-note">Call mom on Sunday</div>
      <div className="lp-float lp-float-2 absolute right-2 top-6 w-28 rotate-[5deg] rounded-xl bg-note-blue p-2.5 text-[11px] text-black/80 shadow-note">Book flights</div>
      <div className="lp-float lp-float-3 absolute bottom-0 left-10 w-32 rotate-[-2deg] rounded-xl bg-note-yellow p-2.5 text-[11px] text-black/80 shadow-note">Read 20 pages a day</div>
    </div>
  );
}

function TasksArt() {
  return (
    <div className="grid grid-cols-2 gap-2 text-[10px]">
      {[["To do", ["Write intro", "Pay rent"]], ["Done", ["Plan week"]]].map(([col, items]) => (
        <div key={col as string} className="rounded-xl border border-border/70 bg-background/50 p-2">
          <p className="mb-1.5 font-semibold text-muted-foreground">{col as string}</p>
          {(items as string[]).map((t) => (
            <div key={t} className={cn("mb-1 rounded-lg border border-border/60 bg-card px-2 py-1.5", col === "Done" && "text-muted-foreground line-through")}>{t}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CalendarArt() {
  return (
    <div className="relative grid h-32 grid-cols-5 gap-1 rounded-xl border border-border/70 bg-background/50 p-2">
      {["M", "T", "W", "T", "F"].map((d, i) => (
        <div key={i} className="relative rounded-md bg-muted/40">
          <span className="absolute left-1 top-0.5 text-[9px] text-muted-foreground">{d}</span>
          {i === 1 && <div className="absolute inset-x-0.5 top-6 h-8 rounded bg-primary/60" />}
          {i === 3 && <div className="absolute inset-x-0.5 top-12 h-10 rounded bg-amber-400/60" />}
          {i === 0 && <div className="absolute inset-x-0.5 top-16 h-6 rounded bg-sky-400/60" />}
        </div>
      ))}
      <div className="lp-nowline pointer-events-none absolute inset-x-2 top-[58%] h-px bg-red-500">
        <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
      </div>
    </div>
  );
}

function MoneyArt() {
  return (
    <div className="space-y-2 text-[11px]">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border/70 bg-background/50 p-2.5">
          <p className="text-muted-foreground">Income</p>
          <p className="font-display text-sm font-semibold text-emerald-500">+25,000</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/50 p-2.5">
          <p className="text-muted-foreground">Spent</p>
          <p className="font-display text-sm font-semibold">12,480</p>
        </div>
      </div>
      <div className="rounded-xl border border-border/70 bg-background/50 p-2.5">
        <div className="flex justify-between"><span>Food</span><span className="text-muted-foreground">68%</span></div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="lp-grow h-full rounded-full bg-primary" style={{ width: "68%" }} /></div>
      </div>
    </div>
  );
}

function WatchArt() {
  return (
    <div className="flex gap-2 overflow-hidden">
      {["Documentaries", "Learning", "Podcasts", "Focus music"].map((t, i) => (
        <div key={t} className="w-36 shrink-0">
          <div className="relative aspect-video overflow-hidden rounded-xl" style={{ background: `linear-gradient(135deg, oklch(0.6 0.12 ${150 + i * 30}), oklch(0.35 0.08 ${180 + i * 30}))` }}>
            <div className="absolute inset-0 grid place-items-center">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-white/90">
                <div className="ml-0.5 h-0 w-0 border-y-[6px] border-l-[9px] border-y-transparent border-l-black/80" />
              </div>
            </div>
          </div>
          <p className="mt-1.5 truncate text-[11px] font-medium">{t}</p>
        </div>
      ))}
    </div>
  );
}

function BooksArt() {
  const books = [
    ["Meditations", "Marcus Aurelius", 160],
    ["The Art of War", "Sun Tzu", 30],
    ["Walden", "Thoreau", 220],
    ["As a Man Thinketh", "James Allen", 280],
  ] as const;
  return (
    <div className="flex gap-3 overflow-hidden">
      {books.map(([t, a, hue]) => (
        <div
          key={t}
          className="relative flex aspect-[2/3] w-24 shrink-0 flex-col justify-between overflow-hidden rounded-md p-2.5 text-center shadow-[0_6px_18px_-6px_rgba(0,0,0,.5)]"
          style={{ background: `linear-gradient(155deg, oklch(0.42 0.09 ${hue}), oklch(0.27 0.06 ${(hue + 25) % 360}))` }}
        >
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/35 to-transparent" />
          <div className="pointer-events-none absolute inset-[6%] rounded-sm border border-white/25" />
          <p className="relative mt-4 text-[11px] font-semibold leading-snug text-white" style={{ fontFamily: "Georgia, serif" }}>{t}</p>
          <p className="relative text-[7px] uppercase tracking-widest text-white/70">{a}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Chat mock with typing animation ─────────────────────────────────────────

const CHAT_REPLY =
  "You have 3 things due today. Start with the proposal for Lina (high priority, due at 2 PM), then the budget review. You've spent 68% of your food budget with 10 days left, so maybe cook at home this week.";

function ChatMock() {
  const ref = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState(0);
  const [start, setStart] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setStart(true), { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!start) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setTyped(CHAT_REPLY.length);
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i += 2;
      setTyped(Math.min(i, CHAT_REPLY.length));
      if (i >= CHAT_REPLY.length) window.clearInterval(id);
    }, 22);
    return () => window.clearInterval(id);
  }, [start]);

  return (
    <div ref={ref} className="overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
      <div className="flex items-center gap-2.5 bg-gradient-to-r from-emerald-700 to-emerald-500 px-4 py-3 text-white">
        <div className="grid h-8 w-8 place-items-center rounded-xl bg-white/20">
          <Bot className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">LifePulse AI</p>
          <p className="text-[10px] text-white/80">{typed < CHAT_REPLY.length && start ? "Thinking…" : "Knows your week"}</p>
        </div>
      </div>
      <div className="space-y-3 bg-muted/30 p-4 sm:p-5">
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-emerald-600 px-3.5 py-2.5 text-sm text-white">What should I focus on today?</div>
        </div>
        <div className="flex gap-2">
          <div className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <div className="min-h-[96px] max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5 text-sm leading-relaxed">
            {CHAT_REPLY.slice(0, typed)}
            {typed < CHAT_REPLY.length && <span className="lp-caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-primary" />}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {["Review my week", "Am I spending too much?", "Summarize my notes"].map((s) => (
            <span key={s} className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground">{s}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Animations (scoped to the landing page) ─────────────────────────────────

function LandingStyles() {
  return (
    <style>{`
      .lp-gradient-text {
        background: linear-gradient(100deg, var(--primary), oklch(0.85 0.12 140), var(--primary));
        background-size: 200% auto;
        -webkit-background-clip: text; background-clip: text; color: transparent;
        animation: lp-gradient 6s linear infinite;
      }
      @keyframes lp-gradient { to { background-position: 200% center; } }

      .lp-grid {
        background-image: linear-gradient(to right, color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 1px),
          linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 1px);
        background-size: 56px 56px;
        mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, #000 40%, transparent 100%);
        -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, #000 40%, transparent 100%);
      }

      .lp-blob { animation: lp-blob 18s ease-in-out infinite; }
      .lp-blob-2 { animation-delay: -6s; animation-duration: 22s; }
      .lp-blob-3 { animation-delay: -12s; animation-duration: 26s; }
      @keyframes lp-blob {
        0%, 100% { transform: translate(0, 0) scale(1); }
        33% { transform: translate(40px, -30px) scale(1.08); }
        66% { transform: translate(-30px, 20px) scale(0.95); }
      }

      .lp-float { animation: lp-float 7s ease-in-out infinite; }
      .lp-float-2 { animation-delay: -2.5s; }
      .lp-float-3 { animation-delay: -5s; }
      @keyframes lp-float {
        0%, 100% { translate: 0 0; }
        50% { translate: 0 -12px; }
      }

      .lp-tilt { transform: perspective(1600px) rotateX(8deg); transform-origin: top center; transition: transform .8s cubic-bezier(.2,.8,.2,1); }
      .lp-tilt:hover { transform: perspective(1600px) rotateX(0deg); }

      .lp-bar { transform-origin: bottom; animation: lp-bar 1.2s cubic-bezier(.2,.8,.2,1) both; }
      @keyframes lp-bar { from { transform: scaleY(0); } }
      .lp-grow { animation: lp-grow 1.6s cubic-bezier(.2,.8,.2,1) both; }
      @keyframes lp-grow { from { width: 0 !important; } }

      .lp-nowline { animation: lp-now 6s ease-in-out infinite alternate; }
      @keyframes lp-now { from { top: 40%; } to { top: 70%; } }

      .lp-marquee { animation: lp-marquee 40s linear infinite; }
      .lp-marquee-mask:hover .lp-marquee { animation-play-state: paused; }
      @keyframes lp-marquee { to { transform: translateX(-50%); } }
      .lp-marquee-mask {
        mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent);
        -webkit-mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent);
      }

      .lp-shine::after {
        content: ""; position: absolute; inset: 0; transform: translateX(-120%);
        background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.35) 50%, transparent 70%);
        animation: lp-shine 3.5s ease-in-out infinite;
      }
      @keyframes lp-shine { 60%, 100% { transform: translateX(120%); } }

      .lp-caret { animation: lp-caret 1s steps(1) infinite; }
      @keyframes lp-caret { 50% { opacity: 0; } }

      @media (prefers-reduced-motion: reduce) {
        .lp-gradient-text, .lp-blob, .lp-float, .lp-bar, .lp-grow, .lp-nowline, .lp-marquee, .lp-shine::after, .lp-caret { animation: none !important; }
        .lp-tilt { transform: none; }
      }
      html { scroll-behavior: smooth; }
    `}</style>
  );
}
