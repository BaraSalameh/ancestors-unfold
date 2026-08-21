import type { FamilyMember, SubFamily } from "@/features/members/domain";
import {
  applyEntityChanges,
  entityChanges,
  mapsEqual,
  type EntityChange,
} from "./family-store-history";

export type DraftChange = {
  members: EntityChange<FamilyMember>[];
  subfamilies: EntityChange<SubFamily>[];
  beforeImages: Map<string, File>;
  afterImages: Map<string, File>;
};

type DraftHistoryContext = {
  canEdit(): boolean;
  getMembers(): FamilyMember[];
  setMembers(members: FamilyMember[]): void;
  getSubfamilies(): SubFamily[];
  setSubfamilies(subfamilies: SubFamily[]): void;
  getImages(): Map<string, File>;
  replaceImages(images: ReadonlyMap<string, File>): void;
  discardRemovedImages(current: FamilyMember[], next: FamilyMember[]): void;
  afterChange(change: DraftChange): void;
  markChanged(): void;
};

const MAX_HISTORY = 100;

export function createFamilyDraftHistory(context: DraftHistoryContext) {
  let past: DraftChange[] = [];
  let future: DraftChange[] = [];

  const apply = (change: DraftChange, direction: "before" | "after") => {
    if (!context.canEdit()) return;
    const currentMembers = context.getMembers();
    const nextMembers = applyEntityChanges(currentMembers, change.members, direction);
    context.discardRemovedImages(currentMembers, nextMembers);
    context.setMembers(nextMembers);
    context.setSubfamilies(
      applyEntityChanges(context.getSubfamilies(), change.subfamilies, direction),
    );
    context.replaceImages(direction === "before" ? change.beforeImages : change.afterImages);
    context.afterChange(change);
    context.markChanged();
  };

  return {
    clear() {
      past = [];
      future = [];
    },
    commit(mutator: () => void) {
      if (!context.canEdit()) return;
      const beforeMembers = context.getMembers();
      const beforeSubfamilies = context.getSubfamilies();
      const beforeImages = new Map(context.getImages());
      mutator();
      const change: DraftChange = {
        members: entityChanges(beforeMembers, context.getMembers()),
        subfamilies: entityChanges(beforeSubfamilies, context.getSubfamilies()),
        beforeImages,
        afterImages: new Map(context.getImages()),
      };
      const unchanged =
        !change.members.length &&
        !change.subfamilies.length &&
        mapsEqual(beforeImages, context.getImages());
      if (unchanged) return;
      context.afterChange(change);
      past = [...past, change].slice(-MAX_HISTORY);
      future = [];
      context.markChanged();
    },
    undo() {
      const previous = past.at(-1);
      if (!previous) return;
      future = [previous, ...future].slice(0, MAX_HISTORY);
      past = past.slice(0, -1);
      apply(previous, "before");
    },
    redo() {
      const next = future[0];
      if (!next) return;
      past = [...past, next].slice(-MAX_HISTORY);
      future = future.slice(1);
      apply(next, "after");
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
