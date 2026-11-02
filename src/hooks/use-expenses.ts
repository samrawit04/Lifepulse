import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/integrations/api/client";
import type { Expense, ExpenseInsert, ExpenseUpdate } from "@/lib/lifeos-types";

const KEY = ["expenses"] as const;
const BUDGETS_KEY = ["category-budgets"] as const;

export function useExpenses() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Expense[]> => {
      return apiClient.get<Expense[]>("/api/expenses");
    },
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<ExpenseInsert, "user_id">) => {
      return apiClient.post<Expense>("/api/expenses", input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ExpenseUpdate }) => {
      await apiClient.patch(`/api/expenses/${id}`, patch);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/expenses/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCategoryBudgets() {
  return useQuery({
    queryKey: BUDGETS_KEY,
    queryFn: async (): Promise<Record<string, number>> => {
      return apiClient.get<Record<string, number>>("/api/category-budgets");
    },
  });
}

export function useUpsertCategoryBudgets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (budgets: Record<string, number>) => {
      return apiClient.put<Record<string, number>>("/api/category-budgets", { budgets });
    },
    onSuccess: (data) => {
      qc.setQueryData(BUDGETS_KEY, data);
      qc.invalidateQueries({ queryKey: BUDGETS_KEY });
    },
  });
}
