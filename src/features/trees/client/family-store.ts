import type { FamilyMember, SubFamily } from "@/features/members/domain";
import { ApiClientError } from "@/shared/api/client";
import { treeClient } from "../api/tree-client";
// eslint-disable-next-line no-restricted-imports -- tree persistence coordinates staged member-image uploads.
import { memberImageClient } from "@/features/members/api";
import { createMemberCommands, type MemberCommandContext } from "./family-store-member-commands";
import {
  createSubfamilyCommands,
  type SubfamilyCommandContext,
} from "./family-store-subfamily-commands";
import { createSampleFamily } from "./sample-family";
import {
  treeAccessPolicy,
  type TreeAccessMode,
  type TreeAccessScope,
} from "../domain/access-policy";

let activeTreeId = "";
let activeAccessMode: TreeAccessMode = "edit";

const SAMPLE: FamilyMember[] = createSampleFamily();

let state: FamilyMember[] = [];
let subfamilies: SubFamily[] = [];
let accessScope: TreeAccessScope = "preview";
let assignedBranchId: string | undefined;
const listeners = new Set<() => void>();
type DraftSnapshot = { members: FamilyMember[]; stagedImages: Map<string, File> };
let past: DraftSnapshot[] = [];
let future: DraftSnapshot[] = [];
let stagedImages = new Map<string, File>();
let stagedImageUrls = new Map<string, string>();
let baselineMembers: FamilyMember[] = [];
let baselineSubfamilies: SubFamily[] = [];
let remoteVersion = 1;
let persistenceError: string | null = null;
let saveInFlight = false;
let saveGeneration = 0;
let pendingBatchId: string | null = null;

export type PersistenceState = {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  conflicted: boolean;
};

type DraftCheckpoint = {
  members: FamilyMember[];
  subfamilies: SubFamily[];
  stagedImages: Map<string, File>;
};

let cachedPersistenceState: PersistenceState = {
  dirty: false,
  saving: false,
  error: null,
  conflicted: false,
};
export type FamilyLoadState = "idle" | "loading" | "ready" | "error";
let loadState: FamilyLoadState = "idle";

function canEditActiveTree() {
  return treeAccessPolicy(accessScope, activeAccessMode).canEdit;
}

async function hydrateFromServer(treeId: string, accessMode: TreeAccessMode) {
  const generation = saveGeneration;
  try {
    const snapshot = await (accessMode === "preview"
      ? treeClient.readPublicSnapshot(treeId)
      : treeClient.readSnapshot(treeId));
    // Never let a late hydration response replace edits made while it was loading.
    if (activeTreeId !== treeId || activeAccessMode !== accessMode || saveGeneration !== generation)
      return;
    remoteVersion = snapshot.version;
    accessScope = snapshot.access_scope;
    assignedBranchId = snapshot.assigned_branch_id;
    state = cloneMembers(snapshot.members);
    subfamilies = cloneSubfamilies(snapshot.subfamilies);
    baselineMembers = cloneMembers(state);
    baselineSubfamilies = cloneSubfamilies(subfamilies);
    past = [];
    future = [];
    replaceStagedImages(new Map());
    pendingBatchId = null;
    persistenceError = null;
    loadState = "ready";
    emit();
  } catch {
    if (activeTreeId !== treeId || activeAccessMode !== accessMode) return;
    state = [];
    subfamilies = [];
    loadState = "error";
    emit();
  }
}

async function updateRemoteSnapshot() {
  if (saveInFlight || !isDirty() || persistenceError === "VERSION_CONFLICT") return;
  const treeId = activeTreeId;
  const batchId = pendingBatchId ?? crypto.randomUUID();
  pendingBatchId = batchId;
  saveInFlight = true;
  emit();
  try {
    for (const [memberId, file] of [...stagedImages]) {
      const uploaded = await memberImageClient.upload(treeId, memberId, file, () => undefined);
      state = state.map((member) =>
        member.id === memberId
          ? { ...member, ...uploaded, updated_at: new Date().toISOString() }
          : member,
      );
      const previewUrl = stagedImageUrls.get(memberId);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      stagedImages.delete(memberId);
      stagedImageUrls.delete(memberId);
    }
    const members = cloneMembers(state);
    const currentSubfamilies = cloneSubfamilies(subfamilies);
    const result = await treeClient.saveSnapshot(treeId, {
      batchId,
      expectedVersion: remoteVersion,
      members,
      subfamilies: currentSubfamilies,
    });
    if (activeTreeId === treeId) {
      remoteVersion = result.version;
      baselineMembers = members;
      baselineSubfamilies = currentSubfamilies;
      past = [];
      future = [];
      pendingBatchId = null;
      persistenceError = null;
    }
  } catch (error) {
    persistenceError =
      error instanceof ApiClientError
        ? error.code
        : stagedImages.size
          ? "IMAGE_UPLOAD_FAILED"
          : "NETWORK_ERROR";
  } finally {
    saveInFlight = false;
    emit();
  }
}

