import { timingSafeEqual } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { transaction } from "@/shared/server/database";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError, parseBody, schemas } from "@/server/security";
import type { CollaborationSession } from "./types";

const allowedExtensions: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/heic": ["heic"],
  "application/pdf": ["pdf"],
};

function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const uploadPreset = process.env.CLOUDINARY_BRANCH_ATTACHMENT_PRESET;
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

function validateExtension(fileName: string, mediaType: keyof typeof allowedExtensions) {
  const extension = fileName.split(".").pop()?.toLocaleLowerCase() ?? "";
  if (!allowedExtensions[mediaType].includes(extension))
    throw new ApiError("INVALID_FILE_TYPE", 400);
}

async function branchAccess(
  client: import("pg").PoolClient,
  treeId: string,
  branchId: string,
  userId: string,
) {
  const result = await client.query<{ owner: boolean; contributor: boolean; status: string }>(
    `SELECT b.status,
       app.has_tree_role(b.tree_id,'owner','administrator') owner,
       EXISTS(SELECT 1 FROM app.branch_grants g
         WHERE g.tree_id=b.tree_id AND g.root_subfamily_id=b.id AND g.user_id=$3
           AND g.role='branch_editor' AND g.revoked_at IS NULL
           AND (g.expires_at IS NULL OR g.expires_at>now())) contributor
     FROM app.subfamilies b WHERE b.tree_id=$1 AND b.id=$2 AND b.deleted_at IS NULL`,
    [treeId, branchId, userId],
  );
  const access = result.rows[0];
  if (!access || (!access.owner && !access.contributor)) throw new ApiError("FORBIDDEN", 403);
  return access;
}

export async function handleBranchAttachmentRequest(
  request: Request,
  url: URL,
  session: CollaborationSession,
  requestId: string,
): Promise<Response | undefined> {
  const base = url.pathname.match(
    /^\/api\/trees\/([0-9a-f-]+)\/branches\/([0-9a-f-]+)\/attachments$/,
  );
  if (base && request.method === "GET")
    return listAttachments(base[1], base[2], session, requestId);
  const sign = url.pathname.match(
    /^\/api\/trees\/([0-9a-f-]+)\/branches\/([0-9a-f-]+)\/attachments\/sign$/,
  );
  if (sign && request.method === "POST")
    return signAttachment(request, sign[1], sign[2], session, requestId);
  const register = url.pathname.match(
    /^\/api\/trees\/([0-9a-f-]+)\/branches\/([0-9a-f-]+)\/attachments\/register$/,
  );
  if (register && request.method === "POST")
    return registerAttachment(request, register[1], register[2], session, requestId);
  const discard = url.pathname.match(
    /^\/api\/trees\/([0-9a-f-]+)\/branches\/([0-9a-f-]+)\/attachments\/discard$/,
  );
  if (discard && request.method === "POST")
    return discardAttachment(request, discard[1], discard[2], session, requestId);
  const download = url.pathname.match(
    /^\/api\/trees\/([0-9a-f-]+)\/branches\/([0-9a-f-]+)\/attachments\/([0-9a-f-]+)\/download$/,
  );
  if (download && request.method === "GET")
    return downloadAttachment(download[1], download[2], download[3], session, requestId);
  const item = url.pathname.match(
    /^\/api\/trees\/([0-9a-f-]+)\/branches\/([0-9a-f-]+)\/attachments\/([0-9a-f-]+)$/,
  );
  if (item && request.method === "DELETE")
    return deleteAttachment(item[1], item[2], item[3], session, requestId);
  return undefined;
}

async function listAttachments(
  treeId: string,
  branchId: string,
  session: CollaborationSession,
  requestId: string,
) {
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    await branchAccess(client, treeId, branchId, session.user_id);
    return client.query(
      `SELECT f.id,f.original_name,f.media_type,f.byte_size,f.created_at,
              f.uploaded_by=$3 is_own
       FROM app.subfamily_attachments a JOIN app.files f ON f.id=a.file_id
       WHERE a.tree_id=$1 AND a.subfamily_id=$2 AND f.deleted_at IS NULL
         AND f.scan_status='clean' ORDER BY f.created_at DESC`,
      [treeId, branchId, session.user_id],
    );
  });
  return json(result.rows);
}

