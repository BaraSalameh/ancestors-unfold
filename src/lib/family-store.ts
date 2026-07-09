import { useSyncExternalStore } from "react";
import type { FamilyMember, MemberInput } from "./family-types";

const STORAGE_KEY = "family-tree-hub:v1";

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
    m("6", "Omar Al-Rashid", "عمر الراشد", "male", { birth_date: "1975-07-08", father_id: "3", mother_id: "4" }),
    m("7", "Layla Hassan", "ليلى حسن", "female", { birth_date: "1978-10-30", spouse_id: "6" }),
    m("8", "Sara Al-Rashid", "سارة الراشد", "female", { birth_date: "1980-12-05", father_id: "3", mother_id: "4" }),
    m("9", "Yusuf Al-Rashid", "يوسف الراشد", "male", { birth_date: "2005-05-19", father_id: "6", mother_id: "7" }),
    m("10", "Mariam Al-Rashid", "مريم الراشد", "female", { birth_date: "2008-03-22", father_id: "6", mother_id: "7" }),
    m("11", "Hassan Al-Rashid", "حسن الراشد", "male", { birth_date: "1977-01-11", father_id: "5" }),
  ];
})();

let state: FamilyMember[] = [];
const listeners = new Set<() => void>();

function load() {
  if (typeof window === "undefined") {
    state = SAMPLE;
    return;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    state = raw ? (JSON.parse(raw) as FamilyMember[]) : SAMPLE;
    if (!raw) save();
  } catch {
    state = SAMPLE;
  }
}

function save() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function emit() {
  for (const l of listeners) l();
}

if (typeof window !== "undefined") load();

export const familyStore = {
  getAll(): FamilyMember[] {
    return state;
  },
  get(id: string): FamilyMember | undefined {
    return state.find((m) => m.id === id);
  },
  add(input: MemberInput): FamilyMember {
    const now = new Date().toISOString();
    const member: FamilyMember = {
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
    save();
    emit();
    return member;
  },
  setPosition(id: string, pos: { x: number; y: number } | null): void {
    state = state.map((m) =>
      m.id === id
        ? { ...m, pos_x: pos?.x, pos_y: pos?.y }
        : m,
    );
    save();
    emit();
  },
  clearPositions(): void {
    state = state.map((m) => ({ ...m, pos_x: undefined, pos_y: undefined }));
    save();
    emit();
  },
  update(id: string, patch: Partial<MemberInput>): void {
    const now = new Date().toISOString();
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
    save();
    emit();
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
    save();
    emit();
  },
  addSpouse(maleId: string, femaleId: string): void {
    const now = new Date().toISOString();
    const male = state.find((m) => m.id === maleId);
    const female = state.find((m) => m.id === femaleId);
    if (!male || male.gender !== "male" || !female || female.gender !== "female") return;
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
    save();
    emit();
  },
  removeSpouse(maleId: string, femaleId: string): void {
    const now = new Date().toISOString();
    const female = state.find((m) => m.id === femaleId);
    const removeUnknown = !!female?.is_unknown;
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
    save();
    emit();
  },
  addUnknownSpouse(maleId: string): FamilyMember | undefined {
    const now = new Date().toISOString();
    const male = state.find((m) => m.id === maleId);
    if (!male || male.gender !== "male") return;
    const existingUnknown = state.filter(
      (m) => m.is_unknown && (male.spouse_ids ?? []).includes(m.id),
    ).length;
    const idx = existingUnknown + 1;
    const wife: FamilyMember = {
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
    save();
    emit();
    return wife;
  },
  remove(id: string): void {
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
    save();
    emit();
  },

  reset() {
    state = SAMPLE;
    save();
    emit();
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
    () => SAMPLE,
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
