import { useSyncExternalStore } from "react";
import type { FamilyMember, MemberInput, SubFamily } from "./family-types";

const LEGACY_STORAGE_KEY = "family-tree-hub:v1";
const LEGACY_SUBFAMILIES_KEY = "family-tree-hub:subfamilies:v1";
const treeStorageKey = (treeId: string) => `family-tree-hub:tree:${treeId}:members:v1`;
const subfamiliesStorageKey = (treeId: string) => `family-tree-hub:tree:${treeId}:subfamilies:v1`;
let activeTreeId = "al-rashid";

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
    m("1", "Abdullah Al-Rashid", "عبدالله الراشد", "male", { birth_date: "1920-03-12", death_date: "1998-11-04" }),
    m("2", "Fatimah Al-Saeed", "فاطمة السعيد", "female", { birth_date: "1925-06-22", death_date: "2002-01-18", spouse_id: "1" }),
    m("3", "Mohammed Al-Rashid", "محمد الراشد", "male", { birth_date: "1948-09-01", father_id: "1", mother_id: "2" }),
    m("4", "Aisha Al-Mansour", "عائشة المنصور", "female", { birth_date: "1952-04-14", spouse_id: "3" }),
    m("5", "Khalid Al-Rashid", "خالد الراشد", "male", { birth_date: "1950-02-20", father_id: "1", mother_id: "2" }),
    m("6", "Omar Al-Rashid", "عمر الراشد", "male", { birth_date: "1975-07-08", father_id: "3", mother_id: "4", citizen_status: "non_resident" }),
    m("7", "Layla Hassan", "ليلى حسن", "female", { birth_date: "1978-10-30", spouse_id: "6" }),
    m("8", "Sara Al-Rashid", "سارة الراشد", "female", { birth_date: "1980-12-05", father_id: "3", mother_id: "4" }),
    m("9", "Yusuf Al-Rashid", "يوسف الراشد", "male", { birth_date: "2005-05-19", father_id: "6", mother_id: "7" }),
    m("10", "Mariam Al-Rashid", "مريم الراشد", "female", { birth_date: "2008-03-22", father_id: "6", mother_id: "7" }),
    m("11", "Hassan Al-Rashid", "حسن الراشد", "male", { birth_date: "1977-01-11", father_id: "5" }),
  ];
})();

let state: FamilyMember[] = [];
let subfamilies: SubFamily[] = [];
const listeners = new Set<() => void>();
let past: FamilyMember[][] = [];
let future: FamilyMember[][] = [];

function load() {
  if (typeof window === "undefined") {
    state = activeTreeId === "al-rashid" ? SAMPLE : [];
    return;
  }
  try {
    const key = treeStorageKey(activeTreeId);
    const scoped = window.localStorage.getItem(key);
    const legacy = activeTreeId === "al-rashid" ? window.localStorage.getItem(LEGACY_STORAGE_KEY) : null;
    const raw = scoped ?? legacy;
    state = raw ? (JSON.parse(raw) as FamilyMember[]) : activeTreeId === "al-rashid" ? SAMPLE : [];
    if (!scoped) save();
  } catch {
    state = activeTreeId === "al-rashid" ? SAMPLE : [];
  }
}

function save() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(treeStorageKey(activeTreeId), JSON.stringify(state));
}

function emit() {
  for (const l of listeners) l();
}

function cloneMembers(members: FamilyMember[]): FamilyMember[] {
  return members.map((m) => ({
    ...m,
    spouse_ids: m.spouse_ids ? [...m.spouse_ids] : undefined,
    divorced_from: m.divorced_from ? [...m.divorced_from] : undefined,
  }));
}

function loadSubfamilies() {
  if (typeof window === "undefined") {
    subfamilies = [];
    return;
  }
  try {
    const scoped = window.localStorage.getItem(subfamiliesStorageKey(activeTreeId));
    const legacy = activeTreeId === "al-rashid" ? window.localStorage.getItem(LEGACY_SUBFAMILIES_KEY) : null;
    const raw = scoped ?? legacy;
    subfamilies = raw ? (JSON.parse(raw) as SubFamily[]) : [];
    if (!scoped) saveSubfamilies();
  } catch {
    subfamilies = [];
  }
}

function saveSubfamilies() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(subfamiliesStorageKey(activeTreeId), JSON.stringify(subfamilies));
}

function snapshot(): FamilyMember[] {
  return cloneMembers(state);
}

function commit(mutator: () => void) {
  const before = snapshot();
  mutator();
  if (JSON.stringify(before) === JSON.stringify(state)) return;
  past = [...past, before];
  future = [];
  save();
  emit();
}

function applySnapshot(next: FamilyMember[]) {
  state = cloneMembers(next);
  save();
  emit();
}

if (typeof window !== "undefined") {
  load();
  loadSubfamilies();
}

