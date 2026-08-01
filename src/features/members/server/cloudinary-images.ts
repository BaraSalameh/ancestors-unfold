import { timingSafeEqual } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { query, transaction } from "@/shared/server/database";
import { ApiError } from "@/server/security";

type SessionContext = { id: string; user_id: string };

function config() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const uploadPreset = process.env.CLOUDINARY_MEMBER_PROFILE_PRESET;
  if (!cloudName || !apiKey || !apiSecret || !uploadPreset)
    throw new ApiError("CLOUDINARY_NOT_CONFIGURED", 503);
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  return { cloudName, apiKey, apiSecret, uploadPreset };
}

const deploymentEnvironment = () =>
  (process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development").replace(/[^a-z0-9_-]/gi, "-");

async function assertCanUpload(
  session: SessionContext,
  requestId: string,
  treeId: string,
  memberId?: string,
) {
  await transaction(session.user_id, session.id, requestId, async (client) => {
    const allowed = memberId
      ? await client.query("SELECT app.can_edit_member($1,$2) allowed", [treeId, memberId])
      : await client.query(
          `SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2
             AND role IN ('owner','administrator','editor') AND revoked_at IS NULL
           UNION ALL SELECT 1 FROM app.branch_grants WHERE tree_id=$1 AND user_id=$2
             AND role='branch_editor' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())`,
          [treeId, session.user_id],
        );
    const permitted = memberId
      ? Boolean((allowed.rows[0] as { allowed?: boolean } | undefined)?.allowed)
      : Boolean(allowed.rowCount);
    if (!permitted) throw new ApiError("FORBIDDEN", 403);
  });
}

export async function signMemberImageUpload(
  session: SessionContext,
  requestId: string,
  treeId: string,
  memberId?: string,
) {
  await assertCanUpload(session, requestId, treeId, memberId);
  const { cloudName, apiKey, apiSecret, uploadPreset } = config();
  const timestamp = Math.floor(Date.now() / 1000);
  const assetFolder = `ancestors-unfold/${deploymentEnvironment()}/trees/${treeId}/member-profiles`;
  const tags = [
    "ancestors-unfold",
    "member-profile",
    `environment-${deploymentEnvironment()}`,
    `tree-${treeId}`,
    "pending",
  ];
  if (memberId) tags.push(`member-${memberId}`);
  const parameters = {
    timestamp,
    upload_preset: uploadPreset,
    asset_folder: assetFolder,
    tags: tags.join(","),
    context: `tree_id=${treeId}|member_id=${memberId ?? "pending"}`,
  };
  return {
    cloudName,
    apiKey,
    parameters,
    signature: cloudinary.utils.api_sign_request(parameters, apiSecret),
  };
}

export async function registerMemberImage(
  session: SessionContext,
  requestId: string,
  treeId: string,
  input: {
    assetId: string;
    publicId: string;
    secureUrl: string;
    version: number;
    signature: string;
    memberId?: string;
  },
) {
  await assertCanUpload(session, requestId, treeId, input.memberId);
  const { cloudName, apiSecret } = config();
  const expected = cloudinary.utils.api_sign_request(
    { public_id: input.publicId, version: input.version },
    apiSecret,
  );
  const received = Buffer.from(input.signature);
  const wanted = Buffer.from(expected);
  if (received.length !== wanted.length || !timingSafeEqual(received, wanted))
    throw new ApiError("INVALID_UPLOAD_SIGNATURE", 400);
  const url = new URL(input.secureUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "res.cloudinary.com" ||
    !url.pathname.startsWith(`/${cloudName}/image/upload/`)
  )
    throw new ApiError("INVALID_UPLOAD_RESPONSE", 400);
  await transaction(session.user_id, session.id, requestId, async (client) => {
    await client.query(
      `INSERT INTO app.cloudinary_assets(asset_id,public_id,tree_id,secure_url,created_by)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(asset_id) DO NOTHING`,
      [input.assetId, input.publicId, treeId, input.secureUrl, session.user_id],
    );
  });
  return { ok: true };
}

async function destroy(publicId: string) {
  config();
  const result = await cloudinary.uploader.destroy(publicId, { invalidate: true });
  if (result.result !== "ok" && result.result !== "not found")
    throw new ApiError("IMAGE_DELETE_FAILED", 502);
}

export async function discardPendingMemberImage(
  session: SessionContext,
  requestId: string,
  treeId: string,
  assetId: string,
) {
  const pending = await transaction(session.user_id, session.id, requestId, async (client) =>
    client.query<{ public_id: string }>(
      `SELECT public_id FROM app.cloudinary_assets WHERE tree_id=$1 AND asset_id=$2
       AND status='pending' AND created_by=$3`,
      [treeId, assetId, session.user_id],
    ),
  );
  const publicId = pending.rows[0]?.public_id;
  if (publicId) {
    await destroy(publicId);
    await transaction(session.user_id, session.id, requestId, async (client) =>
      client.query(
        `DELETE FROM app.cloudinary_assets WHERE tree_id=$1 AND asset_id=$2
         AND status='pending' AND created_by=$3`,
        [treeId, assetId, session.user_id],
      ),
    );
  }
  return { ok: true };
}

export async function reconcileMemberImages(
  session: SessionContext,
  requestId: string,
  treeId: string,
) {
  const obsolete = await transaction(session.user_id, session.id, requestId, async (client) => {
    await client.query(
      `UPDATE app.cloudinary_assets a SET status='active',member_id=m.id,finalized_at=now()
       FROM app.family_members m WHERE m.tree_id=$1 AND m.deleted_at IS NULL
         AND m.image_asset_id=a.asset_id AND m.image_public_id=a.public_id AND m.image_url=a.secure_url`,
      [treeId],
    );
    return client.query<{ asset_id: string; public_id: string }>(
      `SELECT asset_id,public_id FROM app.cloudinary_assets a WHERE a.tree_id=$1 AND a.status='active'
       AND NOT EXISTS (SELECT 1 FROM app.family_members m WHERE m.tree_id=a.tree_id
         AND m.deleted_at IS NULL AND m.image_asset_id=a.asset_id)`,
      [treeId],
    );
  });
  for (const asset of obsolete.rows) {
    try {
      await destroy(asset.public_id);
      await transaction(session.user_id, session.id, requestId, async (client) =>
        client.query("DELETE FROM app.cloudinary_assets WHERE tree_id=$1 AND asset_id=$2", [
          treeId,
          asset.asset_id,
        ]),
      );
    } catch {
      // Keep the registry row so a later successful snapshot can retry deletion.
    }
  }
}

export async function cleanupStaleMemberImages() {
  config();
  const stale = await query<{ public_id: string }>(
    "SELECT public_id FROM app.stale_cloudinary_assets()",
  );
  const removed: string[] = [];
  for (const { public_id } of stale.rows) {
    try {
      await destroy(public_id);
      removed.push(public_id);
    } catch {
      // Keep failed rows pending for the next cleanup run.
    }
  }
  if (removed.length)
    await query("SELECT app.delete_stale_cloudinary_assets($1::text[])", [removed]);
  return { removed: removed.length };
}
