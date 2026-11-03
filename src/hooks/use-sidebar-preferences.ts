import { useState, useEffect, useCallback, createElement } from "react";
import type { ComponentType } from "react";
import {
  LayoutDashboard,
  StickyNote,
  NotebookText,
  CalendarDays,
  CheckSquare,
  Wallet,
  Music,
  Archive,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/integrations/api/client";
import { USER_PROFILE_KEY } from "@/hooks/use-user-profile";

export function PinterestIcon({ className }: { className?: string }) {
  return createElement(
    "svg",
    { className, viewBox: "0 0 24 24", fill: "currentColor" },
    createElement("path", {
      d: "M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345-.09.375-.293 1.199-.334 1.367-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.541.535 6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z",
    })
  );
}

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
    label: "Music",
    description: "Built-in ambient soundscapes & music player",
    icon: Music,
  },
  {
    to: "/pinterest",
    label: "Pinterest",
    description: "Visual moodboards & inspiration library",
    icon: PinterestIcon,
  },
  {
    to: "/archive",
    label: "Archive",
    description: "Archived notes, tasks and records",
    icon: Archive,
  },
];

// Fallback localStorage key (used as initial value before backend loads)
const PREFS_STORAGE_KEY = "lifepulse.sidebar.preferences.v1";

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

function getLocalPrefs(): SidebarPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return buildDefaultPrefs();
    const parsed = JSON.parse(raw) as SidebarPreferences;
    ALL_SIDEBAR_ITEMS.forEach((item) => {
      if (item.required) parsed[item.to] = true;
      else if (parsed[item.to] === undefined) parsed[item.to] = true;
    });
    return parsed;
  } catch {
    return buildDefaultPrefs();
  }
}

export function useSidebarPreferences() {
  const qc = useQueryClient();
  const [preferences, setPreferences] = useState<SidebarPreferences>(getLocalPrefs);

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
      // Save to localStorage as fallback
      try {
        localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(newPrefs));
      } catch {}

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
