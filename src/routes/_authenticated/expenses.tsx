import { createFileRoute } from "@tanstack/react-router";
import { createContext, useContext, useMemo, useState } from "react";
import {
  format, startOfMonth, isSameMonth, subMonths,
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  isWithinInterval, eachDayOfInterval, subDays, isToday, isYesterday,
} from "date-fns";
import { Plus, Trash2, Pencil, ChevronLeft, ChevronRight, Search, X, ShoppingBag, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateExpense,
  useDeleteExpense,
  useExpenses,
  useCategoryBudgets,
  useUpsertCategoryBudgets,
  useUpdateExpense,
} from "@/hooks/use-expenses";
import { useUserSetting } from "@/hooks/use-user-setting";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  usePlannedPurchases,
  useCreatePlannedPurchase,
  useUpdatePlannedPurchase,
  useDeletePlannedPurchase,
  type PlannedPurchase,
} from "@/hooks/use-planned-purchases";
import { EXPENSE_CATEGORIES, type Expense } from "@/lib/lifeos-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

export const Route = createFileRoute("/_authenticated/expenses")({
  component: ExpensesPage,
});

type Tab = "log" | "pacing" | "analytics" | "planned";
type PeriodType = "today" | "week" | "month" | "last_month" | "all";

const CURRENCY = "Birr";
const NO_BUDGETS: Record<string, number> = {};
const NO_CUSTOM: string[] = [];
/** Built-in categories (the old catch-all "Other" is replaced by user-made categories). */
const BUILT_IN_CATEGORIES = EXPENSE_CATEGORIES.map((c) => c.value as string).filter((c) => c !== "Other");

type ExpenseUi = {
  categories: string[];
  customCategories: string[];
  addCategory: (name: string) => string | null;
  removeCategory: (name: string) => void;
  onEdit: (e: Expense) => void;
};
const ExpenseUiCtx = createContext<ExpenseUi | null>(null);
const useExpenseUi = () => useContext(ExpenseUiCtx)!;

const PERIOD_LABELS: Record<PeriodType, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  last_month: "Last month",
  all: "All time",
};

function money(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function dayLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, MMM d");
}

