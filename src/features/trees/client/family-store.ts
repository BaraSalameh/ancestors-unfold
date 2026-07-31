import { useSyncExternalStore } from "react";
import type { FamilyMember, MemberInput, SubFamily } from "@/features/members/domain";
import { ApiClientError } from "@/shared/api/client";
import { treeClient } from "../api/tree-client";
import {
  detachParentRelationship,
  getChildren as queryChildren,
  getGeneration as queryGeneration,
  getSubfamilyMembers as querySubfamilyMembers,
} from "@/features/members/domain";
import {
  treeAccessPolicy,
  type TreeAccessMode,
  type TreeAccessScope,
} from "../domain/access-policy";
import {
  ensureParentsAreSpouses,
  linkSpouses,
  removeMember,
  removeSpouseAttachment,
  toggleDivorce as toggleDivorceRelationship,
} from "@/features/members/domain";

let activeTreeId = "";
let activeAccessMode: TreeAccessMode = "edit";

const SAMPLE: FamilyMember[] = (() => {
  const now = new Date().toISOString();
  const m = (
    id: string,
    name_en: string,
    name_ar: string,
    gender: "male" | "female",
    extra: Partial<FamilyMember> = {},
  ): FamilyMember => ({
    id,
    name_en,
    name_ar,
    gender,
    citizen_status: "resident",
    created_at: now,
    updated_at: now,
    ...extra,
  });
  return [
    m("1", "Abdullah Al-Rashid", "عبدالله الراشد", "male", {
      birth_date: "1920-03-12",
      death_date: "1998-11-04",
    }),
    m("2", "Fatimah Al-Saeed", "فاطمة السعيد", "female", {
      birth_date: "1925-06-22",
      death_date: "2002-01-18",
      spouse_id: "1",
    }),
    m("3", "Mohammed Al-Rashid", "محمد الراشد", "male", {
      birth_date: "1948-09-01",
      father_id: "1",
      mother_id: "2",
    }),
    m("4", "Aisha Al-Mansour", "عائشة المنصور", "female", {
      birth_date: "1952-04-14",
      spouse_id: "3",
    }),
    m("5", "Khalid Al-Rashid", "خالد الراشد", "male", {
      birth_date: "1950-02-20",
      father_id: "1",
      mother_id: "2",
    }),
    m("6", "Omar Al-Rashid", "عمر الراشد", "male", {
      birth_date: "1975-07-08",
      father_id: "3",
      mother_id: "4",
      citizen_status: "non_resident",
    }),
    m("7", "Layla Hassan", "ليلى حسن", "female", { birth_date: "1978-10-30", spouse_id: "6" }),
    m("8", "Sara Al-Rashid", "سارة الراشد", "female", {
      birth_date: "1980-12-05",
      father_id: "3",
      mother_id: "4",
    }),
    m("9", "Yusuf Al-Rashid", "يوسف الراشد", "male", {
      birth_date: "2005-05-19",
      father_id: "6",
      mother_id: "7",
    }),
    m("10", "Mariam Al-Rashid", "مريم الراشد", "female", {
      birth_date: "2008-03-22",
      father_id: "6",
      mother_id: "7",
    }),
    m("11", "Hassan Al-Rashid", "حسن الراشد", "male", { birth_date: "1977-01-11", father_id: "5" }),
  ];
})();

let state: FamilyMember[] = [];
let subfamilies: SubFamily[] = [];
let accessScope: TreeAccessScope = "preview";
const listeners = new Set<() => void>();
let past: FamilyMember[][] = [];
let future: FamilyMember[][] = [];
let baselineMembers: FamilyMember[] = [];
let baselineSubfamilies: SubFamily[] = [];
let remoteVersion = 1;
let persistenceError: string | null = null;
let saveInFlight = false;
let saveGeneration = 0;
let pendingBatchId: string | null = null;

type PersistenceState = {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  conflicted: boolean;
};

type DraftCheckpoint = {
  members: FamilyMember[];
  subfamilies: SubFamily[];
};

