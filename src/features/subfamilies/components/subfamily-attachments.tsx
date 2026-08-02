import { useState } from "react";
import { X } from "lucide-react";
import { familyStore } from "@/features/trees";
import type { SubFamily } from "@/features/members";
import { useI18n } from "@/shared/i18n";

export function SubfamilyAttachments({ subfamily }: { subfamily: SubFamily }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [type, setType] = useState("Document");
  const [url, setUrl] = useState("");
  const add = () => {
    if (!name.trim() || !url.trim()) return;
    familyStore.updateSubfamily(subfamily.id, {
      attachments: [
        ...(subfamily.attachments ?? []),
        {
          id: crypto.randomUUID(),
          name: name.trim(),
          type: type.trim() || "Document",
          url: url.trim(),
          created_at: new Date().toISOString(),
        },
      ],
    });
    setName("");
    setType("Document");
    setUrl("");
  };
  const remove = (id: string) =>
    familyStore.updateSubfamily(subfamily.id, {
      attachments: (subfamily.attachments ?? []).filter((attachment) => attachment.id !== id),
    });
  return (
    <div className="space-y-2 rounded border bg-background/50 p-2">
      <div className="text-[10px] font-semibold text-card-foreground">{t("add_attachment")}</div>
      <div className="flex flex-col gap-1">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("attachment_name")}
          className="w-full rounded border bg-background px-2 py-1 text-[10px]"
        />
        <input
          type="text"
          value={type}
          onChange={(event) => setType(event.target.value)}
          placeholder={t("attachment_type")}
          className="w-full rounded border bg-background px-2 py-1 text-[10px]"
        />
        <input
          type="text"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={t("attachment_url")}
          className="w-full rounded border bg-background px-2 py-1 text-[10px]"
        />
        <button
          type="button"
          onClick={add}
          disabled={!name.trim() || !url.trim()}
          className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground disabled:opacity-50"
        >
          {t("add_attachment")}
        </button>
      </div>
      {(subfamily.attachments?.length ?? 0) === 0 ? (
        <p className="text-[10px] text-muted-foreground">{t("no_attachments")}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {(subfamily.attachments ?? []).map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1"
            >
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-primary underline-offset-2 hover:underline"
              >
                {attachment.name} ({attachment.type})
              </a>
              <button
                type="button"
                onClick={() => remove(attachment.id)}
                className="text-[10px] text-muted-foreground hover:text-destructive"
                title={t("delete")}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