function ExpensesPage() {
  const { data: expenses = [] } = useExpenses();
  const create = useCreateExpense();
  const del = useDeleteExpense();
  const { data: plannedPurchases = [] } = usePlannedPurchases();
  const createPurchase = useCreatePlannedPurchase();
  const updatePurchase = useUpdatePlannedPurchase();
  const deletePurchase = useDeletePlannedPurchase();
  const { data: budgetData } = useCategoryBudgets();
  const upsertBudgets = useUpsertCategoryBudgets();
  const updateExpense = useUpdateExpense();

  // Categories: built-ins + the user's own (saved to their account)
  const { value: customCategories, save: saveCustomCategories } = useUserSetting<string[]>("expense-categories", NO_CUSTOM);
  const categories = useMemo(() => {
    const out = [...BUILT_IN_CATEGORIES];
    for (const c of customCategories) if (!out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c);
    return out;
  }, [customCategories]);

  const addCategory = (raw: string): string | null => {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) return null;
    if (name.length > 40) {
      toast.error("Keep category names under 40 characters");
      return null;
    }
    const existing = categories.find((c) => c.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    saveCustomCategories([...customCategories, name]);
    toast.success(`Category "${name}" added`);
    return name;
  };

  const removeCategory = (name: string) => {
    saveCustomCategories(customCategories.filter((c) => c !== name));
    toast.success(`Category "${name}" removed — past expenses keep their label`);
  };

  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>("log");
  const [confirmDeleteExpenseId, setConfirmDeleteExpenseId] = useState<string | null>(null);
  const [confirmDeleteWishlistId, setConfirmDeleteWishlistId] = useState<string | null>(null);

  // Category budgets come only from the API (no made-up defaults)
  const categoryBudgets = useMemo(() => {
    const raw = budgetData ?? NO_BUDGETS;
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)])) as Record<string, number>;
  }, [budgetData]);
  const monthlyBudget = useMemo(() => Object.values(categoryBudgets).reduce((s, v) => s + v, 0), [categoryBudgets]);

  const now = useMemo(() => new Date(), []);
  const monthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));

  const thisMonthExpenses = useMemo(
    () => expenses.filter((e) => isSameMonth(new Date(e.occurred_at), monthStart)),
    [expenses, monthStart]
  );
  const spentByCategoryThisMonth = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of thisMonthExpenses) m[e.category] = (m[e.category] ?? 0) + Number(e.amount);
    return m;
  }, [thisMonthExpenses]);

  const handleDeleteExpense = (id: string) => {
    del.mutate(id, {
      onSuccess: () => toast.success("Expense deleted"),
      onError: (err) => toast.error(err.message || "Failed to delete expense"),
    });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "log", label: "Log Spend" },
    { id: "pacing", label: "Budget Pacing" },
    { id: "analytics", label: "Spend Analytics" },
    { id: "planned", label: "Planned Purchases" },
  ];

  return (
    <ExpenseUiCtx.Provider value={{ categories, customCategories, addCategory, removeCategory, onEdit: setEditingExpense }}>
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-3 sm:py-10">
      <header className="mb-4 sm:mb-8 flex flex-wrap items-center justify-between gap-4 sm:gap-6">
        <h1 className="mt-1.5 sm:mt-3 font-display text-xl sm:text-3xl font-semibold text-foreground">Expenses</h1>
        <div className="flex border border-white/10 bg-white/[0.02] p-1 rounded-xl text-xs gap-1 overflow-x-auto scrollbar-none max-w-full">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "px-3.5 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap",
                activeTab === t.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === "log" && (
        <LogTab expenses={expenses} onCreate={create} onDelete={(id) => setConfirmDeleteExpenseId(id)} deleting={del.isPending} />
      )}

      {activeTab === "pacing" && (
        <PacingTab
          now={now}
          expenses={expenses}
          monthlyBudget={monthlyBudget}
          categoryBudgets={categoryBudgets}
          spentByCategory={spentByCategoryThisMonth}
          lastMonthStart={lastMonthStart}
          onSetupBudget={() => setActiveTab("planned")}
        />
      )}

      {activeTab === "analytics" && (
        <AnalyticsTab
          now={now}
          expenses={expenses}
          monthStart={monthStart}
          lastMonthStart={lastMonthStart}
          onDelete={(id) => setConfirmDeleteExpenseId(id)}
        />
      )}

      {activeTab === "planned" && (
        <PlannedTab
          categoryBudgets={categoryBudgets}
          monthlyBudget={monthlyBudget}
          spentByCategory={spentByCategoryThisMonth}
          plannedPurchases={plannedPurchases}
          savingBudgets={upsertBudgets.isPending}
          onSaveBudgets={(next, done) =>
            upsertBudgets.mutate(next, {
              onSuccess: () => {
                toast.success("Budget plan saved");
                done();
              },
              onError: (err) => toast.error(err.message || "Failed to save budget plan"),
            })
          }
          onAddPurchase={(input, done) =>
            createPurchase.mutate(input, {
              onSuccess: () => {
                toast.success("Planned purchase added");
                done();
              },
              onError: (err) => toast.error(err.message),
            })
          }
          onBuy={(item) =>
            create.mutate(
              { amount: item.amount, category: item.category, note: item.name },
              {
                onSuccess: () => {
                  updatePurchase.mutate({ id: item.id, patch: { purchased: true } }, { onError: (err) => toast.error(err.message) });
                  toast.success(`Bought "${item.name}" — added to today's expenses`);
                },
                onError: (err) => toast.error(err.message),
              }
            )
          }
          onDelete={(id) => setConfirmDeleteWishlistId(id)}
        />
      )}

      <ConfirmDeleteDialog
        open={confirmDeleteExpenseId !== null}
        onOpenChange={(o) => !o && setConfirmDeleteExpenseId(null)}
        title="Delete this expense?"
        description="This expense record will be permanently deleted."
        confirmLabel="Delete Expense"
        onConfirm={() => {
          if (confirmDeleteExpenseId) {
            handleDeleteExpense(confirmDeleteExpenseId);
            setConfirmDeleteExpenseId(null);
          }
        }}
      />

      <ConfirmDeleteDialog
        open={confirmDeleteWishlistId !== null}
        onOpenChange={(o) => !o && setConfirmDeleteWishlistId(null)}
        title="Delete planned purchase?"
        description="This item will be permanently removed from your list."
        confirmLabel="Remove Item"
        onConfirm={() => {
          if (confirmDeleteWishlistId) {
            deletePurchase.mutate(confirmDeleteWishlistId, {
              onSuccess: () => toast.success("Item removed"),
              onError: (err) => toast.error(err.message),
            });
            setConfirmDeleteWishlistId(null);
          }
        }}
      />

      <EditExpenseDialog
        expense={editingExpense}
        saving={updateExpense.isPending}
        onClose={() => setEditingExpense(null)}
        onSave={(patch) => {
          if (!editingExpense) return;
          updateExpense.mutate(
            { id: editingExpense.id, patch },
            {
              onSuccess: () => {
                toast.success("Expense updated");
                setEditingExpense(null);
              },
              onError: (err) => toast.error(err.message || "Couldn't update expense"),
            }
          );
        }}
      />
    </div>
    </ExpenseUiCtx.Provider>
  );
}

// ─── Tab 1: Log spend ────────────────────────────────────────────────────────

