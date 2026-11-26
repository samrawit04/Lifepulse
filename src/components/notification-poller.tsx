/**
 * NotificationPoller — mounted inside the authenticated app shell.
 * Reads live items, expenses and category budgets (all from the API) and feeds
 * them to the notification engine.
 */
import { useMemo } from "react";
import { useItems } from "@/hooks/use-lifeos";
import { useCategoryBudgets, useExpenses } from "@/hooks/use-expenses";
import { useNotificationPoller } from "@/lib/notification-context";

const NO_BUDGETS: Record<string, number> = {};

export function NotificationPoller() {
  const { data: items = [], isSuccess: itemsReady } = useItems();
  const { data: expenses = [], isSuccess: expensesReady } = useExpenses();
  const { data: budgetData, isFetched: budgetsFetched } = useCategoryBudgets();

  const categoryBudgets = useMemo(() => {
    const raw = budgetData ?? NO_BUDGETS;
    // API returns decimals; normalise to numbers
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)]));
  }, [budgetData]);

  const monthlyBudget = useMemo(
    () => Object.values(categoryBudgets).reduce((s, v) => s + v, 0),
    [categoryBudgets]
  );

  useNotificationPoller({
    items,
    expenses,
    categoryBudgets,
    monthlyBudget,
    ready: itemsReady && expensesReady && budgetsFetched,
  });

  return null; // renders nothing, just fires effects
}
