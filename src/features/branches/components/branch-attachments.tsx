import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Image, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import {
  deleteBranchAttachment,
  listBranchAttachments,
  uploadBranchAttachment,
  type BranchAttachment,
} from "../client/branch-attachment-client";

const acceptedTypes = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

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
    const next = await listBranchAttachments(base).catch(() => undefined);
    if (next) setItems(next);
  }, [base]);
  useEffect(() => void reload(), [reload]);

  const upload = async (file?: File) => {
    if (!file || busy) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("branch_attachment_too_large"));
      return;
    }
    setBusy(true);
    try {
      await uploadBranchAttachment(base, file);
      await reload();
      toast.success(t("branch_attachment_uploaded"));
    } catch {
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
      await deleteBranchAttachment(base, id);
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
        <AttachmentList items={items} base={base} owner={owner} busy={busy} remove={remove} />
      )}
    </section>
  );
}

function AttachmentList({
  items,
  base,
  owner,
  busy,
  remove,
}: {
  items: BranchAttachment[];
  base: string;
  owner: boolean;
  busy: boolean;
  remove: (id: string) => Promise<void>;
}) {
  const { t } = useI18n();
  return (
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
            {(item.byte_size / 1024 / 1024).toFixed(1)} MB
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
  );
}