function LogTab({
  expenses,
  onCreate,
  onDelete,
  deleting,
}: {
  expenses: Expense[];
  onCreate: ReturnType<typeof useCreateExpense>;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("Food");
  const [note, setNote] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));

  const isSelectedToday = startOfDay(selectedDate).getTime() === startOfDay(new Date()).getTime();
  const selectedDateLabel = dayLabel(selectedDate);

  const dayExpenses = useMemo(() => {
    const s = startOfDay(selectedDate);
    const e = endOfDay(selectedDate);
    return expenses
      .filter((x) => isWithinInterval(new Date(x.occurred_at), { start: s, end: e }))
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  }, [expenses, selectedDate]);
  const dayTotal = dayExpenses.reduce((s, e) => s + Number(e.amount), 0);

  const goToNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    if (startOfDay(next) <= startOfDay(new Date())) setSelectedDate(startOfDay(next));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!n || n <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    // Selected day + current time-of-day, so backdated entries sort sensibly
    const occurred = new Date(selectedDate);
    const t = new Date();
    occurred.setHours(t.getHours(), t.getMinutes(), t.getSeconds(), t.getMilliseconds());
    onCreate.mutate(
      { amount: n, category, note: note || null, occurred_at: occurred.toISOString() },
      {
        onSuccess: () => {
          setAmount("");
          setNote("");
          toast.success("Expense saved");
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
      <form onSubmit={submit} className="glass-card space-y-4 rounded-3xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-2">
          <button
            type="button"
            onClick={() => setSelectedDate((d) => subDays(d, 1))}
            className="h-8 w-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <select
            value={format(selectedDate, "yyyy-MM-dd")}
            onChange={(e) => setSelectedDate(startOfDay(new Date(e.target.value + "T00:00:00")))}
            className="flex-1 bg-muted border border-white/10 rounded-xl px-3 py-1.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer text-center appearance-none hover:bg-white/[0.10] transition-colors"
            style={{ colorScheme: "light" }}
          >
            {eachDayOfInterval({ start: startOfMonth(selectedDate), end: new Date() })
              .reverse()
              .map((day) => {
                const val = format(day, "yyyy-MM-dd");
                const label = isToday(day)
                  ? "Today — " + format(day, "MMM d")
                  : isYesterday(day)
                    ? "Yesterday — " + format(day, "MMM d")
                    : format(day, "EEE, MMM d");
                return <option key={val} value={val} style={{ color: "#111", backgroundColor: "#fff" }}>{label}</option>;
              })}
          </select>
          <button
            type="button"
            onClick={goToNextDay}
            disabled={isSelectedToday}
            className="h-8 w-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            title="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <h2 className="font-display text-base font-semibold text-lagoon">
          {isSelectedToday ? "Log Spent Today" : `Add to ${selectedDateLabel}`}
        </h2>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="Amount spent…"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-12 text-lg border-white/10 bg-white/[0.03]"
            autoFocus
          />
          <div className="grid h-12 place-items-center rounded-md border border-white/10 bg-white/[0.03] px-4 text-sm text-muted-foreground font-semibold">
            {CURRENCY}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Category</label>
          <CategoryPicker value={category} onChange={setCategory} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Note</label>
          <Input
            placeholder="What did you buy? (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-10 border-white/10 bg-white/[0.03]"
          />
        </div>

        <Button type="submit" className="w-full h-11 gap-2 bg-lagoon text-cream hover:bg-lagoon/90 font-semibold" disabled={onCreate.isPending}>
          <Plus className="h-4 w-4" /> Save Expense
        </Button>
      </form>

      <div className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between border-b border-white/5 pb-3 gap-2">
          <h2 className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-wider">{selectedDateLabel}</h2>
          <span className="text-sm font-bold text-foreground">
            {money(dayTotal)} {CURRENCY}
          </span>
        </div>

        {dayExpenses.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Nothing logged for {selectedDateLabel.toLowerCase()} yet.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {dayExpenses.map((e) => (
              <ExpenseRow key={e.id} e={e} showTime onDelete={() => onDelete(e.id)} disabled={deleting} />
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground/70">Looking for older entries? Open Spend Analytics for your full history.</p>
      </div>
    </div>
  );
}

function ExpenseRow({ e, showTime, showDate, onDelete, disabled }: { e: Expense; showTime?: boolean; showDate?: boolean; onDelete: () => void; disabled?: boolean }) {
  const { onEdit } = useExpenseUi();
  const d = new Date(e.occurred_at);
  return (
    <li className="group flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onEdit(e)}>
        <p className="truncate text-sm font-medium text-foreground">{e.note || e.category}</p>
        <p className="text-[11px] text-muted-foreground">
          {e.category}
          {showDate && ` · ${dayLabel(d)}`}
          {showTime && ` · ${format(d, "p")}`}
        </p>
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
        {money(Number(e.amount))} <span className="text-[11px] font-normal text-muted-foreground">{CURRENCY}</span>
      </p>
      <button
        type="button"
        onClick={() => onEdit(e)}
        className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-primary/10 hover:text-primary sm:opacity-0 sm:group-hover:opacity-100"
        title="Edit expense"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
        title="Delete expense"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

// ─── Tab 2: Budget pacing ────────────────────────────────────────────────────

function PacingTab({
  now,
  expenses,
  monthlyBudget,
  categoryBudgets,
  spentByCategory,
  lastMonthStart,
  onSetupBudget,
}: {
  now: Date;
  expenses: Expense[];
  monthlyBudget: number;
  categoryBudgets: Record<string, number>;
  spentByCategory: Record<string, number>;
  lastMonthStart: Date;
  onSetupBudget: () => void;
}) {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const daysLeft = daysInMonth - currentDay + 1; // including today
  const spent = Object.values(spentByCategory).reduce((s, v) => s + v, 0);
  const remaining = monthlyBudget - spent;
  const elapsedPct = (currentDay / daysInMonth) * 100;
  const spentPct = monthlyBudget > 0 ? (spent / monthlyBudget) * 100 : 0;
  const dailyAverage = spent / currentDay;
  const projected = dailyAverage * daysInMonth;
  const perDayLeft = daysLeft > 0 ? Math.max(remaining, 0) / daysLeft : 0;
  const plannedPerDay = monthlyBudget / daysInMonth;

  // Fair comparison: last month up to the same day-of-month
  const lastMonthSamePoint = useMemo(() => {
    const end = endOfDay(new Date(lastMonthStart.getFullYear(), lastMonthStart.getMonth(), Math.min(currentDay, new Date(lastMonthStart.getFullYear(), lastMonthStart.getMonth() + 1, 0).getDate())));
    return expenses
      .filter((e) => isWithinInterval(new Date(e.occurred_at), { start: lastMonthStart, end }))
      .reduce((s, e) => s + Number(e.amount), 0);
  }, [expenses, lastMonthStart, currentDay]);
  const vsLast = spent - lastMonthSamePoint;

  if (monthlyBudget <= 0) {
    return (
      <div className="glass-card mx-auto max-w-xl rounded-3xl p-8 text-center space-y-3">
        <h2 className="font-display text-lg font-semibold text-foreground">Set a monthly budget to start pacing</h2>
        <p className="text-sm text-muted-foreground">
          Give each category a monthly limit and this page will tell you how much you can safely spend each day.
        </p>
        <p className="text-xs text-muted-foreground">
          So far in {format(now, "MMMM")} you've spent <span className="font-semibold text-foreground">{money(spent)} {CURRENCY}</span>.
        </p>
        <Button onClick={onSetupBudget} className="mt-2">Set up my budget plan</Button>
      </div>
    );
  }

  const status: "on_track" | "high" | "over" =
    remaining < 0 ? "over" : spentPct <= elapsedPct ? "on_track" : spentPct <= elapsedPct + 10 ? "high" : "over";

  const headline =
    remaining < 0
      ? `You're ${money(Math.abs(remaining))} ${CURRENCY} over this month's budget.`
      : `You can spend about ${money(perDayLeft, 0)} ${CURRENCY} a day for the rest of ${format(now, "MMMM")}.`;

  const explanation =
    status === "on_track"
      ? `Nice — you've used ${spentPct.toFixed(0)}% of your budget and ${elapsedPct.toFixed(0)}% of the month has passed.`
      : status === "high"
        ? `You're spending a little faster than planned: ${spentPct.toFixed(0)}% of the budget used with ${elapsedPct.toFixed(0)}% of the month gone.`
        : remaining < 0
          ? "Try to keep the remaining days to essentials."
          : `You're spending faster than planned: ${spentPct.toFixed(0)}% of the budget used with only ${elapsedPct.toFixed(0)}% of the month gone.`;

  const categories = Object.keys(categoryBudgets)
    .map((cat) => {
      const limit = categoryBudgets[cat];
      const used = spentByCategory[cat] ?? 0;
      return { cat, limit, used, pct: limit > 0 ? (used / limit) * 100 : 0 };
    })
    .sort((a, b) => b.pct - a.pct);
  const unbudgeted = Object.entries(spentByCategory).filter(([cat]) => !(cat in categoryBudgets));

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div
        className={cn(
          "glass-card rounded-3xl border p-5 sm:p-7",
          status === "on_track" && "border-emerald-500/25",
          status === "high" && "border-amber-500/30",
          status === "over" && "border-destructive/30"
        )}
      >
        <span
          className={cn(
            "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
            status === "on_track" && "bg-emerald-500/15 text-emerald-500",
            status === "high" && "bg-amber-500/15 text-amber-500",
            status === "over" && "bg-destructive/15 text-destructive"
          )}
        >
          {status === "on_track" ? "On track" : status === "high" ? "A bit fast" : remaining < 0 ? "Over budget" : "Spending fast"}
        </span>
        <h2 className="mt-3 font-display text-xl sm:text-2xl font-semibold leading-snug text-foreground">{headline}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{explanation}</p>

        {/* Progress with "today" marker */}
        <div className="mt-6 space-y-2">
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                status === "on_track" && "bg-emerald-500",
                status === "high" && "bg-amber-500",
                status === "over" && "bg-destructive"
              )}
              style={{ width: `${Math.min(spentPct, 100)}%` }}
            />
            <div className="absolute inset-y-0 w-0.5 bg-foreground/70" style={{ left: `${elapsedPct}%` }} title="Today" />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>
              Spent <strong className="text-foreground">{money(spent)}</strong> of {money(monthlyBudget)} {CURRENCY}
            </span>
            <span>Day {currentDay} of {daysInMonth}</span>
          </div>
        </div>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Tile
          label="Left to spend"
          value={`${money(Math.max(remaining, 0))} ${CURRENCY}`}
          hint={`${daysLeft} day${daysLeft === 1 ? "" : "s"} left, including today`}
          tone={remaining < 0 ? "bad" : undefined}
        />
        <Tile
          label="Your daily average"
          value={`${money(dailyAverage)} ${CURRENCY}`}
          hint={`Plan allows ${money(plannedPerDay)} ${CURRENCY} a day`}
          tone={dailyAverage > plannedPerDay ? "warn" : "good"}
        />
        <Tile
          label="If you keep this pace"
          value={`${money(projected)} ${CURRENCY}`}
          hint={projected <= monthlyBudget ? `${money(monthlyBudget - projected)} under budget by month end` : `${money(projected - monthlyBudget)} over budget by month end`}
          tone={projected <= monthlyBudget ? "good" : "bad"}
        />
      </div>

      {/* Per-category pacing */}
      <div className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">By category this month</h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {vsLast >= 0 ? `${money(vsLast)} more` : `${money(Math.abs(vsLast))} less`} than this point last month
            </span>
            <button onClick={onSetupBudget} className="font-medium text-primary hover:underline">Edit plan</button>
          </div>
        </div>
        <ul className="space-y-3">
          {categories.map(({ cat, limit, used, pct }) => (
            <li key={cat} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-foreground">{cat}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {money(used, 0)} / {money(limit, 0)} {CURRENCY}
                  {pct > 100 && <span className="ml-1.5 font-semibold text-destructive">over</span>}
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", pct > 100 ? "bg-destructive" : pct > elapsedPct + 10 ? "bg-amber-500" : "bg-primary")}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
                <div className="absolute inset-y-0 w-px bg-foreground/50" style={{ left: `${elapsedPct}%` }} />
              </div>
            </li>
          ))}
        </ul>
        {unbudgeted.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Spent without a budget: {unbudgeted.map(([c, v]) => `${c} ${money(v, 0)}`).join(" · ")} {CURRENCY}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground/70">The thin line on each bar marks today — staying left of it means you're on pace.</p>
      </div>
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl sm:text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint && (
        <p
          className={cn(
            "mt-1 text-[11px]",
            tone === "good" && "text-emerald-500",
            tone === "warn" && "text-amber-500",
            tone === "bad" && "text-destructive",
            !tone && "text-muted-foreground"
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

// ─── Tab 3: Spend analytics ──────────────────────────────────────────────────

function AnalyticsTab({
  now,
  expenses,
  monthStart,
  lastMonthStart,
  onDelete,
}: {
  now: Date;
  expenses: Expense[];
  monthStart: Date;
  lastMonthStart: Date;
  onDelete: (id: string) => void;
}) {
  const [period, setPeriod] = useState<PeriodType>("month");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const inPeriod = useMemo(() => {
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    return expenses
      .filter((e) => {
        const d = new Date(e.occurred_at);
        if (period === "today") return isToday(d);
        if (period === "week") return isWithinInterval(d, { start: weekStart, end: weekEnd });
        if (period === "month") return isSameMonth(d, monthStart);
        if (period === "last_month") return isSameMonth(d, lastMonthStart);
        return true;
      })
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  }, [expenses, period, now, monthStart, lastMonthStart]);

  const total = inPeriod.reduce((s, e) => s + Number(e.amount), 0);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of inPeriod) m.set(e.category, (m.get(e.category) ?? 0) + Number(e.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [inPeriod]);

  const days = useMemo(() => {
    let range: Date[];
    if (period === "today") range = [now];
    else if (period === "week") range = eachDayOfInterval({ start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) });
    else if (period === "month") range = eachDayOfInterval({ start: monthStart, end: now });
    else if (period === "last_month") range = eachDayOfInterval({ start: lastMonthStart, end: new Date(lastMonthStart.getFullYear(), lastMonthStart.getMonth() + 1, 0) });
    else range = eachDayOfInterval({ start: subDays(now, 29), end: now });
    return range.map((d) => {
      const s = startOfDay(d);
      const e = endOfDay(d);
      return { date: d, total: expenses.filter((x) => isWithinInterval(new Date(x.occurred_at), { start: s, end: e })).reduce((t, x) => t + Number(x.amount), 0) };
    });
  }, [expenses, period, now, monthStart, lastMonthStart]);

  const maxDay = Math.max(1, ...days.map((d) => d.total));
  const dayCount = period === "all" ? Math.max(1, new Set(inPeriod.map((e) => format(new Date(e.occurred_at), "yyyy-MM-dd"))).size) : days.filter((d) => d.date <= now).length || 1;
  const avgPerDay = total / dayCount;
  const biggest = inPeriod.reduce<Expense | null>((m, e) => (!m || Number(e.amount) > Number(m.amount) ? e : m), null);

  const history = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = inPeriod.filter(
      (e) =>
        (!categoryFilter || e.category === categoryFilter) &&
        (!q || (e.note ?? "").toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
    );
    const groups: { key: string; date: Date; items: Expense[]; total: number }[] = [];
    for (const e of list) {
      const d = new Date(e.occurred_at);
      const key = format(d, "yyyy-MM-dd");
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) {
        g = { key, date: d, items: [], total: 0 };
        groups.push(g);
      }
      g.items.push(e);
      g.total += Number(e.amount);
    }
    return groups;
  }, [inPeriod, categoryFilter, query]);

  return (
    <div className="space-y-6">
      {/* Period chips */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {(Object.keys(PERIOD_LABELS) as PeriodType[]).map((p) => (
          <button
            key={p}
            onClick={() => { setPeriod(p); setCategoryFilter(null); }}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
              period === p ? "border-primary bg-primary text-primary-foreground" : "border-white/10 text-muted-foreground hover:text-foreground"
            )}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Total spent" value={`${money(total)} ${CURRENCY}`} />
        <Tile label="Per day" value={`${money(avgPerDay)} ${CURRENCY}`} hint="Average" />
        <Tile label="Entries" value={String(inPeriod.length)} />
        <Tile label="Biggest spend" value={biggest ? `${money(Number(biggest.amount), 0)} ${CURRENCY}` : "—"} hint={biggest ? biggest.note || biggest.category : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Daily chart */}
        <div className="glass-card rounded-3xl p-5 sm:p-6 lg:col-span-3">
          <h3 className="mb-4 text-sm font-semibold text-foreground">
            Daily spending{period === "all" && <span className="font-normal text-muted-foreground"> · last 30 days</span>}
          </h3>
          {days.every((d) => d.total === 0) ? (
            <p className="py-12 text-center text-xs text-muted-foreground">No spending in this period.</p>
          ) : (
            <div className="flex h-44 items-end gap-[3px]">
              {days.map((d) => (
                <div key={d.date.toISOString()} className="group relative flex h-full flex-1 flex-col justify-end">
                  <div
                    className={cn("w-full rounded-t-md transition-colors", d.total > 0 ? "bg-primary/70 group-hover:bg-primary" : "bg-muted")}
                    style={{ height: d.total > 0 ? `${Math.max((d.total / maxDay) * 100, 3)}%` : "3px" }}
                  />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-card px-2 py-1 text-[11px] text-card-foreground shadow-lg group-hover:block">
                    {format(d.date, "EEE, MMM d")}: <strong>{money(d.total)}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
          {days.length > 1 && (
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>{format(days[0].date, "MMM d")}</span>
              <span>{format(days[days.length - 1].date, "MMM d")}</span>
            </div>
          )}
        </div>

        {/* Category breakdown */}
        <div className="glass-card rounded-3xl p-5 sm:p-6 lg:col-span-2">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Where it went</h3>
          <p className="mb-4 text-[11px] text-muted-foreground">Tap a category to filter the history below.</p>
          {byCategory.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No spending in this period.</p>
          ) : (
            <ul className="space-y-2">
              {byCategory.map(([cat, val]) => {
                const pct = total > 0 ? (val / total) * 100 : 0;
                const active = categoryFilter === cat;
                return (
                  <li key={cat}>
                    <button
                      onClick={() => setCategoryFilter(active ? null : cat)}
                      className={cn("w-full rounded-xl px-2 py-1.5 text-left transition", active ? "bg-primary/15" : "hover:bg-white/[0.04]")}
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{cat}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {money(val, 0)} · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary/80" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Recent history */}
      <div className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Recent history</h3>
            <p className="text-[11px] text-muted-foreground">
              {PERIOD_LABELS[period]}
              {categoryFilter && ` · ${categoryFilter}`} · {expenses.length} entries saved in total
            </p>
          </div>
          <div className="flex items-center gap-2">
            {categoryFilter && (
              <button
                onClick={() => setCategoryFilter(null)}
                className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs text-primary"
              >
                {categoryFilter} <X className="h-3 w-3" />
              </button>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes…"
                className="h-8 w-full sm:w-48 border-white/10 bg-white/[0.03] pl-8 text-xs"
              />
            </div>
          </div>
        </div>

        {history.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No entries match.</p>
        ) : (
          <div className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
            {history.map((g) => (
              <div key={g.key}>
                <div className="flex items-center justify-between border-b border-white/5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>{dayLabel(g.date)}</span>
                  <span className="tabular-nums">{money(g.total)} {CURRENCY}</span>
                </div>
                <ul className="divide-y divide-white/5">
                  {g.items.map((e) => (
                    <ExpenseRow key={e.id} e={e} showTime onDelete={() => onDelete(e.id)} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 4: Planned purchases + category plan ────────────────────────────────

function PlannedTab({
  categoryBudgets,
  monthlyBudget,
  spentByCategory,
  plannedPurchases,
  savingBudgets,
  onSaveBudgets,
  onAddPurchase,
  onBuy,
  onDelete,
}: {
  categoryBudgets: Record<string, number>;
  monthlyBudget: number;
  spentByCategory: Record<string, number>;
  plannedPurchases: PlannedPurchase[];
  savingBudgets: boolean;
  onSaveBudgets: (next: Record<string, number>, done: () => void) => void;
  onAddPurchase: (input: { name: string; amount: number; category: string }, done: () => void) => void;
  onBuy: (item: PlannedPurchase) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cat, setCat] = useState("Shopping");
  const { categories } = useExpenseUi();
  // Every category the user can budget: built-in + their own + any that already has a budget
  const budgetCategories = useMemo(() => {
    const out = [...categories];
    for (const c of Object.keys(categoryBudgets)) if (!out.includes(c)) out.push(c);
    return out;
  }, [categories, categoryBudgets]);

  const startEdit = () => {
    const d: Record<string, string> = {};
    budgetCategories.forEach((c) => (d[c] = categoryBudgets[c] ? String(categoryBudgets[c]) : ""));
    setDraft(d);
    setEditing(true);
  };

  const draftTotal = Object.values(draft).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const save = () => {
    const next: Record<string, number> = {};
    for (const [k, v] of Object.entries(draft)) {
      const n = parseFloat(v);
      if (!isNaN(n) && n > 0) next[k] = n;
    }
    onSaveBudgets(next, () => setEditing(false));
  };

  const addPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(price);
    if (!name.trim() || isNaN(amt) || amt <= 0) return toast.error("Enter an item name and a valid price");
    onAddPurchase({ name: name.trim(), amount: amt, category: cat }, () => {
      setName("");
      setPrice("");
    });
  };

  const pending = plannedPurchases.filter((p) => !p.purchased);
  const bought = plannedPurchases.filter((p) => p.purchased);
  const pendingTotal = pending.reduce((s, p) => s + Number(p.amount), 0);
  const spentTotal = Object.values(spentByCategory).reduce((s, v) => s + v, 0);
  const leftThisMonth = monthlyBudget - spentTotal;

  return (
    <div className="grid gap-6 lg:grid-cols-2 items-start">
      {/* Category plan */}
      <div className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">Monthly category plan</h2>
            <p className="text-xs text-muted-foreground">
              {editing ? (
                <>New total: <strong className="text-foreground">{money(draftTotal)} {CURRENCY}</strong></>
              ) : monthlyBudget > 0 ? (
                <>Total budget: <strong className="text-foreground">{money(monthlyBudget)} {CURRENCY}</strong> a month</>
              ) : (
                "No budget yet — set a limit for the categories you want to track."
              )}
            </p>
          </div>
          {!editing && (
            <Button size="sm" variant="outline" onClick={startEdit} className="h-8 shrink-0 gap-1.5 border-white/10 text-xs">
              <Pencil className="h-3.5 w-3.5" /> {monthlyBudget > 0 ? "Edit" : "Set up"}
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div className="divide-y divide-white/5">
              {budgetCategories.map((c) => (
                <div key={c} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{c}</p>
                    <p className="text-[11px] text-muted-foreground">Spent this month: {money(spentByCategory[c] ?? 0, 0)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      value={draft[c] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [c]: e.target.value })}
                      placeholder="No limit"
                      className="h-9 w-28 text-right text-sm"
                    />
                    <span className="text-[11px] text-muted-foreground">{CURRENCY}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} className="h-9 text-xs">Cancel</Button>
              <Button size="sm" onClick={save} disabled={savingBudgets} className="h-9 text-xs">Save plan</Button>
            </div>
          </div>
        ) : monthlyBudget > 0 ? (
          <ul className="space-y-3">
            {Object.keys(categoryBudgets).map((c) => {
              const limit = categoryBudgets[c];
              const used = spentByCategory[c] ?? 0;
              const pct = limit > 0 ? (used / limit) * 100 : 0;
              return (
                <li key={c} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{c}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {money(used, 0)} / {money(limit, 0)} {CURRENCY}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", pct > 100 ? "bg-destructive" : pct > 85 ? "bg-amber-500" : "bg-primary")}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Button onClick={startEdit} className="w-full">Set up my budget plan</Button>
        )}
      </div>

      {/* Planned purchases */}
      <div className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Planned purchases</h2>
          <p className="text-xs text-muted-foreground">
            {pending.length > 0 ? (
              <>
                {pending.length} planned · <strong className="text-foreground">{money(pendingTotal)} {CURRENCY}</strong>
                {monthlyBudget > 0 && (
                  <span className={cn(pendingTotal > leftThisMonth && "text-destructive")}>
                    {" "}· {money(Math.max(leftThisMonth, 0))} left in this month's budget
                  </span>
                )}
              </>
            ) : (
              "Things you want to buy later. Mark them as bought to log the expense."
            )}
          </p>
        </div>

        <form onSubmit={addPurchase} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_7rem_8rem_auto]">
          <Input
            placeholder="Item name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="col-span-2 sm:col-span-1 h-10 border-white/10 bg-white/[0.03] text-sm"
          />
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="h-10 border-white/10 bg-white/[0.03] text-sm"
          />
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="h-10 rounded-md border border-white/10 bg-background px-2 text-sm text-foreground"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <Button type="submit" className="col-span-2 sm:col-span-1 h-10 gap-1.5">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>

        {plannedPurchases.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
            <ShoppingBag className="h-8 w-8 text-muted-foreground/30" />
            Nothing planned yet.
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {[...pending, ...bought].map((p) => (
              <li key={p.id} className="group flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", p.purchased ? "text-muted-foreground line-through" : "text-foreground")}>{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.category} · {money(Number(p.amount))} {CURRENCY}
                  </p>
                </div>
                {!p.purchased ? (
                  <button
                    onClick={() => onBuy(p)}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-500 hover:bg-emerald-500/20"
                  >
                    <Check className="h-3.5 w-3.5" /> Bought
                  </button>
                ) : (
                  <span className="shrink-0 rounded bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">Done</span>
                )}
                <button
                  onClick={() => onDelete(p.id)}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Category picker (built-in + custom categories) ─────────────────────────

function CategoryPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { categories, customCategories, addCategory, removeCategory } = useExpenseUi();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const list = categories.includes(value) || !value ? categories : [...categories, value];

  const submit = () => {
    const created = addCategory(draft);
    if (created) onChange(created);
    setDraft("");
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {list.map((c) => {
        const isCustom = customCategories.includes(c);
        const selected = value === c;
        return (
          <span
            key={c}
            className={cn(
              "group/chip flex items-center rounded-full border text-xs transition",
              selected ? "border-primary/50 bg-primary/15 text-foreground" : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground"
            )}
          >
            <button type="button" onClick={() => onChange(c)} className={cn("py-1.5 pl-3", isCustom ? "pr-1.5" : "pr-3")}>
              {c}
            </button>
            {isCustom && (
              <button
                type="button"
                onClick={() => {
                  removeCategory(c);
                  if (selected) onChange(categories[0]);
                }}
                className="mr-1.5 rounded-full p-0.5 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover/chip:opacity-100"
                title={`Remove "${c}"`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}

      {adding ? (
        <span className="flex items-center gap-1 rounded-full border border-primary/40 bg-background px-2 py-0.5">
          <input
            autoFocus
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
            placeholder="New category"
            className="w-28 bg-transparent px-1 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <button type="button" onClick={submit} className="rounded-full p-0.5 text-primary hover:bg-primary/10" title="Add">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => { setDraft(""); setAdding(false); }} className="rounded-full p-0.5 text-muted-foreground hover:text-foreground" title="Cancel">
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-full border border-dashed border-white/20 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> Add category
        </button>
      )}
    </div>
  );
}

// ─── Edit an existing expense ────────────────────────────────────────────────

function EditExpenseDialog({
  expense,
  saving,
  onClose,
  onSave,
}: {
  expense: Expense | null;
  saving: boolean;
  onClose: () => void;
  onSave: (patch: { amount?: number; category?: string; note?: string; occurred_at?: string }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // Load the expense into the form whenever a different one is opened
  if (expense && expense.id !== loadedId) {
    setLoadedId(expense.id);
    setAmount(String(Number(expense.amount)));
    setCategory(expense.category);
    setNote(expense.note ?? "");
    setDate(format(new Date(expense.occurred_at), "yyyy-MM-dd"));
  }
  if (!expense && loadedId !== null) setLoadedId(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expense) return;
    const n = parseFloat(amount);
    if (!n || n <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    // Keep the original time of day, change only the date
    const original = new Date(expense.occurred_at);
    const [y, m, d] = date.split("-").map(Number);
    const when = new Date(original);
    if (y && m && d) when.setFullYear(y, m - 1, d);
    if (when > new Date()) {
      toast.error("The date can't be in the future");
      return;
    }
    onSave({ amount: n, category, note: note.trim(), occurred_at: when.toISOString() });
  };

  return (
    <Dialog open={expense !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border border-border bg-card text-card-foreground shadow-2xl rounded-2xl w-[calc(100vw-2rem)] sm:max-w-md p-5 sm:p-6">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold text-foreground">Edit expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-5">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11 text-base"
                autoFocus
              />
              <div className="grid h-11 place-items-center rounded-md border border-border px-3 text-sm font-semibold text-muted-foreground">{CURRENCY}</div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</label>
              <CategoryPicker value={category} onChange={setCategory} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Note</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you buy? (optional)" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</label>
              <Input type="date" value={date} max={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setDate(e.target.value)} className="h-10" />
            </div>
          </div>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-9 rounded-xl text-xs">Cancel</Button>
            <Button type="submit" size="sm" disabled={saving} className="h-9 rounded-xl px-4 text-xs font-semibold">
              {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
