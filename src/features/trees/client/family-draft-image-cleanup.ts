import { memberImageClient } from "@/features/members/client";
import type { FamilyMember } from "@/features/members/domain";

function discard(treeId: string, assetId: string) {
  void memberImageClient.discard(treeId, assetId).catch(() => undefined);
}

export function discardUploadedDraftImages(
  treeId: string,
  members: FamilyMember[],
  baselineMember: (id: string) => FamilyMember | undefined,
) {
  for (const member of members) {
    const baseline = baselineMember(member.id);
    if (member.image_asset_id && member.image_asset_id !== baseline?.image_asset_id)
      discard(treeId, member.image_asset_id);
  }
}

export function discardRemovedDraftImages(
  treeId: string,
  current: FamilyMember[],
  next: FamilyMember[],
  baselineAssetIds: ReadonlySet<string | undefined>,
) {
  const retainedAssetIds = new Set(next.map(({ image_asset_id }) => image_asset_id));
  for (const member of current)
    if (
      member.image_asset_id &&
      !retainedAssetIds.has(member.image_asset_id) &&
      !baselineAssetIds.has(member.image_asset_id)
    )
      discard(treeId, member.image_asset_id);
}
