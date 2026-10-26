import { useState, useEffect } from "react";
import { useCurrentUser } from "@/hooks/use-lifeos";

export const PROFILE_STORAGE_KEY = "lifepulse.user_profile.v1";

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

export function useUserProfile() {
  const { data: user } = useCurrentUser();

  const [profile, setProfile] = useState<UserProfileData>(() => {
    if (typeof window === "undefined") {
      return { displayName: "", avatarUrl: "", statusMessage: "" };
    }
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : { displayName: "", avatarUrl: "", statusMessage: "" };
    } catch {
      return { displayName: "", avatarUrl: "", statusMessage: "" };
    }
  });

  useEffect(() => {
    const update = () => {
      try {
        const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
        if (raw) setProfile(JSON.parse(raw));
      } catch {}
    };
    window.addEventListener("storage", update);
    window.addEventListener("lifepulse:profile-updated", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("lifepulse:profile-updated", update);
    };
  }, []);

  const defaultName = deriveDefaultName(user?.email);
  const displayName = profile.displayName.trim() || defaultName;

  return {
    user,
    profile,
    setProfile,
    displayName,
    defaultName,
  };
}
