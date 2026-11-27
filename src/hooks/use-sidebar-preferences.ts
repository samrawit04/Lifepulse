import { useState, useEffect, useCallback } from "react";
import type { ComponentType } from "react";
import {
  LayoutDashboard,
  StickyNote,
  NotebookText,
  CalendarDays,
  CheckSquare,
  Wallet,
  Clapperboard,
  BookOpen,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/integrations/api/client";
import { USER_PROFILE_KEY } from "@/hooks/use-user-profile";

export interface SidebarConfigItem {
  to: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  required?: boolean;
}

export const ALL_SIDEBAR_ITEMS: SidebarConfigItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    description: "Daily overview, metrics & quick launch",
    icon: LayoutDashboard,
    required: true,
  },
  {
    to: "/sticky",
    label: "Sticky Notes",
    description: "Freeform corkboard canvas & quick memos",
    icon: StickyNote,
  },
  {
    to: "/notebooks",
    label: "Notebooks",
    description: "Nested folders & rich documents",
    icon: NotebookText,
  },
  {
    to: "/calendar",
    label: "Calendar",
    description: "Schedule, timeline & upcoming events",
    icon: CalendarDays,
  },
  {
    to: "/tasks",
    label: "Tasks",
    description: "Kanban board & upcoming deadlines",
    icon: CheckSquare,
  },
  {
    to: "/expenses",
    label: "Expenses",
    description: "Budget tracking, analytics & purchases",
    icon: Wallet,
  },
  {
    to: "/music",
    label: "Watch",
    description: "Podcasts, music, documentaries & more",
    icon: Clapperboard,
  },
  {
    to: "/books",
    label: "Books",
    description: "Free books, a built-in reader & reading lists",
    icon: BookOpen,
  },
];

export type SidebarPreferences = Record<string, boolean>;

function buildDefaultPrefs(): SidebarPreferences {
  const defaults: SidebarPreferences = {};
  ALL_SIDEBAR_ITEMS.forEach((item) => {
    defaults[item.to] = true;
  });
  return defaults;
}

function hiddenArrayToPrefs(hiddenItems: string[] | null | undefined): SidebarPreferences {
  const prefs = buildDefaultPrefs();
  if (hiddenItems) {
    hiddenItems.forEach((route) => {
      prefs[route] = false;
    });
  }
  // Required items always visible
  ALL_SIDEBAR_ITEMS.forEach((item) => {
    if (item.required) prefs[item.to] = true;
  });
  return prefs;
}

function prefsToHiddenArray(prefs: SidebarPreferences): string[] {
  return ALL_SIDEBAR_ITEMS.filter(
    (item) => !item.required && prefs[item.to] === false
  ).map((item) => item.to);
}

export function useSidebarPreferences() {
  const qc = useQueryClient();
  const [preferences, setPreferences] = useState<SidebarPreferences>(buildDefaultPrefs);

  // Sync from backend profile when it loads
  useEffect(() => {
    const profileData = qc.getQueryData<{ hidden_sidebar_items?: string[] | null }>(USER_PROFILE_KEY);
    if (profileData !== undefined) {
      const prefs = hiddenArrayToPrefs(profileData?.hidden_sidebar_items);
      setPreferences(prefs);
    }
  // Subscribe to profile cache changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch profile query cache for updates
  useEffect(() => {
    return qc.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        JSON.stringify(event.query.queryKey) === JSON.stringify(USER_PROFILE_KEY)
      ) {
        const data = event.query.state.data as { hidden_sidebar_items?: string[] | null } | null;
        if (data !== undefined) {
          const prefs = hiddenArrayToPrefs(data?.hidden_sidebar_items);
          setPreferences(prefs);
        }
      }
    });
  }, [qc]);

  const savePreferences = useCallback(
    async (newPrefs: SidebarPreferences) => {
      // Ensure required items are always true
      ALL_SIDEBAR_ITEMS.forEach((item) => {
        if (item.required) newPrefs[item.to] = true;
      });
      setPreferences(newPrefs);

      // Persist to backend
      const hiddenItems = prefsToHiddenArray(newPrefs);
      try {
        const updated = await apiClient.profile.update({ hidden_sidebar_items: hiddenItems });
        qc.setQueryData(USER_PROFILE_KEY, updated);
      } catch (e) {
        console.error("Failed to save sidebar preferences to backend", e);
      }
    },
    [qc]
  );

  const toggleItem = useCallback(
    (to: string) => {
      const item = ALL_SIDEBAR_ITEMS.find((i) => i.to === to);
      if (item?.required) return; // cannot hide required items
      const next = {
        ...preferences,
        [to]: !preferences[to],
      };
      savePreferences(next);
    },
    [preferences, savePreferences]
  );

  const setItemVisible = useCallback(
    (to: string, visible: boolean) => {
      const item = ALL_SIDEBAR_ITEMS.find((i) => i.to === to);
      if (item?.required) return;
      const next = {
        ...preferences,
        [to]: visible,
      };
      savePreferences(next);
    },
    [preferences, savePreferences]
  );

  const isVisible = useCallback(
    (to: string): boolean => {
      const item = ALL_SIDEBAR_ITEMS.find((i) => i.to === to);
      if (item?.required) return true;
      return preferences[to] !== false;
    },
    [preferences]
  );

  const resetToDefault = useCallback(() => {
    savePreferences(buildDefaultPrefs());
  }, [savePreferences]);

  const showAll = useCallback(() => {
    savePreferences(buildDefaultPrefs());
  }, [savePreferences]);

  return {
    items: ALL_SIDEBAR_ITEMS,
    preferences,
    isVisible,
    toggleItem,
    setItemVisible,
    resetToDefault,
    showAll,
  };
}
