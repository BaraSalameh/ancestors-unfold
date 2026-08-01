import type { FamilyMember, MemberInput } from "@/features/members/domain";
import {
  detachParentRelationship,
  ensureParentsAreSpouses,
  linkSpouses,
  removeMember,
  removeSpouseAttachment,
  toggleDivorce as toggleDivorceRelationship,
} from "@/features/members/domain";
import { mirrorSpouseLink } from "./member-link-mutations";

export interface MemberCommandContext {
  state: FamilyMember[];
  stagedImages: Map<string, File>;
  commit(mutator: () => void): void;
  replaceStagedImages(next: ReadonlyMap<string, File>): void;
  emit(): void;
}

export function createMemberCommands(ctx: MemberCommandContext) {
  return { ...createMemberCrudCommands(ctx), ...createRelationshipCommands(ctx) };
}

function createMemberCrudCommands(ctx: MemberCommandContext) {
  return {
    add(input: MemberInput, imageFile?: File): FamilyMember {
      const now = new Date().toISOString();
      let member: FamilyMember | undefined;
      ctx.commit(() => {
        const created: FamilyMember = {
          ...input,
          id: crypto.randomUUID(),
          created_at: now,
          updated_at: now,
        };
        member = created;
        ctx.state = [...ctx.state, created];
        if (created.spouse_id)
          ctx.state = mirrorSpouseLink(ctx.state, created.id, created.spouse_id, now);
        ctx.state = ensureParentsAreSpouses(ctx.state, created.id, now);
        if (imageFile) ctx.stagedImages.set(created.id, imageFile);
      });
      if (imageFile) {
        ctx.replaceStagedImages(ctx.stagedImages);
        ctx.emit();
      }
      return member!;
    },
    addMotherForChild(input: MemberInput, childId: string, imageFile?: File): FamilyMember {
      const now = new Date().toISOString();
      let mother: FamilyMember | undefined;
      ctx.commit(() => {
        const child = ctx.state.find((member) => member.id === childId);
        const created: FamilyMember = {
          ...input,
          gender: "female",
          id: crypto.randomUUID(),
          created_at: now,
          updated_at: now,
        };
        mother = created;
        ctx.state = [...ctx.state, created];
        if (!child) return;
        ctx.state = ctx.state.map((member) =>
          member.id === childId ? { ...member, mother_id: created.id, updated_at: now } : member,
        );
        ctx.state = ensureParentsAreSpouses(ctx.state, childId, now);
        if (imageFile) ctx.stagedImages.set(created.id, imageFile);
      });
      if (imageFile) {
        ctx.replaceStagedImages(ctx.stagedImages);
        ctx.emit();
      }
      return mother!;
    },
    setPosition(id: string, pos: { x: number; y: number } | null): void {
      ctx.commit(() => {
        ctx.state = ctx.state.map((m) =>
          m.id === id ? { ...m, pos_x: pos?.x, pos_y: pos?.y } : m,
        );
      });
    },
    setPositions(positions: ReadonlyMap<string, { x: number; y: number }>): void {
      ctx.commit(() => {
        ctx.state = ctx.state.map((member) => {
          const position = positions.get(member.id);
          return !position ? member : { ...member, pos_x: position.x, pos_y: position.y };
        });
      });
    },
    setDecadePositions(positions: ReadonlyMap<string, { x: number; y: number }>): void {
      ctx.commit(() => {
        ctx.state = ctx.state.map((member) => {
          const position = positions.get(member.id);
          return !position
            ? member
            : { ...member, decade_pos_x: position.x, decade_pos_y: position.y };
        });
      });
    },
    clearPositions(): void {
      ctx.commit(() => {
        ctx.state = ctx.state.map((m) => ({ ...m, pos_x: undefined, pos_y: undefined }));
      });
    },
    clearDecadePositions(): void {
      ctx.commit(() => {
        ctx.state = ctx.state.map((m) => ({
          ...m,
          decade_pos_x: undefined,
          decade_pos_y: undefined,
        }));
      });
    },
    update(id: string, patch: Partial<MemberInput>, imageFile?: File | null): void {
      const now = new Date().toISOString();
      ctx.commit(() => {
        ctx.state = ctx.state.map((m) => (m.id === id ? { ...m, ...patch, updated_at: now } : m));
        if (patch.spouse_id) ctx.state = mirrorSpouseLink(ctx.state, id, patch.spouse_id, now);
        ctx.state = ensureParentsAreSpouses(ctx.state, id, now);
        if (imageFile instanceof File) ctx.stagedImages.set(id, imageFile);
        else if (imageFile === null) ctx.stagedImages.delete(id);
      });
      if (imageFile !== undefined) {
        ctx.replaceStagedImages(ctx.stagedImages);
        ctx.emit();
      }
    },
  };
}

