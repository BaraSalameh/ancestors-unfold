import { useSyncExternalStore } from "react";
import { familyStore, type FamilyLoadState, type PersistenceState } from "./family-store";

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