function markDraftChanged() {
  if (typeof window === "undefined" || activeAccessMode === "preview") return;
  saveGeneration += 1;
  persistenceError = persistenceError === "VERSION_CONFLICT" ? persistenceError : null;
  if (!pendingBatchId) pendingBatchId = crypto.randomUUID();
  emit();
}

function load() {
  if (typeof window === "undefined") {
    state = [];
    return;
  }
  state = [];
  loadState = "loading";
  void hydrateFromServer(activeTreeId, activeAccessMode);
}

function isDirty() {
  return (
    stagedImages.size > 0 ||
    JSON.stringify(baselineMembers) !== JSON.stringify(state) ||
    JSON.stringify(baselineSubfamilies) !== JSON.stringify(subfamilies)
  );
}

function emit() {
  cachedPersistenceState = {
    dirty: isDirty(),
    saving: saveInFlight,
    error: persistenceError,
    conflicted: persistenceError === "VERSION_CONFLICT",
  };
  for (const l of listeners) l();
}

function cloneMembers(members: FamilyMember[]): FamilyMember[] {
  return members.map((m) => ({
    ...m,
    spouse_ids: m.spouse_ids ? [...m.spouse_ids] : undefined,
    divorced_from: m.divorced_from ? [...m.divorced_from] : undefined,
  }));
}

function cloneSubfamilies(items: SubFamily[]): SubFamily[] {
  return items.map((item) => ({
    ...item,
    attachments: item.attachments?.map((attachment) => ({ ...attachment })) ?? [],
  }));
}

function loadSubfamilies() {
  if (typeof window === "undefined") {
    subfamilies = [];
    return;
  }
  subfamilies = [];
}

function snapshot(): DraftSnapshot {
  return { members: cloneMembers(state), stagedImages: new Map(stagedImages) };
}

function replaceStagedImages(next: ReadonlyMap<string, File>) {
  for (const url of stagedImageUrls.values()) URL.revokeObjectURL(url);
  stagedImages = new Map(next);
  stagedImageUrls = new Map(
    [...stagedImages].map(([memberId, file]) => [memberId, URL.createObjectURL(file)]),
  );
}

function discardUploadedDraftAssets() {
  for (const member of state) {
    const baseline = baselineMembers.find(({ id }) => id === member.id);
    if (member.image_asset_id && member.image_asset_id !== baseline?.image_asset_id)
      void memberImageClient.discard(activeTreeId, member.image_asset_id).catch(() => undefined);
  }
}

function commit(mutator: () => void) {
  if (!canEditActiveTree()) return;
  const before = snapshot();
  mutator();
  if (
    JSON.stringify(before.members) === JSON.stringify(state) &&
    before.stagedImages.size === stagedImages.size
  )
    return;
  past = [...past, before];
  future = [];
  markDraftChanged();
  emit();
}

function applySnapshot(next: DraftSnapshot) {
  if (!canEditActiveTree()) return;
  for (const member of state) {
    if (
      member.image_asset_id &&
      !next.members.some((candidate) => candidate.image_asset_id === member.image_asset_id) &&
      !baselineMembers.some((candidate) => candidate.image_asset_id === member.image_asset_id)
    )
      void memberImageClient.discard(activeTreeId, member.image_asset_id).catch(() => undefined);
  }
  state = cloneMembers(next.members);
  replaceStagedImages(next.stagedImages);
  markDraftChanged();
  emit();
}

const memberCommandContext: MemberCommandContext = {
  get state() {
    return state;
  },
  set state(next) {
    state = next;
  },
  get stagedImages() {
    return stagedImages;
  },
  set stagedImages(next) {
    stagedImages = next;
  },
  commit,
  replaceStagedImages,
  emit,
};