let cachedPersistenceState: PersistenceState = {
  dirty: false,
  saving: false,
  error: null,
  conflicted: false,
};
type FamilyLoadState = "idle" | "loading" | "ready" | "error";
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
    state = cloneMembers(snapshot.members);
    subfamilies = cloneSubfamilies(snapshot.subfamilies);
    baselineMembers = cloneMembers(state);
    baselineSubfamilies = cloneSubfamilies(subfamilies);
    past = [];
    future = [];
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
  const members = cloneMembers(state);
  const currentSubfamilies = cloneSubfamilies(subfamilies);
  const batchId = pendingBatchId ?? crypto.randomUUID();
  pendingBatchId = batchId;
  saveInFlight = true;
  emit();
  try {
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
    persistenceError = error instanceof ApiClientError ? error.code : "NETWORK_ERROR";
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

function snapshot(): FamilyMember[] {
  return cloneMembers(state);
}

function commit(mutator: () => void) {
  if (!canEditActiveTree()) return;
  const before = snapshot();
  mutator();
  if (JSON.stringify(before) === JSON.stringify(state)) return;
  past = [...past, before];
  future = [];
  markDraftChanged();
  emit();
}

function applySnapshot(next: FamilyMember[]) {
  if (!canEditActiveTree()) return;
  state = cloneMembers(next);
  markDraftChanged();
  emit();
}

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
    persistenceError = null;
    pendingBatchId = null;
    loadState = "loading";
    void hydrateFromServer(activeTreeId, activeAccessMode);
    emit();
  },
  activateTree(treeId: string, accessMode: TreeAccessMode = "edit"): void {
    if (!treeId || (activeTreeId === treeId && activeAccessMode === accessMode)) return;
    activeTreeId = treeId;
    activeAccessMode = accessMode;
    accessScope = "preview";
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
    };
  },
  restoreDraftCheckpoint(checkpoint: DraftCheckpoint): void {
    if (saveInFlight || !canEditActiveTree()) return;
    state = cloneMembers(checkpoint.members);
    subfamilies = cloneSubfamilies(checkpoint.subfamilies);
    past = [];
    future = [];
    markDraftChanged();
    emit();
  },
  deleteTreeData(treeId: string): void {
    void treeClient.deleteTree(treeId);
  },
  getAll(): FamilyMember[] {
    return state;
  },
  canManageSubfamilies(): boolean {
    return treeAccessPolicy(accessScope, activeAccessMode).canManageSubfamilies;
  },
  getAccessScope(): TreeAccessScope {
    return accessScope;
  },
  canEditActiveTree(): boolean {
    return canEditActiveTree();
  },
  get(id: string): FamilyMember | undefined {
    return state.find((m) => m.id === id);
  },
  add(input: MemberInput): FamilyMember {
    const now = new Date().toISOString();
    let member: FamilyMember | undefined;
    commit(() => {
      const created: FamilyMember = {
        ...input,
        id: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
      };
      member = created;
      state = [...state, created];
      // mirror spouse link
      if (created.spouse_id) {
        const spouse = state.find((m) => m.id === created.spouse_id);
        state = state.map((m) => {
          if (!spouse) return m;
          if (created.gender === "female" && spouse.gender === "male" && m.id === spouse.id) {
            const set = new Set(m.spouse_ids ?? []);
            set.add(created.id);
            return {
              ...m,
              spouse_ids: [...set],
              spouse_id: m.spouse_id ?? created.id,
              updated_at: now,
            };
          }
          if (created.gender === "male" && spouse.gender === "female" && m.id === created.id) {
            const set = new Set(m.spouse_ids ?? []);
            set.add(spouse.id);
            return {
              ...m,
              spouse_ids: [...set],
              spouse_id: m.spouse_id ?? spouse.id,
              updated_at: now,
            };
          }
          if (created.gender === "male" && spouse.gender === "female" && m.id === spouse.id) {
            return { ...m, spouse_id: m.spouse_id ?? created.id, updated_at: now };
          }
          return m;
        });
      }
      state = ensureParentsAreSpouses(state, created.id, now);
    });
    return member!;
  },
  addMotherForChild(input: MemberInput, childId: string): FamilyMember {
    const now = new Date().toISOString();
    let mother: FamilyMember | undefined;
    commit(() => {
      const child = state.find((member) => member.id === childId);
      const created: FamilyMember = {
        ...input,
        gender: "female",
        id: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
      };
      mother = created;
      state = [...state, created];
      if (!child) return;
      state = state.map((member) =>
        member.id === childId ? { ...member, mother_id: created.id, updated_at: now } : member,
      );
      state = ensureParentsAreSpouses(state, childId, now);
    });
    return mother!;
  },
  setPosition(id: string, pos: { x: number; y: number } | null): void {
    commit(() => {
      state = state.map((m) => (m.id === id ? { ...m, pos_x: pos?.x, pos_y: pos?.y } : m));
    });
  },
  setPositions(positions: ReadonlyMap<string, { x: number; y: number }>): void {
    commit(() => {
      state = state.map((member) => {
        const position = positions.get(member.id);
        return !position ? member : { ...member, pos_x: position.x, pos_y: position.y };
      });
    });
  },
  setDecadePositions(positions: ReadonlyMap<string, { x: number; y: number }>): void {
    commit(() => {
      state = state.map((member) => {
        const position = positions.get(member.id);
        return !position
          ? member
          : { ...member, decade_pos_x: position.x, decade_pos_y: position.y };
      });
    });
  },
  clearPositions(): void {
    commit(() => {
      state = state.map((m) => ({ ...m, pos_x: undefined, pos_y: undefined }));
    });
  },
  clearDecadePositions(): void {
    commit(() => {
      state = state.map((m) => ({
        ...m,
        decade_pos_x: undefined,
        decade_pos_y: undefined,
      }));
    });
  },
  update(id: string, patch: Partial<MemberInput>): void {
    const now = new Date().toISOString();
    commit(() => {
      state = state.map((m) => (m.id === id ? { ...m, ...patch, updated_at: now } : m));
      if (patch.spouse_id) {
        const member = state.find((m) => m.id === id);
        const spouse = state.find((m) => m.id === patch.spouse_id);
        state = state.map((m) => {
          if (!member || !spouse) return m;
          if (member.gender === "female" && spouse.gender === "male" && m.id === spouse.id) {
            const set = new Set(m.spouse_ids ?? []);
            set.add(member.id);
            return {
              ...m,
              spouse_ids: [...set],
              spouse_id: m.spouse_id ?? member.id,
              updated_at: now,
            };
          }
          if (member.gender === "male" && spouse.gender === "female" && m.id === member.id) {
            const set = new Set(m.spouse_ids ?? []);
            set.add(spouse.id);
            return {
              ...m,
              spouse_ids: [...set],
              spouse_id: m.spouse_id ?? spouse.id,
              updated_at: now,
            };
          }
          if (member.gender === "male" && spouse.gender === "female" && m.id === spouse.id) {
            return { ...m, spouse_id: m.spouse_id ?? member.id, updated_at: now };
          }
          return m;
        });
      }
      state = ensureParentsAreSpouses(state, id, now);
    });
  },
  detachParent(id: string, role: "father_id" | "mother_id"): void {
    const now = new Date().toISOString();
    commit(() => {
      state = detachParentRelationship(state, id, role, now);
    });
  },
  toggleDivorce(aId: string, bId: string): void {
    const now = new Date().toISOString();
    commit(() => {
      state = toggleDivorceRelationship(state, aId, bId, now);
    });
  },
  addSpouse(maleId: string, femaleId: string): void {
    const now = new Date().toISOString();
    commit(() => {
      state = linkSpouses(state, maleId, femaleId, now);
    });
  },
  reorderSpouse(maleId: string, femaleId: string, direction: -1 | 1): void {
    const now = new Date().toISOString();
    const male = state.find((m) => m.id === maleId);
    if (!male || male.gender !== "male") return;

    // Include legacy and inferred links so the order shown on the card becomes
    // the canonical persisted order after the first move.
    const orderedIds: string[] = [];
    const add = (id: string | undefined) => {
      if (id && !orderedIds.includes(id)) orderedIds.push(id);
    };
    for (const id of male.spouse_ids ?? []) add(id);
    add(male.spouse_id);
    for (const member of state) {
      if (member.gender === "female" && member.spouse_id === maleId) add(member.id);
    }
    for (const child of state) {
      if (child.father_id === maleId) add(child.mother_id);
    }

    const from = orderedIds.indexOf(femaleId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= orderedIds.length) return;
    [orderedIds[from], orderedIds[to]] = [orderedIds[to], orderedIds[from]];
    commit(() => {
      state = state.map((m) =>
        m.id === maleId ? { ...m, spouse_ids: orderedIds, updated_at: now } : m,
      );
    });
  },
  removeSpouse(maleId: string, femaleId: string): void {
    const now = new Date().toISOString();
    commit(() => {
      state = removeSpouseAttachment(state, maleId, femaleId, now);
    });
  },
  addUnknownSpouse(maleId: string): FamilyMember | undefined {
    const now = new Date().toISOString();
    const male = state.find((m) => m.id === maleId);
    if (!male || male.gender !== "male") return;
    const existingUnknown = state.filter(
      (m) => m.is_unknown && (male.spouse_ids ?? []).includes(m.id),
    ).length;
    const idx = existingUnknown + 1;
    let wife: FamilyMember | undefined;
    commit(() => {
      const createdWife: FamilyMember = {
        id: crypto.randomUUID(),
        name_en: `Unknown wife #${idx}`,
        name_ar: `زوجة غير معروفة #${idx}`,
        gender: "female",
        is_unknown: true,
        created_at: now,
        updated_at: now,
      };
      wife = createdWife;
      state = [...state, createdWife];
      state = state.map((m) => {
        if (m.id === maleId) {
          const set = new Set(m.spouse_ids ?? []);
          set.add(createdWife.id);
          return {
            ...m,
            spouse_ids: [...set],
            spouse_id: m.spouse_id ?? createdWife.id,
            updated_at: now,
          };
        }
        return m;
      });
    });
    return wife;
  },
  remove(id: string): void {
    commit(() => {
      state = removeMember(state, id);
    });
  },

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

  addSubfamily(
    name_en: string,
    name_ar: string,
    color?: string,
    linked_male_id?: string,
    parent_subfamily_id?: string,
  ): SubFamily {
    const now = new Date().toISOString();
    const sf: SubFamily = {
      id: crypto.randomUUID(),
      name_en,
      name_ar,
      linked_male_id,
      parent_subfamily_id,
      attachments: [],
      color,
      created_at: now,
      updated_at: now,
    };
    subfamilies = [...subfamilies, sf];
    markDraftChanged();
    emit();
    return sf;
  },

  getSubfamilies(): SubFamily[] {
    return subfamilies;
  },

  updateSubfamily(
    id: string,
    patch: Partial<Omit<SubFamily, "id" | "created_at" | "updated_at">>,
  ): void {
    const now = new Date().toISOString();
    subfamilies = subfamilies.map((sf) =>
      sf.id === id ? { ...sf, ...patch, updated_at: now } : sf,
    );
    markDraftChanged();
    emit();
  },

  deleteSubfamily(id: string): void {
    subfamilies = subfamilies
      .filter((sf) => sf.id !== id)
      .map((sf) =>
        sf.parent_subfamily_id === id ? { ...sf, parent_subfamily_id: undefined } : sf,
      );
    state = state.map((m) => (m.subfamily_id === id ? { ...m, subfamily_id: undefined } : m));
    markDraftChanged();
    emit();
  },

  assignSubfamily(memberId: string, subfamilyId: string | undefined): void {
    commit(() => {
      state = state.map((m) => (m.id === memberId ? { ...m, subfamily_id: subfamilyId } : m));
    });
  },

  /** Return the nearest branch label for a member, with explicit assignment as fallback. */
  getClosestSubfamily(memberId: string): SubFamily | undefined {
    const member = state.find((m) => m.id === memberId);
    if (!member) return undefined;
    const explicit = member.subfamily_id
      ? subfamilies.find((sf) => sf.id === member.subfamily_id)
      : undefined;
    const distances = new Map<string, number>();
    const queue: Array<{ id: string; distance: number }> = [{ id: member.id, distance: 0 }];
    while (queue.length) {
      const current = queue.shift()!;
      if (distances.has(current.id)) continue;
      distances.set(current.id, current.distance);
      const currentMember = state.find((m) => m.id === current.id);
      if (currentMember?.father_id)
        queue.push({ id: currentMember.father_id, distance: current.distance + 1 });
      if (currentMember?.mother_id)
        queue.push({ id: currentMember.mother_id, distance: current.distance + 1 });
    }
    const inferred = subfamilies
      .filter((sf) => sf.linked_male_id && distances.has(sf.linked_male_id))
      .sort((a, b) => distances.get(a.linked_male_id!)! - distances.get(b.linked_male_id!)!)[0];
    return explicit ?? inferred;
  },

  getSubfamilyMembers(subfamilyId: string): FamilyMember[] {
    return querySubfamilyMembers(state, subfamilies, subfamilyId);
  },

  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useFamily(): FamilyMember[] {
  return useSyncExternalStore(
    familyStore.subscribe,
    () => familyStore.getAll(),
    () => state,
  );
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

export function getChildren(members: FamilyMember[], id: string): FamilyMember[] {
  return queryChildren(members, id);
}

export function getGeneration(
  members: FamilyMember[],
  id: string,
  cache = new Map<string, number>(),
): number {
  return queryGeneration(members, id, cache);
}