async function signAttachment(
  request: Request,
  treeId: string,
  branchId: string,
  session: CollaborationSession,
  requestId: string,
) {
  const body = await parseBody(request, schemas.branchAttachmentSign);
  validateExtension(body.fileName, body.mediaType);
  await transaction(session.user_id, session.id, requestId, async (client) => {
    const access = await branchAccess(client, treeId, branchId, session.user_id);
    if (access.status !== "active") throw new ApiError("BRANCH_UNAVAILABLE", 409);
  });
  const { cloudName, apiKey, apiSecret, uploadPreset } = cloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const parameters = {
    timestamp,
    upload_preset: uploadPreset,
    type: "authenticated",
    asset_folder: `ancestors-unfold/${deploymentEnvironment()}/trees/${treeId}/branches/${branchId}`,
    tags: `ancestors-unfold,branch-attachment,tree-${treeId},branch-${branchId}`,
    context: `tree_id=${treeId}|branch_id=${branchId}|uploaded_by=${session.user_id}|checksum_sha256=${body.checksumSha256}`,
  };
  return json({
    cloudName,
    apiKey,
    parameters,
    signature: cloudinary.utils.api_sign_request(parameters, apiSecret),
  });
}

// Registration deliberately validates every provider and client field at one trust boundary.
// eslint-disable-next-line complexity
async function registerAttachment(
  request: Request,
  treeId: string,
  branchId: string,
  session: CollaborationSession,
  requestId: string,
) {
  const body = await parseBody(request, schemas.branchAttachmentRegister);
  validateExtension(body.fileName, body.mediaType);
  const { cloudName, apiSecret } = cloudinaryConfig();
  const expectedSignature = cloudinary.utils.api_sign_request(
    { public_id: body.publicId, version: body.version },
    apiSecret,
  );
  const received = Buffer.from(body.signature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    throw new ApiError("INVALID_UPLOAD_SIGNATURE", 400);
  const secureUrl = new URL(body.secureUrl);
  if (
    secureUrl.protocol !== "https:" ||
    secureUrl.hostname !== "res.cloudinary.com" ||
    !secureUrl.pathname.startsWith(`/${cloudName}/`)
  )
    throw new ApiError("INVALID_UPLOAD_RESPONSE", 400);
  const resource = (await cloudinary.api.resource(body.publicId, {
    resource_type: body.resourceType,
    type: "authenticated",
    context: true,
  })) as {
    asset_id?: string;
    bytes?: number;
    format?: string;
    context?: { custom?: Record<string, string> };
  };
  const context = resource.context?.custom ?? {};
  const allowedFormats = allowedExtensions[body.mediaType];
  if (
    resource.asset_id !== body.assetId ||
    resource.bytes !== body.byteSize ||
    !resource.format ||
    !allowedFormats.includes(resource.format.toLocaleLowerCase()) ||
    context.tree_id !== treeId ||
    context.branch_id !== branchId ||
    context.uploaded_by !== session.user_id ||
    context.checksum_sha256 !== body.checksumSha256
  )
    throw new ApiError("INVALID_UPLOAD_RESPONSE", 400);
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    const access = await branchAccess(client, treeId, branchId, session.user_id);
    if (access.status !== "active") throw new ApiError("BRANCH_UNAVAILABLE", 409);
    const file = (
      await client.query<{ id: string }>(
        `INSERT INTO app.files(
           storage_provider,object_key,original_name,media_type,byte_size,checksum_sha256,
           uploaded_by,scan_status
         ) VALUES('cloudinary',$1,$2,$3,$4,decode($5,'hex'),$6,'clean') RETURNING id`,
        [
          `${body.resourceType}:${body.publicId}`,
          body.fileName,
          body.mediaType,
          body.byteSize,
          body.checksumSha256,
          session.user_id,
        ],
      )
    ).rows[0];
    await client.query(
      `INSERT INTO app.subfamily_attachments(subfamily_id,tree_id,file_id)
       VALUES($1,$2,$3)`,
      [branchId, treeId, file.id],
    );
    return file;
  });
  return json(result, 201);
}