const subfamilyCommandContext: SubfamilyCommandContext = {
  get state() {
    return state;
  },
  set state(next) {
    state = next;
  },
  get subfamilies() {
    return subfamilies;
  },
  set subfamilies(next) {
    subfamilies = next;
  },
  commit,
  markDraftChanged,
  emit,
};

export const familyStore = {
  getActiveTreeId(): string {
    return activeTreeId;
  },
  getPersistenceError(): string | null {
    return persistenceError;
  },
  getPersistenceState(): PersistenceState {
    return cachedPersistenceState;
  },
  getLoadState(): FamilyLoadState {
    return loadState;
  },
  reloadAfterConflict(): void {
    discardUploadedDraftAssets();
    replaceStagedImages(new Map());
    persistenceError = null;
    pendingBatchId = null;
    loadState = "loading";
    void hydrateFromServer(activeTreeId, activeAccessMode);
    emit();
  },
  activateTree(treeId: string, accessMode: TreeAccessMode = "edit"): void {
    if (!treeId || (activeTreeId === treeId && activeAccessMode === accessMode)) return;
    discardUploadedDraftAssets();
    replaceStagedImages(new Map());
    activeTreeId = treeId;
    activeAccessMode = accessMode;
    accessScope = "preview";
    assignedBranchId = undefined;
    past = [];
    future = [];
    remoteVersion = 1;
    persistenceError = null;
    pendingBatchId = null;
    load();
    loadSubfamilies();
    emit();
  },
  initializeTree(treeId: string, accessMode: TreeAccessMode = "edit"): void {
    familyStore.activateTree(treeId, accessMode);
  },
  async updateSnapshot(): Promise<void> {
    if (saveInFlight) return;
    await updateRemoteSnapshot();
    if (persistenceError) throw new ApiClientError(persistenceError, 0);
  },
  discardDraft(): void {
    if (saveInFlight) return;
    discardUploadedDraftAssets();
    replaceStagedImages(new Map());
    state = cloneMembers(baselineMembers);
    subfamilies = cloneSubfamilies(baselineSubfamilies);
    past = [];
    future = [];
    pendingBatchId = null;
    persistenceError = null;
    saveGeneration += 1;
    emit();
  },
  createDraftCheckpoint(): DraftCheckpoint {
    return {
      members: cloneMembers(state),
      subfamilies: cloneSubfamilies(subfamilies),
      stagedImages: new Map(stagedImages),
    };
  },
  restoreDraftCheckpoint(checkpoint: DraftCheckpoint): void {
    if (saveInFlight || !canEditActiveTree()) return;
    state = cloneMembers(checkpoint.members);
    subfamilies = cloneSubfamilies(checkpoint.subfamilies);
    replaceStagedImages(checkpoint.stagedImages);
    past = [];
    future = [];
    markDraftChanged();
    emit();
  },
  deleteTreeData(treeId: string): void {
    void treeClient.deleteTree(treeId);
  },
  getAll: (): FamilyMember[] => state,
  canManageSubfamilies(): boolean {
    return treeAccessPolicy(accessScope, activeAccessMode).canManageSubfamilies;
  },
  getAccessScope: (): TreeAccessScope => accessScope,
  getAssignedBranchId: (): string | undefined => assignedBranchId,
  canEditActiveTree(): boolean {
    return canEditActiveTree();
  },
  get(id: string): FamilyMember | undefined {
    return state.find((m) => m.id === id);
  },
  getStagedMemberImage(id: string): File | undefined {
    return stagedImages.get(id);
  },
  getMemberImageSrc(id: string): string | undefined {
    return stagedImageUrls.get(id) ?? state.find((member) => member.id === id)?.image_url;
  },
  ...createMemberCommands(memberCommandContext),
  undo(): void {
    if (!past.length) return;
    const previous = past[past.length - 1];
    future = [snapshot(), ...future];
    past = past.slice(0, -1);
    applySnapshot(previous);
  },
  redo(): void {
    if (!future.length) return;
    const next = future[0];
    past = [...past, snapshot()];
    future = future.slice(1);
    applySnapshot(next);
  },
  canUndo(): boolean {
    return past.length > 0;
  },
  canRedo(): boolean {
    return future.length > 0;
  },

  reset() {
    commit(() => {
      state = SAMPLE;
    });
  },

  ...createSubfamilyCommands(subfamilyCommandContext),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
