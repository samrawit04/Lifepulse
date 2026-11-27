import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/integrations/api/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Income {
  id: string;
  amount: number;
  source: string;
  note: string | null;
  received_at: string;
  created_at: string;
  updated_at: string;
}

export type DebtDirection = "i_owe" | "owed_to_me";

export interface DebtPayment {
  id: string;
  amount: number;
  note: string | null;
  paid_at: string;
}

export interface Debt {
  id: string;
  direction: DebtDirection;
  person: string;
  amount: number;
  paid: number;
  remaining: number;
  note: string | null;
  due_date: string | null;
  settled: boolean;
  created_at: string;
  updated_at: string;
  payments: DebtPayment[];
}

const INCOMES_KEY = ["incomes"] as const;
const DEBTS_KEY = ["debts"] as const;

const num = (v: unknown) => Number(v ?? 0);
const normIncome = (i: Income): Income => ({ ...i, amount: num(i.amount) });
const normDebt = (d: Debt): Debt => ({
  ...d,
  amount: num(d.amount),
  paid: num(d.paid),
  remaining: num(d.remaining),
  due_date: d.due_date ?? null,
  note: d.note ?? null,
  payments: (d.payments ?? []).map((p) => ({ ...p, amount: num(p.amount), note: p.note ?? null })),
});

// ─── Incomes ─────────────────────────────────────────────────────────────────

export function useIncomes() {
  return useQuery({
    queryKey: INCOMES_KEY,
    queryFn: async () => (await apiClient.get<Income[]>("/api/incomes")).map(normIncome),
  });
}

export function useCreateIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: number; source: string; note?: string | null; received_at?: string }) =>
      apiClient.post<Income>("/api/incomes", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: INCOMES_KEY }),
  });
}

export function useUpdateIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<Income, "amount" | "source" | "note" | "received_at">> }) =>
      apiClient.patch<Income>(`/api/incomes/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: INCOMES_KEY }),
  });
}

export function useDeleteIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/incomes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: INCOMES_KEY }),
  });
}

// ─── Debts ───────────────────────────────────────────────────────────────────

export function useDebts() {
  return useQuery({
    queryKey: DEBTS_KEY,
    queryFn: async () => (await apiClient.get<Debt[]>("/api/debts")).map(normDebt),
  });
}

function useDebtMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: DEBTS_KEY }) });
}

export function useCreateDebt() {
  return useDebtMutation((input: { direction: DebtDirection; person: string; amount: number; note?: string | null; due_date?: string | null }) =>
    apiClient.post<Debt>("/api/debts", input)
  );
}

export function useUpdateDebt() {
  return useDebtMutation(
    ({ id, patch }: { id: string; patch: { person?: string; amount?: number; note?: string; due_date?: string; clear_due_date?: boolean; settled?: boolean } }) =>
      apiClient.patch<Debt>(`/api/debts/${id}`, patch)
  );
}

export function useDeleteDebt() {
  return useDebtMutation((id: string) => apiClient.delete<void>(`/api/debts/${id}`));
}

export function useAddDebtPayment() {
  return useDebtMutation(({ id, amount, note, paid_at }: { id: string; amount: number; note?: string | null; paid_at?: string }) =>
    apiClient.post<Debt>(`/api/debts/${id}/payments`, { amount, note, paid_at })
  );
}

export function useDeleteDebtPayment() {
  return useDebtMutation(({ id, paymentId }: { id: string; paymentId: string }) =>
    apiClient.delete<Debt>(`/api/debts/${id}/payments/${paymentId}`)
  );
}
