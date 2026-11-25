import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/integrations/api/client";

/**
 * Server-persisted per-user preference (GET/PUT /api/settings/:key).
 * Replaces the old browser-storage based preferences so data follows the user
 * across devices.
 *
 * `fallback` is returned until the user has saved a value. Pass a stable
 * (module-level) reference to avoid needless re-renders.
 */
export function useUserSetting<T>(key: string, fallback: T) {
  const qc = useQueryClient();
  const queryKey = ["user-setting", key] as const;

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<T | null> => {
      const res = await apiClient.settings.get<T>(key);
      return res ?? null;
    },
    staleTime: 1000 * 60 * 5,
  });

  const mutation = useMutation({
    mutationFn: (value: T) => apiClient.settings.put<T>(key, value),
    onMutate: async (value) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<T | null>(queryKey);
      qc.setQueryData<T | null>(queryKey, value);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData<T | null>(queryKey, ctx?.prev ?? null);
    },
  });

  const { mutate } = mutation;
  const save = useCallback((value: T) => mutate(value), [mutate]);

  return {
    value: (query.data ?? fallback) as T,
    hasSavedValue: query.data !== null && query.data !== undefined,
    isLoading: query.isLoading,
    save,
    isSaving: mutation.isPending,
  };
}
