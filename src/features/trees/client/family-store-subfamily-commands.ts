import type { FamilyMember, SubFamily } from "@/features/members/domain";
import { getSubfamilyMembers } from "@/features/members/domain";

export interface SubfamilyCommandContext {
  state: FamilyMember[];
  subfamilies: SubFamily[];
  commit(mutator: () => void): void;
  markDraftChanged(): void;
  emit(): void;
}

export function createSubfamilyCommands(ctx: SubfamilyCommandContext) {
  return {
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
      ctx.subfamilies = [...ctx.subfamilies, sf];
      ctx.markDraftChanged();
      ctx.emit();
      return sf;
    },

    getSubfamilies(): SubFamily[] {
      return ctx.subfamilies;
    },

    updateSubfamily(
      id: string,
      patch: Partial<Omit<SubFamily, "id" | "created_at" | "updated_at">>,
    ): void {
      const now = new Date().toISOString();
      ctx.subfamilies = ctx.subfamilies.map((sf) =>
        sf.id === id ? { ...sf, ...patch, updated_at: now } : sf,
      );
      ctx.markDraftChanged();
      ctx.emit();
    },

    deleteSubfamily(id: string): void {
      ctx.subfamilies = ctx.subfamilies
        .filter((sf) => sf.id !== id)
        .map((sf) =>
          sf.parent_subfamily_id === id ? { ...sf, parent_subfamily_id: undefined } : sf,
        );
      ctx.state = ctx.state.map((m) =>
        m.subfamily_id === id ? { ...m, subfamily_id: undefined } : m,
      );
      ctx.markDraftChanged();
      ctx.emit();
    },

    assignSubfamily(memberId: string, subfamilyId: string | undefined): void {
      ctx.commit(() => {
        ctx.state = ctx.state.map((m) =>
          m.id === memberId ? { ...m, subfamily_id: subfamilyId } : m,
        );
      });
    },

    /** Return the nearest branch label for a member, with explicit assignment as fallback. */
    getClosestSubfamily(memberId: string): SubFamily | undefined {
      const member = ctx.state.find((m) => m.id === memberId);
      if (!member) return undefined;
      const explicit = member.subfamily_id
        ? ctx.subfamilies.find((sf) => sf.id === member.subfamily_id)
        : undefined;
      const distances = new Map<string, number>();
      const queue: Array<{ id: string; distance: number }> = [{ id: member.id, distance: 0 }];
      while (queue.length) {
        const current = queue.shift()!;
        if (distances.has(current.id)) continue;
        distances.set(current.id, current.distance);
        const currentMember = ctx.state.find((m) => m.id === current.id);
        if (currentMember?.father_id)
          queue.push({ id: currentMember.father_id, distance: current.distance + 1 });
        if (currentMember?.mother_id)
          queue.push({ id: currentMember.mother_id, distance: current.distance + 1 });
      }
      const inferred = ctx.subfamilies
        .filter((sf) => sf.linked_male_id && distances.has(sf.linked_male_id))
        .sort((a, b) => distances.get(a.linked_male_id!)! - distances.get(b.linked_male_id!)!)[0];
      return explicit ?? inferred;
    },

    getSubfamilyMembers(subfamilyId: string): FamilyMember[] {
      return getSubfamilyMembers(ctx.state, ctx.subfamilies, subfamilyId);
    },
  };
}
