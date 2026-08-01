import { apiRequest } from "@/shared/api/client";

export type UploadedMemberImage = {
  image_url: string;
  image_public_id: string;
  image_asset_id: string;
};

type SignedUpload = {
  cloudName: string;
  apiKey: string;
  signature: string;
  parameters: Record<string, string | number>;
};

type CloudinaryUploadResponse = {
  asset_id: string;
  public_id: string;
  secure_url: string;
  version: number;
  signature: string;
  error?: { message?: string };
};

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
      let payload: CloudinaryUploadResponse;
      try {
        payload = JSON.parse(request.responseText) as CloudinaryUploadResponse;
      } catch {
        reject(new Error("IMAGE_UPLOAD_FAILED"));
        return;
      }
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
    const signed = await apiRequest<SignedUpload>(`/api/trees/${treeId}/member-images/sign`, {
      method: "POST",
      body: { memberId },
    });
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
    await apiRequest(`/api/trees/${treeId}/member-images/register`, {
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
    return apiRequest(`/api/trees/${treeId}/member-images/discard`, {
      method: "POST",
      body: { assetId },
    });
  },
};