function createRelationshipCommands(ctx: MemberCommandContext) {
  return {
    detachParent(id: string, role: "father_id" | "mother_id"): void {
      const now = new Date().toISOString();
      ctx.commit(() => {
        ctx.state = detachParentRelationship(ctx.state, id, role, now);
      });
    },
    toggleDivorce(aId: string, bId: string): void {
      const now = new Date().toISOString();
      ctx.commit(() => {
        ctx.state = toggleDivorceRelationship(ctx.state, aId, bId, now);
      });
    },
    addSpouse(maleId: string, femaleId: string): void {
      const now = new Date().toISOString();
      ctx.commit(() => {
        ctx.state = linkSpouses(ctx.state, maleId, femaleId, now);
      });
    },
    reorderSpouse(maleId: string, femaleId: string, direction: -1 | 1): void {
      const now = new Date().toISOString();
      const male = ctx.state.find((m) => m.id === maleId);
      if (!male || male.gender !== "male") return;

      // Include legacy and inferred links so the order shown on the card becomes
      // the canonical persisted order after the first move.
      const orderedIds: string[] = [];
      const add = (id: string | undefined) => {
        if (id && !orderedIds.includes(id)) orderedIds.push(id);
      };
      for (const id of male.spouse_ids ?? []) add(id);
      add(male.spouse_id);
      for (const member of ctx.state) {
        if (member.gender === "female" && member.spouse_id === maleId) add(member.id);
      }
      for (const child of ctx.state) {
        if (child.father_id === maleId) add(child.mother_id);
      }

      const from = orderedIds.indexOf(femaleId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= orderedIds.length) return;
      [orderedIds[from], orderedIds[to]] = [orderedIds[to], orderedIds[from]];
      ctx.commit(() => {
        ctx.state = ctx.state.map((m) =>
          m.id === maleId ? { ...m, spouse_ids: orderedIds, updated_at: now } : m,
        );
      });
    },
    removeSpouse(maleId: string, femaleId: string): void {
      const now = new Date().toISOString();
      ctx.commit(() => {
        ctx.state = removeSpouseAttachment(ctx.state, maleId, femaleId, now);
      });
    },
    addUnknownSpouse(maleId: string): FamilyMember | undefined {
      const now = new Date().toISOString();
      const male = ctx.state.find((m) => m.id === maleId);
      if (!male || male.gender !== "male") return;
      const existingUnknown = ctx.state.filter(
        (m) => m.is_unknown && (male.spouse_ids ?? []).includes(m.id),
      ).length;
      const idx = existingUnknown + 1;
      let wife: FamilyMember | undefined;
      ctx.commit(() => {
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
        ctx.state = [...ctx.state, createdWife];
        ctx.state = ctx.state.map((m) => {
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
      ctx.commit(() => {
        ctx.state = removeMember(ctx.state, id);
        ctx.stagedImages.delete(id);
      });
      ctx.replaceStagedImages(ctx.stagedImages);
      ctx.emit();
    },
  };
}
