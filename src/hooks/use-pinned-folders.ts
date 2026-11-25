import { useCallback, useMemo } from "react";
import { useUserSetting } from "@/hooks/use-user-setting";

const EMPTY: string[] = [];

/** Pinned notebook folders, stored on the server per user. */
export function usePinnedFolders() {
  const { value, save } = useUserSetting<string[]>("notebooks-pinned-folders", EMPTY);
  const pinnedFolderIds = useMemo(() => new Set(value), [value]);

  const togglePinFolder = useCallback(
    (id: string) => {
      const next = new Set(value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      save([...next]);
    },
    [value, save]
  );

  return { pinnedFolderIds, togglePinFolder };
}
