export type PersistenceState = {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  conflicted: boolean;
  importPending: boolean;
  phase: "idle" | "preparing" | "uploading_images" | "saving" | "refreshing";
};

export type FamilyLoadState = "idle" | "loading" | "ready" | "error";