async function attachmentRecord(
  treeId: string,
  branchId: string,
  fileId: string,
  session: CollaborationSession,
  requestId: string,
) {
  return transaction(session.user_id, session.id, requestId, async (client) => {
    const access = await branchAccess(client, treeId, branchId, session.user_id);
    const file = (
      await client.query<{
        object_key: string;
        original_name: string;
        media_type: string;
        uploaded_by: string;
      }>(
        `SELECT f.object_key,f.original_name,f.media_type,f.uploaded_by
         FROM app.subfamily_attachments a JOIN app.files f ON f.id=a.file_id
         WHERE a.tree_id=$1 AND a.subfamily_id=$2 AND f.id=$3 AND f.deleted_at IS NULL`,
        [treeId, branchId, fileId],
      )
    ).rows[0];
    if (!file) throw new ApiError("NOT_FOUND", 404);
    return { ...file, owner: access.owner };
  });
}

async function discardAttachment(
  request: Request,
  treeId: string,
  branchId: string,
  session: CollaborationSession,
  requestId: string,
) {
  const body = await parseBody(request, schemas.branchAttachmentDiscard);
  const { apiSecret } = cloudinaryConfig();
  const expected = Buffer.from(
    cloudinary.utils.api_sign_request(
      { public_id: body.publicId, version: body.version },
      apiSecret,
    ),
  );
  const received = Buffer.from(body.signature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    throw new ApiError("INVALID_UPLOAD_SIGNATURE", 400);
  await transaction(session.user_id, session.id, requestId, async (client) => {
    await branchAccess(client, treeId, branchId, session.user_id);
  });
  const resource = (await cloudinary.api.resource(body.publicId, {
    resource_type: body.resourceType,
    type: "authenticated",
    context: true,
  })) as { asset_id?: string; context?: { custom?: Record<string, string> } };
  const context = resource.context?.custom ?? {};
  if (
    resource.asset_id !== body.assetId ||
    context.tree_id !== treeId ||
    context.branch_id !== branchId ||
    context.uploaded_by !== session.user_id
  )
    throw new ApiError("INVALID_UPLOAD_RESPONSE", 400);
  const removed = await cloudinary.uploader.destroy(body.publicId, {
    resource_type: body.resourceType,
    type: "authenticated",
    invalidate: true,
  });
  if (removed.result !== "ok" && removed.result !== "not found")
    throw new ApiError("FILE_DELETE_FAILED", 502);
  return json({ ok: true });
}

async function downloadAttachment(
  treeId: string,
  branchId: string,
  fileId: string,
  session: CollaborationSession,
  requestId: string,
) {
  const file = await attachmentRecord(treeId, branchId, fileId, session, requestId);
  cloudinaryConfig();
  const [resourceType, ...publicIdParts] = file.object_key.split(":");
  const extension = file.original_name.split(".").pop()?.toLocaleLowerCase() ?? "";
  const location = cloudinary.utils.private_download_url(
    publicIdParts.join(":"),
    extension === "jpeg" ? "jpg" : extension,
    {
      resource_type: resourceType,
      type: "authenticated",
      attachment: file.media_type === "application/pdf",
      expires_at: Math.floor(Date.now() / 1000) + 5 * 60,
    },
  );
  return new Response(null, {
    status: 302,
    headers: { location, "cache-control": "private,no-store" },
  });
}

async function deleteAttachment(
  treeId: string,
  branchId: string,
  fileId: string,
  session: CollaborationSession,
  requestId: string,
) {
  const file = await attachmentRecord(treeId, branchId, fileId, session, requestId);
  if (!file.owner && file.uploaded_by !== session.user_id) throw new ApiError("FORBIDDEN", 403);
  cloudinaryConfig();
  const [resourceType, ...publicIdParts] = file.object_key.split(":");
  const removed = await cloudinary.uploader.destroy(publicIdParts.join(":"), {
    resource_type: resourceType,
    type: "authenticated",
    invalidate: true,
  });
  if (removed.result !== "ok" && removed.result !== "not found")
    throw new ApiError("FILE_DELETE_FAILED", 502);
  await transaction(session.user_id, session.id, requestId, async (client) => {
    await branchAccess(client, treeId, branchId, session.user_id);
    await client.query("UPDATE app.files SET deleted_at=now() WHERE id=$1", [fileId]);
    await client.query(
      "DELETE FROM app.subfamily_attachments WHERE tree_id=$1 AND subfamily_id=$2 AND file_id=$3",
      [treeId, branchId, fileId],
    );
  });
  return json({ ok: true });
}
