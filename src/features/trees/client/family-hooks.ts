import { useSyncExternalStore } from "react";
import { familyStore } from "./family-store";
import type { FamilyLoadState, PersistenceState } from "./family-store-types";

export function useFamily() {
  return useSyncExternalStore(familyStore.subscribe, familyStore.getAll, familyStore.getAll);
}

export function useFamilyPersistence(): PersistenceState {
  return useSyncExternalStore(
    familyStore.subscribe,
    familyStore.getPersistenceState,
    familyStore.getPersistenceState,
  );
}

export function useFamilyLoadState(): FamilyLoadState {
  return useSyncExternalStore(familyStore.subscribe, familyStore.getLoadState, () => "idle");
}
