import { z } from "zod";
import { validatedApiRequest } from "@/shared/api/client";

export const branchAttachmentSchema = z.object({
  id: z.string().uuid(),
  original_name: z.string(),
  media_type: z.string(),
  byte_size: z.coerce.number().nonnegative(),
  created_at: z.string(),
  is_own: z.boolean(),
});

const signedUploadSchema = z.object({
  cloudName: z.string().min(1),
  apiKey: z.string().min(1),
  signature: z.string().min(1),
  parameters: z.record(z.union([z.string(), z.number()])),
});

const cloudinaryUploadSchema = z.object({
  asset_id: z.string().min(1),
  public_id: z.string().min(1),
  secure_url: z.string().url(),
  version: z.number(),
  signature: z.string().min(1),
  resource_type: z.enum(["image", "raw"]),
});

const successSchema = z.object({ ok: z.literal(true) }).passthrough();
export type BranchAttachment = z.infer<typeof branchAttachmentSchema>;

export async function listBranchAttachments(base: string) {
  return validatedApiRequest(z.array(branchAttachmentSchema), base);
}

export async function uploadBranchAttachment(base: string, file: File) {
  const metadata = {
    fileName: file.name,
    mediaType: attachmentMediaType(file),
    byteSize: file.size,
    checksumSha256: await sha256(file),
  };
  const signed = await validatedApiRequest(signedUploadSchema, `${base}/sign`, {
    method: "POST",
    body: metadata,
  });
  const form = new FormData();
  form.set("file", file);
  form.set("api_key", signed.apiKey);
  form.set("signature", signed.signature);
  for (const [key, value] of Object.entries(signed.parameters)) form.set(key, String(value));
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/auto/upload`,
    { method: "POST", body: form },
  );
  const parsed = cloudinaryUploadSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success) throw new Error("UPLOAD_FAILED");
  try {
    await validatedApiRequest(successSchema, `${base}/register`, {
      method: "POST",
      body: {
        ...metadata,
        assetId: parsed.data.asset_id,
        publicId: parsed.data.public_id,
        secureUrl: parsed.data.secure_url,
        version: parsed.data.version,
        signature: parsed.data.signature,
        resourceType: parsed.data.resource_type,
      },
    });
  } catch (error) {
    void discardUpload(base, parsed.data);
    throw error;
  }
}

function discardUpload(base: string, upload: z.infer<typeof cloudinaryUploadSchema>) {
  return validatedApiRequest(successSchema, `${base}/discard`, {
    method: "POST",
    body: {
      assetId: upload.asset_id,
      publicId: upload.public_id,
      version: upload.version,
      signature: upload.signature,
      resourceType: upload.resource_type,
    },
  });
}

export function deleteBranchAttachment(base: string, id: string) {
  return validatedApiRequest(successSchema, `${base}/${id}`, { method: "DELETE" });
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function attachmentMediaType(file: File) {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  const byExtension: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    pdf: "application/pdf",
  };
  return (extension && byExtension[extension]) || file.type;
}
