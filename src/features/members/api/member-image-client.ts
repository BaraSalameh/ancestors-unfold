import { z } from "zod";
import { validatedApiRequest } from "@/shared/api/client";

export type UploadedMemberImage = {
  image_url: string;
  image_public_id: string;
  image_asset_id: string;
};

const signedUploadSchema = z
  .object({
    cloudName: z.string().min(1),
    apiKey: z.string().min(1),
    signature: z.string().min(1),
    parameters: z.record(z.union([z.string(), z.number()])),
  })
  .strict();

const cloudinaryUploadSchema = z.object({
  asset_id: z.string().min(1),
  public_id: z.string().min(1),
  secure_url: z.string().url(),
  version: z.number(),
  signature: z.string().min(1),
  error: z.object({ message: z.string().optional() }).optional(),
});
const successSchema = z.object({ ok: z.literal(true) }).strict();
type CloudinaryUploadResponse = z.infer<typeof cloudinaryUploadSchema>;

function postUpload(
  url: string,
  body: FormData,
  onProgress: (progress: number) => void,
): Promise<CloudinaryUploadResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("IMAGE_UPLOAD_FAILED"));
    request.onload = () => {
      let rawPayload: unknown;
      try {
        rawPayload = JSON.parse(request.responseText) as unknown;
      } catch {
        reject(new Error("IMAGE_UPLOAD_FAILED"));
        return;
      }
      const parsed = cloudinaryUploadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        reject(new Error("IMAGE_UPLOAD_FAILED"));
        return;
      }
      const payload = parsed.data;
      if (request.status < 200 || request.status >= 300 || payload.error) {
        reject(new Error(payload.error?.message ?? "IMAGE_UPLOAD_FAILED"));
        return;
      }
      resolve(payload);
    };
    request.send(body);
  });
}

export const memberImageClient = {
  async upload(
    treeId: string,
    memberId: string | undefined,
    file: File,
    onProgress: (progress: number) => void,
  ): Promise<UploadedMemberImage> {
    const signed = await validatedApiRequest(
      signedUploadSchema,
      `/api/trees/${treeId}/member-images/sign`,
      { method: "POST", body: { memberId } },
    );
    const body = new FormData();
    body.set("file", file);
    body.set("api_key", signed.apiKey);
    body.set("signature", signed.signature);
    for (const [key, value] of Object.entries(signed.parameters)) body.set(key, String(value));
    const uploaded = await postUpload(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/image/upload`,
      body,
      onProgress,
    );
    await validatedApiRequest(successSchema, `/api/trees/${treeId}/member-images/register`, {
      method: "POST",
      body: {
        assetId: uploaded.asset_id,
        publicId: uploaded.public_id,
        secureUrl: uploaded.secure_url,
        version: uploaded.version,
        signature: uploaded.signature,
        memberId,
      },
    });
    return {
      image_url: uploaded.secure_url,
      image_public_id: uploaded.public_id,
      image_asset_id: uploaded.asset_id,
    };
  },
  discard(treeId: string, assetId: string) {
    return validatedApiRequest(successSchema, `/api/trees/${treeId}/member-images/discard`, {
      method: "POST",
      body: { assetId },
    });
  },
};
