import type { PoolClient } from "pg";
import { ApiError, type SnapshotInput } from "@/server/security";

type SnapshotMember = NonNullable<SnapshotInput["members"]>[number];

export async function validateSnapshotImages(
  client: PoolClient,
  treeId: string,
  members: SnapshotMember[],
): Promise<void> {
  const uploadedImages = members.filter(
    (member) => member.image_asset_id || member.image_public_id,
  );
  if (
    uploadedImages.some(
      (member) => !member.image_asset_id || !member.image_public_id || !member.image_url,
    )
  )
    throw new ApiError("INVALID_MEMBER_IMAGE", 400);
  if (!uploadedImages.length) return;
  const owned = await client.query<{
    asset_id: string;
    public_id: string;
    secure_url: string;
  }>(
    `SELECT asset_id,public_id,secure_url FROM app.cloudinary_assets
     WHERE tree_id=$1 AND asset_id=ANY($2::text[])`,
    [treeId, uploadedImages.map((member) => member.image_asset_id)],
  );
  const valid = new Map(owned.rows.map((asset) => [asset.asset_id, asset]));
  const invalid = uploadedImages.some((member) => {
    const asset = valid.get(member.image_asset_id!);
    return (
      !asset || asset.public_id !== member.image_public_id || asset.secure_url !== member.image_url
    );
  });
  if (invalid) throw new ApiError("INVALID_MEMBER_IMAGE", 400);
}
