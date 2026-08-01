import { useBlocker } from "@tanstack/react-router";
import { familyStore, isTreeEditorDestination } from "@/features/trees";

export function useTreeNavigationBlocker(workspace: boolean, dirty: boolean, warning: string) {
  useBlocker({
    shouldBlockFn: ({ next }) => {
      if (!workspace || !dirty) return false;
      const nextSearch = next.search as { mode?: string };
      if (isTreeEditorDestination(next.pathname, nextSearch, familyStore.getActiveTreeId()))
        return false;
      const discard = window.confirm(warning);
      if (discard) familyStore.discardDraft();
      return !discard;
    },
    enableBeforeUnload: workspace && dirty,
  });
}
