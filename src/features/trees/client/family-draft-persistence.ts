import { memberImageClient } from "@/features/members/client";
import type { FamilyMember, SubFamily } from "@/features/members/domain";
import { treeClient } from "../api/tree-client";

export type PendingCsvImport = {
  expectedVersion: number;
  sourceMemberIds: Map<string, string>;
  sourceBranchIds: Map<string, string>;
  protectedMemberIds: Map<string, FamilyMember["gender"]>;
  protectedBranchIds: Set<string>;
};

type PersistFamilyDraftInput = {
  treeId: string;
  batchId: string;
  remoteVersion: number;
  activeImport: PendingCsvImport | null;
  stagedImages: ReadonlyMap<string, File>;
  dirtyMemberIds: ReadonlySet<string>;
  dirtySubfamilyIds: ReadonlySet<string>;
  getMembers(): FamilyMember[];
  getSubfamilies(): SubFamily[];
  onImageUploaded(memberId: string, uploaded: Partial<FamilyMember>): void;
  onPhase(phase: "preparing" | "uploading_images" | "saving"): void;
};

const cloneMembers = (members: FamilyMember[]) =>
  members.map((member) => ({
    ...member,
    spouse_ids: member.spouse_ids ? [...member.spouse_ids] : undefined,
    divorced_from: member.divorced_from ? [...member.divorced_from] : undefined,
  }));

const cloneSubfamilies = (subfamilies: SubFamily[]) =>
  subfamilies.map((branch) => ({
    ...branch,
    attachments: branch.attachments?.map((attachment) => ({ ...attachment })) ?? [],
  }));

async function uploadStagedImages(input: PersistFamilyDraftInput) {
  input.onPhase(input.stagedImages.size ? "uploading_images" : "preparing");
  for (const [memberId, file] of [...input.stagedImages]) {
    const uploaded = await memberImageClient.upload(input.treeId, memberId, file, () => undefined);
    input.onImageUploaded(memberId, uploaded);
  }
}

async function saveDraftEntities(
  input: PersistFamilyDraftInput,
  members: FamilyMember[],
  subfamilies: SubFamily[],
) {
  if (input.activeImport)
    return treeClient.applyFamilyCsv(input.treeId, {
      batchId: input.batchId,
      expectedVersion: input.activeImport.expectedVersion,
      members,
      subfamilies,
      sourceMemberIds: members.map(({ id: targetId }) => ({
        targetId,
        sourceId: input.activeImport!.sourceMemberIds.get(targetId) ?? `draft|member|${targetId}`,
      })),
      sourceBranchIds: subfamilies.map(({ id: targetId }) => ({
        targetId,
        sourceId: input.activeImport!.sourceBranchIds.get(targetId) ?? `draft|branch|${targetId}`,
      })),
    });
  if (typeof treeClient.patchSnapshot === "function") {
    const memberById = new Map(members.map((member) => [member.id, member]));
    const branchById = new Map(subfamilies.map((branch) => [branch.id, branch]));
    return treeClient.patchSnapshot(input.treeId, {
      batchId: input.batchId,
      expectedVersion: input.remoteVersion,
      upsertMembers: [...input.dirtyMemberIds]
        .map((id) => memberById.get(id))
        .filter((member): member is FamilyMember => member !== undefined),
      deleteMemberIds: [...input.dirtyMemberIds].filter((id) => !memberById.has(id)),
      upsertSubfamilies: [...input.dirtySubfamilyIds]
        .map((id) => branchById.get(id))
        .filter((branch): branch is SubFamily => branch !== undefined),
      deleteSubfamilyIds: [...input.dirtySubfamilyIds].filter((id) => !branchById.has(id)),
    });
  }
  return treeClient.saveSnapshot(input.treeId, {
    batchId: input.batchId,
    expectedVersion: input.remoteVersion,
    members,
    subfamilies,
  });
}

export async function persistFamilyDraft(input: PersistFamilyDraftInput) {
  await uploadStagedImages(input);
  const members = cloneMembers(input.getMembers());
  const subfamilies = cloneSubfamilies(input.getSubfamilies());
  input.onPhase("saving");
  const result = await saveDraftEntities(input, members, subfamilies);
  return { version: result.version, members, subfamilies, imported: Boolean(input.activeImport) };
}
