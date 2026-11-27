import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Loader2, Search, ShieldCheck, Users } from "lucide-react";
import { apiClient, type AdminDayCount } from "@/integrations/api/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin · LifePulse" }] }),
});

function AdminPage() {
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => apiClient.admin.stats(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [search, setSearch] = useState("");

  const users = useMemo(() => {
    const all = stats.data?.users ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((u) => u.email.toLowerCase().includes(q) || (u.display_name ?? "").toLowerCase().includes(q));
  }, [stats.data, search]);

  if (stats.isLoading) {
    return (
      <div className="grid h-[60vh] place-items-center text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading admin stats…
        </span>
      </div>
    );
  }

  if (stats.isError || !stats.data) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
        <ShieldCheck className="h-10 w-10 text-muted-foreground/50" />
        <h1 className="font-display text-xl font-semibold text-foreground">Admins only</h1>
        <p className="text-sm text-muted-foreground">This page is only for the app's administrators.</p>
        <Link to="/dashboard" className="text-sm font-medium text-primary hover:underline">Back to dashboard</Link>
      </div>
    );
  }

  const s = stats.data;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Admin
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-foreground">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Who is using LifePulse and how much.</p>
        </div>
        <button
          onClick={() => stats.refetch()}
          disabled={stats.isFetching}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {stats.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Refresh
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total users" value={s.total_users} />
        <Kpi label="New this week" value={s.new_users7d} hint={`${s.new_users30d} in 30 days`} />
        <Kpi label="Active this week" value={s.active_users7d} hint={pct(s.active_users7d, s.total_users)} />
        <Kpi label="Active this month" value={s.active_users30d} hint={pct(s.active_users30d, s.total_users)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <BarCard title="Sign-ups" subtitle="New accounts per day, last 30 days" data={s.signups_by_day} />
        <BarCard title="Active users" subtitle="People who added or changed something, per day" data={s.active_by_day} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="glass-card rounded-2xl p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">What people create</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Mini label="Sticky notes" value={s.notes} />
            <Mini label="Notebook pages" value={s.notebook_pages} />
            <Mini label="Tasks" value={s.tasks} />
            <Mini label="Events" value={s.events} />
            <Mini label="Expenses logged" value={s.expenses} />
            <Mini label="AI chats" value={s.chat_conversations} />
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-foreground">How people sign in</h2>
          <div className="mt-5 space-y-4">
            <Split label="Google" value={s.google_users} total={s.total_users} />
            <Split label="Email & password" value={s.email_users} total={s.total_users} />
          </div>
        </div>
      </div>

      <section className="glass-card mt-6 rounded-2xl p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 text-primary" /> Users
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{s.users.length}</span>
          </h2>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email"
              className="h-9 w-full rounded-xl border border-border bg-background pl-8 pr-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 sm:text-xs"
            />
          </div>
        </div>

        {/* Table on larger screens */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-semibold">User</th>
                <th className="py-2 pr-3 font-semibold">Sign-in</th>
                <th className="py-2 pr-3 font-semibold">Joined</th>
                <th className="py-2 pr-3 font-semibold">Last active</th>
                <th className="py-2 pr-3 text-right font-semibold">Items</th>
                <th className="py-2 text-right font-semibold">Expenses</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2.5 pr-3">
                    <UserCell name={u.display_name} email={u.email} avatar={u.avatar_url} />
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">{u.sign_in_method}</td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">{format(new Date(u.joined_at), "MMM d, yyyy")}</td>
                  <td className="py-2.5 pr-3 text-xs">
                    <LastActive at={u.last_active_at} />
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{u.items}</td>
                  <td className="py-2.5 text-right tabular-nums">{u.expenses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cards on phones */}
        <ul className="space-y-2 md:hidden">
          {users.map((u) => (
            <li key={u.id} className="rounded-xl border border-border p-3">
              <UserCell name={u.display_name} email={u.email} avatar={u.avatar_url} />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span>{u.sign_in_method}</span>
                <span>Joined {format(new Date(u.joined_at), "MMM d, yyyy")}</span>
                <LastActive at={u.last_active_at} />
                <span>{u.items} items · {u.expenses} expenses</span>
              </div>
            </li>
          ))}
        </ul>

        {users.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">No users match.</p>}
      </section>
    </div>
  );
}

function pct(part: number, total: number) {
  if (!total) return undefined;
  return `${Math.round((part / total) * 100)}% of users`;
}

function Kpi({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-foreground">{value.toLocaleString()}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value.toLocaleString()}</p>
    </div>
  );
}

function Split({ label, value, total }: { label: string; value: number; total: number }) {
  const p = total ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value} · {Math.round(p)}%
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function BarCard({ title, subtitle, data }: { title: string; subtitle: string; data: AdminDayCount[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((a, d) => a + d.count, 0);
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{total} total</span>
      </div>
      <div className="mt-4 flex h-32 items-end gap-[3px]">
        {data.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 items-end">
            <div
              className={cn("w-full rounded-t-sm transition-colors", d.count > 0 ? "bg-primary/70 group-hover:bg-primary" : "bg-muted")}
              style={{ height: d.count > 0 ? `${Math.max(6, (d.count / max) * 100)}%` : "3px" }}
            />
            <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-md group-hover:block">
              {format(new Date(d.date + "T12:00:00"), "MMM d")}: {d.count}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0] && format(new Date(data[0].date + "T12:00:00"), "MMM d")}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function UserCell({ name, email, avatar }: { name: string | null; email: string; avatar: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {avatar ? (
        <img src={avatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {(name || email).charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{name || email.split("@")[0]}</p>
        <p className="truncate text-[11px] text-muted-foreground">{email}</p>
      </div>
    </div>
  );
}

function LastActive({ at }: { at: string | null }) {
  if (!at) return <span className="text-muted-foreground">Never</span>;
  const d = new Date(at);
  const recent = Date.now() - d.getTime() < 1000 * 60 * 60 * 24 * 7;
  return (
    <span className={cn("flex items-center gap-1.5", recent ? "text-foreground" : "text-muted-foreground")}>
      {recent && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
      {formatDistanceToNow(d, { addSuffix: true })}
    </span>
  );
}
