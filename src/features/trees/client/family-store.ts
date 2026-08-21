import type { FamilyMember, SubFamily } from "@/features/members/domain";
import { ApiClientError } from "@/shared/api/client";
import { treeClient } from "../api/tree-client";
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
import type { TreeSnapshot } from "../domain/tree-snapshot";
import { createFamilyDraftHistory, type DraftChange } from "./family-draft-history";
import { persistFamilyDraft, type PendingCsvImport } from "./family-draft-persistence";
import { createFamilyDraftTracking } from "./family-draft-tracking";
import { createFamilyStoreSelectors } from "./family-store-selectors";
import { createFamilyCsvStoreApi } from "./family-csv-store-api";
import { cloneMembers, cloneSubfamilies, indexFamily } from "./family-draft-entities";
import { createFamilyImageStaging } from "./family-image-staging";
import {
  discardRemovedDraftImages,
  discardUploadedDraftImages,
} from "./family-draft-image-cleanup";
import type { FamilyLoadState, PersistenceState } from "./family-store-types";

let activeTreeId = "";
let activeAccessMode: TreeAccessMode = "edit";

const SAMPLE: FamilyMember[] = createSampleFamily();

let state: FamilyMember[] = [];
let subfamilies: SubFamily[] = [];
let accessScope: TreeAccessScope = "preview";
let assignedBranchId: string | undefined;
let canImportCsv = false;
const listeners = new Set<() => void>();
const images = createFamilyImageStaging();
let memberById = new Map<string, FamilyMember>();
let branchRootIds = new Set<string>();
const tracking = createFamilyDraftTracking();
let remoteVersion = 1;
let persistenceError: string | null = null;
let saveInFlight = false;
let saveGeneration = 0;
let pendingBatchId: string | null = null;

let pendingCsvImport: PendingCsvImport | null = null;

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
  importPending: false,
  phase: "idle",
};
let savePhase: PersistenceState["phase"] = "idle";
let loadState: FamilyLoadState = "idle";

function canEditActiveTree() {
  return treeAccessPolicy(accessScope, activeAccessMode).canEdit;
}

function clearDraftState() {
  history.clear();
  images.replace(new Map());
  pendingBatchId = null;
  pendingCsvImport = null;
  persistenceError = null;
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
    applySnapshot(snapshot);
  } catch {
    if (activeTreeId !== treeId || activeAccessMode !== accessMode) return;
    state = [];
    subfamilies = [];
    loadState = "error";
    emit();
  }
}

function applySnapshot(snapshot: TreeSnapshot) {
  remoteVersion = snapshot.version;
  accessScope = snapshot.access_scope;
  assignedBranchId = snapshot.assigned_branch_id;
  canImportCsv = snapshot.capabilities?.can_import_csv ?? false;
  state = cloneMembers(snapshot.members);
  subfamilies = cloneSubfamilies(snapshot.subfamilies);
  tracking.setBaseline(cloneMembers(state), cloneSubfamilies(subfamilies));
  rebuildIndexes();
  clearDraftState();
  loadState = "ready";
  emit();
}

async function updateRemoteSnapshot() {
  if (saveInFlight || !isDirty() || persistenceError === "VERSION_CONFLICT") return;
  const treeId = activeTreeId;
  const batchId = pendingBatchId ?? crypto.randomUUID();
  pendingBatchId = batchId;
  saveInFlight = true;
  emit();
  try {
    const activeImport = pendingCsvImport;
    const result = await persistFamilyDraft({
      treeId,
      batchId,
      remoteVersion,
      activeImport,
      stagedImages: images.files,
      dirtyMemberIds: tracking.dirtyMemberIds,
      dirtySubfamilyIds: tracking.dirtySubfamilyIds,
      getMembers: () => state,
      getSubfamilies: () => subfamilies,
      onImageUploaded: (memberId, uploaded) => {
        state = state.map((member) =>
          member.id === memberId
            ? { ...member, ...uploaded, updated_at: new Date().toISOString() }
            : member,
        );
        images.uploaded(memberId);
      },
      onPhase: (phase) => {
        savePhase = phase;
        emit();
      },
    });
    if (activeTreeId === treeId) {
      remoteVersion = result.version;
      if (result.imported) {
        pendingCsvImport = null;
        loadState = "loading";
        savePhase = "refreshing";
        emit();
        await hydrateFromServer(treeId, activeAccessMode);
      } else {
        tracking.setBaseline(result.members, result.subfamilies);
        history.clear();
        pendingBatchId = null;
        persistenceError = null;
      }
    }
  } catch (error) {
    persistenceError =
      error instanceof ApiClientError
        ? error.code
        : images.files.size
          ? "IMAGE_UPLOAD_FAILED"
          : "NETWORK_ERROR";
  } finally {
    saveInFlight = false;
    savePhase = "idle";
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
    subfamilies = [];
    return;
  }
  state = [];
  subfamilies = [];
  loadState = "loading";
  void hydrateFromServer(activeTreeId, activeAccessMode);
}

function isDirty() {
  return Boolean(pendingCsvImport) || images.files.size > 0 || tracking.hasChanges();
}

function emit() {
  cachedPersistenceState = {
    dirty: isDirty(),
    saving: saveInFlight,
    error: persistenceError,
    conflicted: persistenceError === "VERSION_CONFLICT",
    importPending: Boolean(pendingCsvImport),
    phase: savePhase,
  };
  for (const l of listeners) l();
}

