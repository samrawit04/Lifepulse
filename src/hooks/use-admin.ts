import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/api/client";

/** Whether the signed-in account may see the Admin tab (decided by the server). */
export function useIsAdmin() {
  const q = useQuery({
    queryKey: ["admin-me"],
    queryFn: () => apiClient.admin.me(),
    staleTime: 1000 * 60 * 10,
    retry: false,
  });
  return q.data?.is_admin === true;
}
