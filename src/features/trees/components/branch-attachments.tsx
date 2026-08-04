import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Image, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";

interface BranchAttachment {
  id: string;
  original_name: string;
  media_type: string;
  byte_size: number;
  created_at: string;
  is_own: boolean;
}

interface SignedUpload {
  cloudName: string;
  apiKey: string;
  signature: string;
  parameters: Record<string, string | number>;
}

interface CloudinaryUpload {
  asset_id: string;
  public_id: string;
  secure_url: string;
  version: number;
  signature: string;
  resource_type: "image" | "raw";
  error?: { message?: string };
}

const acceptedTypes = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

// Upload, listing, and ownership controls share one compact branch-scoped surface.
// eslint-disable-next-line max-lines-per-function
export function BranchAttachments({
  treeId,
  branchId,
  active,
  owner,
}: {
  treeId: string;
  branchId: string;
  active: boolean;
  owner: boolean;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<BranchAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const base = `/api/trees/${treeId}/branches/${branchId}/attachments`;
  const reload = useCallback(async () => {
    const response = await fetch(base, { credentials: "include" });
    if (response.ok) setItems((await response.json()) as BranchAttachment[]);
  }, [base]);
  useEffect(() => void reload(), [reload]);

  const upload = async (file?: File) => {
    if (!file || busy) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("branch_attachment_too_large"));
      return;
    }
    setBusy(true);
    let uploaded: CloudinaryUpload | undefined;
    try {
      const checksumSha256 = await sha256(file);
      const metadata = {
        fileName: file.name,
        mediaType: attachmentMediaType(file),
        byteSize: file.size,
        checksumSha256,
      };
      const signedResponse = await fetch(`${base}/sign`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(metadata),
      });
      if (!signedResponse.ok) throw new Error("SIGN_FAILED");
      const signed = (await signedResponse.json()) as SignedUpload;
      const form = new FormData();
      form.set("file", file);
      form.set("api_key", signed.apiKey);
      form.set("signature", signed.signature);
      for (const [key, value] of Object.entries(signed.parameters)) form.set(key, String(value));
      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/auto/upload`,
        { method: "POST", body: form },
      );
      uploaded = (await uploadResponse.json()) as CloudinaryUpload;
      if (!uploadResponse.ok || uploaded.error) throw new Error("UPLOAD_FAILED");
      const register = await fetch(`${base}/register`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...metadata,
          assetId: uploaded.asset_id,
          publicId: uploaded.public_id,
          secureUrl: uploaded.secure_url,
          version: uploaded.version,
          signature: uploaded.signature,
          resourceType: uploaded.resource_type,
        }),
      });
      if (!register.ok) throw new Error("REGISTER_FAILED");
      await reload();
      toast.success(t("branch_attachment_uploaded"));
    } catch {
      if (uploaded?.asset_id)
        void fetch(`${base}/discard`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            assetId: uploaded.asset_id,
            publicId: uploaded.public_id,
            version: uploaded.version,
            signature: uploaded.signature,
            resourceType: uploaded.resource_type,
          }),
        });
      toast.error(t("branch_attachment_failed"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`${base}/${id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("DELETE_FAILED");
      await reload();
      toast.success(t("branch_attachment_deleted"));
    } catch {
      toast.error(t("branch_attachment_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("branch_attachments")}</h2>
          <p className="text-xs text-muted-foreground">{t("branch_attachments_desc")}</p>
        </div>
        {active ? (
          <>
            <input
              ref={input}
              type="file"
              accept={acceptedTypes}
              className="hidden"
              onChange={(event) => void upload(event.target.files?.[0])}
            />
            <Button
              variant="outline"
              disabled={busy}
              loading={busy}
              onClick={() => input.current?.click()}
            >
              <Upload aria-hidden="true" />
              {t("upload_attachment")}
            </Button>
          </>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("no_attachments")}</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-3">
              {item.media_type === "application/pdf" ? (
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              ) : (
                <Image className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <a
                href={`${base}/${item.id}/download`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
              >
                {item.original_name}
              </a>
              <span className="text-xs text-muted-foreground">
                {(Number(item.byte_size) / 1024 / 1024).toFixed(1)} MB
              </span>
              {owner || item.is_own ? (
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={busy}
                  aria-label={t("delete")}
                  onClick={() => void remove(item.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function attachmentMediaType(file: File) {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "pdf") return "application/pdf";
  return file.type;
}