function rebuildIndexes() {
  ({ memberById, branchRootIds } = indexFamily(state, subfamilies));
}

function discardUploadedDraftAssets() {
  discardUploadedDraftImages(activeTreeId, state, tracking.baselineMember);
}

function afterHistoryChange(change: DraftChange) {
  rebuildIndexes();
  tracking.refresh(change, state, subfamilies);
}

const history = createFamilyDraftHistory({
  canEdit: canEditActiveTree,
  getMembers: () => state,
  setMembers: (next) => {
    state = next;
  },
  getSubfamilies: () => subfamilies,
  setSubfamilies: (next) => {
    subfamilies = next;
  },
  getImages: () => images.files,
  replaceImages: images.replace,
  discardRemovedImages: (current, next) =>
    discardRemovedDraftImages(activeTreeId, current, next, tracking.baselineAssetIds()),
  afterChange: afterHistoryChange,
  markChanged: () => {
    markDraftChanged();
    emit();
  },
});

const memberCommandContext: MemberCommandContext = {
  get state() {
    return state;
  },
  set state(next) {
    state = next;
  },
  get stagedImages() {
    return images.files;
  },
  set stagedImages(next) {
    images.files = next;
  },
  commit: history.commit,
  replaceStagedImages: images.replace,
  emit,
  protectedGender(id) {
    return pendingCsvImport?.protectedMemberIds.get(id);
  },
  isBranchRoot(id) {
    return branchRootIds.has(id);
  },
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
  commit: history.commit,
  emit,
  canDeleteSubfamily(id) {
    return !pendingCsvImport?.protectedBranchIds.has(id);
  },
};

const selectors = createFamilyStoreSelectors({
  activeTreeId: () => activeTreeId,
  persistenceError: () => persistenceError,
  persistenceState: () => cachedPersistenceState,
  loadState: () => loadState,
  members: () => state,
  canManageSubfamilies: () => treeAccessPolicy(accessScope, activeAccessMode).canManageSubfamilies,
  accessScope: () => accessScope,
  assignedBranchId: () => assignedBranchId,
  canEdit: canEditActiveTree,
  member: (id) => memberById.get(id),
  stagedImage: images.file,
  memberImageSrc: (id) => images.url(id) ?? memberById.get(id)?.image_url,
  branchRoot: (id) => memberCommandContext.isBranchRoot?.(id) ?? false,
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
});

const familyCsvApi = createFamilyCsvStoreApi({
  canImport: () => canImportCsv,
  canEdit: canEditActiveTree,
  isDirty,
  remoteVersion: () => remoteVersion,
  members: () => state,
  subfamilies: () => subfamilies,
  pendingImport: () => pendingCsvImport,
  applyDraft: (members, branches, pending) => {
    images.replace(new Map());
    state = members;
    subfamilies = branches;
    rebuildIndexes();
    pendingCsvImport = pending;
    history.clear();
    pendingBatchId = crypto.randomUUID();
    markDraftChanged();
    emit();
  },
});

export const familyStore = {
  ...selectors,
  ...familyCsvApi,
  reloadAfterConflict(): void {
    discardUploadedDraftAssets();
    clearDraftState();
    canImportCsv = false;
    loadState = "loading";
    void hydrateFromServer(activeTreeId, activeAccessMode);
    emit();
  },
  activateTree(
    treeId: string,
    accessMode: TreeAccessMode = "edit",
    initialSnapshot?: TreeSnapshot,
  ): void {
    if (!treeId) return;
    if (activeTreeId === treeId && activeAccessMode === accessMode) {
      if (initialSnapshot && loadState !== "ready" && !isDirty()) applySnapshot(initialSnapshot);
      return;
    }
    discardUploadedDraftAssets();
    clearDraftState();
    activeTreeId = treeId;
    activeAccessMode = accessMode;
    accessScope = "preview";
    assignedBranchId = undefined;
    remoteVersion = 1;
    canImportCsv = false;
    if (initialSnapshot) applySnapshot(initialSnapshot);
    else {
      load();
      emit();
    }
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
    images.replace(new Map());
    state = cloneMembers(tracking.baselineMembers);
    subfamilies = cloneSubfamilies(tracking.baselineSubfamilies);
    rebuildIndexes();
    tracking.reset();
    history.clear();
    pendingBatchId = null;
    pendingCsvImport = null;
    persistenceError = null;
    saveGeneration += 1;
    emit();
  },
  createDraftCheckpoint(): DraftCheckpoint {
    return {
      members: cloneMembers(state),
      subfamilies: cloneSubfamilies(subfamilies),
      stagedImages: new Map(images.files),
    };
  },
  restoreDraftCheckpoint(checkpoint: DraftCheckpoint): void {
    if (saveInFlight || !canEditActiveTree()) return;
    state = cloneMembers(checkpoint.members);
    subfamilies = cloneSubfamilies(checkpoint.subfamilies);
    rebuildIndexes();
    tracking.recalculate(state, subfamilies);
    images.replace(checkpoint.stagedImages);
    history.clear();
    markDraftChanged();
    emit();
  },
  deleteTreeData(treeId: string): void {
    void treeClient.deleteTree(treeId);
  },
  ...createMemberCommands(memberCommandContext),
  undo: history.undo,
  redo: history.redo,
  canUndo: history.canUndo,
  canRedo: history.canRedo,

  reset() {
    if (pendingCsvImport) return;
    history.commit(() => {
      state = SAMPLE;
    });
  },

  ...createSubfamilyCommands(subfamilyCommandContext),
};
