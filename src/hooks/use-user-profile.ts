import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/integrations/api/client";
import type { User } from "@/integrations/api/client";

export const USER_PROFILE_KEY = ["user-profile"] as const;

export interface UserProfileData {
  displayName: string;
  avatarUrl: string;
  statusMessage: string;
}

export function deriveDefaultName(email?: string): string {
  if (!email) return "User";
  const prefix = email.split("@")[0] || "User";
  const clean = prefix.replace(/[0-9._-]+/g, " ").trim();
  if (!clean) return "User";
  return clean
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Returns the full user profile from the backend (GET /api/auth/me). */
export function useUserProfile() {
  return useQuery<User | null>({
    queryKey: USER_PROFILE_KEY,
    queryFn: async () => {
      try {
        return await apiClient.profile.get();
      } catch {
        return null;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 min
  });
}

/** Mutation to PATCH /api/auth/profile. Invalidates the profile cache on success. */
export function useUpdateUserProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof apiClient.profile.update>[0]) =>
      apiClient.profile.update(data),
    onSuccess: (updated) => {
      qc.setQueryData(USER_PROFILE_KEY, updated);
    },
  });
}