export const familyStore = {
  getActiveTreeId(): string {
    return activeTreeId;
  },
  activateTree(treeId: string): void {
    if (!treeId || activeTreeId === treeId) return;
    activeTreeId = treeId;
    past = [];
    future = [];
    load();
    loadSubfamilies();
    emit();
  },
  initializeTree(treeId: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(treeStorageKey(treeId), "[]");
    window.localStorage.setItem(subfamiliesStorageKey(treeId), "[]");
  },
  deleteTreeData(treeId: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(treeStorageKey(treeId));
    window.localStorage.removeItem(subfamiliesStorageKey(treeId));
  },
  getAll(): FamilyMember[] {
    return state;
  },
  get(id: string): FamilyMember | undefined {
    return state.find((m) => m.id === id);
  },
  add(input: MemberInput): FamilyMember {
    const now = new Date().toISOString();
    let member: FamilyMember | undefined;
    commit(() => {
      member = {
        ...input,
        id: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
      };
      state = [...state, member];
      // mirror spouse link
      if (member.spouse_id) {
        const spouse = state.find((m) => m.id === member.spouse_id);
        state = state.map((m) => {
          if (!spouse) return m;
          if (member.gender === "female" && spouse.gender === "male" && m.id === spouse.id) {
            const set = new Set(m.spouse_ids ?? []);
            set.add(member.id);
            return { ...m, spouse_ids: [...set], spouse_id: m.spouse_id ?? member.id, updated_at: now };
          }
          if (member.gender === "male" && spouse.gender === "female" && m.id === member.id) {
            const set = new Set(m.spouse_ids ?? []);
            set.add(spouse.id);
            return { ...m, spouse_ids: [...set], spouse_id: m.spouse_id ?? spouse.id, updated_at: now };
          }
          if (member.gender === "male" && spouse.gender === "female" && m.id === spouse.id) {
            return { ...m, spouse_id: m.spouse_id ?? member.id, updated_at: now };
          }
          return m;
        });
      }
    });
    return member!;
  },
  setPosition(id: string, pos: { x: number; y: number } | null): void {
    commit(() => {
      state = state.map((m) =>
        m.id === id
          ? { ...m, pos_x: pos?.x, pos_y: pos?.y }
          : m,
      );
    });
  },
  clearPositions(): void {
    commit(() => {
      state = state.map((m) => ({ ...m, pos_x: undefined, pos_y: undefined }));
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
            return { ...m, spouse_ids: [...set], spouse_id: m.spouse_id ?? member.id, updated_at: now };
          }
          if (member.gender === "male" && spouse.gender === "female" && m.id === member.id) {
            const set = new Set(m.spouse_ids ?? []);
            set.add(spouse.id);
            return { ...m, spouse_ids: [...set], spouse_id: m.spouse_id ?? spouse.id, updated_at: now };
          }
          if (member.gender === "male" && spouse.gender === "female" && m.id === spouse.id) {
            return { ...m, spouse_id: m.spouse_id ?? member.id, updated_at: now };
          }
          return m;
        });
      }
    });
  },
  toggleDivorce(aId: string, bId: string): void {
    const now = new Date().toISOString();
    const has = (m: FamilyMember, id: string) => (m.divorced_from ?? []).includes(id);
    const add = (arr: string[] | undefined, id: string) =>
      arr && arr.includes(id) ? arr : [...(arr ?? []), id];
    const remove = (arr: string[] | undefined, id: string) => (arr ?? []).filter((x) => x !== id);
    const a = state.find((m) => m.id === aId);
    if (!a) return;
    const currently = has(a, bId);
    commit(() => {
      state = state.map((m) => {
        if (m.id === aId)
          return {
            ...m,
            divorced_from: currently ? remove(m.divorced_from, bId) : add(m.divorced_from, bId),
            updated_at: now,
          };
        if (m.id === bId)
          return {
            ...m,
            divorced_from: currently ? remove(m.divorced_from, aId) : add(m.divorced_from, aId),
            updated_at: now,
          };
        return m;
      });
    });
  },
  addSpouse(maleId: string, femaleId: string): void {
    const now = new Date().toISOString();
    const male = state.find((m) => m.id === maleId);
    const female = state.find((m) => m.id === femaleId);
    if (!male || male.gender !== "male" || !female || female.gender !== "female") return;
    commit(() => {
      state = state.map((m) => {
        if (m.id === maleId) {
          const set = new Set(m.spouse_ids ?? []);
          set.add(femaleId);
          return { ...m, spouse_ids: [...set], spouse_id: m.spouse_id ?? femaleId, updated_at: now };
        }
        if (m.id === femaleId) {
          return { ...m, spouse_id: m.spouse_id ?? maleId, updated_at: now };
        }
        return m;
      });
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
    const female = state.find((m) => m.id === femaleId);
    const removeUnknown = !!female?.is_unknown;
    commit(() => {
      state = state
        .filter((m) => !(removeUnknown && m.id === femaleId))
        .map((m) => {
          if (m.id === maleId) {
            return {
              ...m,
              spouse_ids: (m.spouse_ids ?? []).filter((x) => x !== femaleId),
              spouse_id: m.spouse_id === femaleId ? undefined : m.spouse_id,
              divorced_from: (m.divorced_from ?? []).filter((x) => x !== femaleId),
              updated_at: now,
            };
          }
          if (m.id === femaleId && !removeUnknown) {
            return {
              ...m,
              spouse_id: m.spouse_id === maleId ? undefined : m.spouse_id,
              divorced_from: (m.divorced_from ?? []).filter((x) => x !== maleId),
              updated_at: now,
            };
          }
          return m;
        });
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
      wife = {
        id: crypto.randomUUID(),
        name_en: `Unknown wife #${idx}`,
        name_ar: `زوجة غير معروفة #${idx}`,
        gender: "female",
        is_unknown: true,
        created_at: now,
        updated_at: now,
      };
      state = [...state, wife];
      state = state.map((m) => {
        if (m.id === maleId) {
          const set = new Set(m.spouse_ids ?? []);
          set.add(wife.id);
          return { ...m, spouse_ids: [...set], spouse_id: m.spouse_id ?? wife.id, updated_at: now };
        }
        return m;
      });
    });
    return wife;
  },
  remove(id: string): void {
    commit(() => {
      state = state
        .filter((m) => m.id !== id)
        .map((m) => ({
          ...m,
          father_id: m.father_id === id ? undefined : m.father_id,
          mother_id: m.mother_id === id ? undefined : m.mother_id,
          spouse_id: m.spouse_id === id ? undefined : m.spouse_id,
          spouse_ids: m.spouse_ids?.filter((x) => x !== id),
          divorced_from: m.divorced_from?.filter((x) => x !== id),
        }));
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

  addSubfamily(name_en: string, name_ar: string, color?: string, linked_male_id?: string, parent_subfamily_id?: string): SubFamily {
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
    saveSubfamilies();
    emit();
    return sf;
  },

  getSubfamilies(): SubFamily[] {
    return subfamilies;
  },

  updateSubfamily(id: string, patch: Partial<Omit<SubFamily, "id" | "created_at" | "updated_at">>): void {
    const now = new Date().toISOString();
    subfamilies = subfamilies.map((sf) =>
      sf.id === id ? { ...sf, ...patch, updated_at: now } : sf
    );
    saveSubfamilies();
    emit();
  },

  deleteSubfamily(id: string): void {
    subfamilies = subfamilies
      .filter((sf) => sf.id !== id)
      .map((sf) => sf.parent_subfamily_id === id ? { ...sf, parent_subfamily_id: undefined } : sf);
    state = state.map((m) =>
      m.subfamily_id === id ? { ...m, subfamily_id: undefined } : m
    );
    save();
    saveSubfamilies();
    emit();
  },

  assignSubfamily(memberId: string, subfamilyId: string | undefined): void {
    commit(() => {
      state = state.map((m) =>
        m.id === memberId ? { ...m, subfamily_id: subfamilyId } : m
      );
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
      if (currentMember?.father_id) queue.push({ id: currentMember.father_id, distance: current.distance + 1 });
      if (currentMember?.mother_id) queue.push({ id: currentMember.mother_id, distance: current.distance + 1 });
    }
    const inferred = subfamilies
      .filter((sf) => sf.linked_male_id && distances.has(sf.linked_male_id))
      .sort((a, b) => distances.get(a.linked_male_id!)! - distances.get(b.linked_male_id!)!)[0];
    return explicit ?? inferred;
  },

  getSubfamilyMembers(subfamilyId: string): FamilyMember[] {
    const subfamily = subfamilies.find((sf) => sf.id === subfamilyId);
    if (!subfamily?.linked_male_id) {
      return state.filter((m) => m.subfamily_id === subfamilyId);
    }

    const linkedMale = state.find((m) => m.id === subfamily.linked_male_id);
    if (!linkedMale) {
      return state.filter((m) => m.subfamily_id === subfamilyId);
    }

    const branchIds = new Set<string>();
    const queue = [linkedMale.id];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (branchIds.has(currentId)) continue;
      branchIds.add(currentId);

      state
        .filter((m) => m.father_id === currentId || m.mother_id === currentId)
        .forEach((child) => {
          if (!branchIds.has(child.id)) queue.push(child.id);
        });
    }

    return state.filter((m) => m.subfamily_id === subfamilyId || branchIds.has(m.id));
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

export function getChildren(members: FamilyMember[], id: string): FamilyMember[] {
  return members.filter((m) => m.father_id === id || m.mother_id === id);
}

export function getGeneration(members: FamilyMember[], id: string, cache = new Map<string, number>()): number {
  if (cache.has(id)) return cache.get(id)!;
  const m = members.find((x) => x.id === id);
  if (!m) return 0;
  const fGen = m.father_id ? getGeneration(members, m.father_id, cache) + 1 : 0;
  const mGen = m.mother_id ? getGeneration(members, m.mother_id, cache) + 1 : 0;
  const gen = Math.max(fGen, mGen);
  cache.set(id, gen);
  return gen;
}
