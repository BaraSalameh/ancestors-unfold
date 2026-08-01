import type { RefObject } from "react";
import { ImageIcon, ImageUp, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { profileThumbnailUrl } from "../domain/member-image-url";

export function MemberImagePreview({
  preview,
  mode,
  fileInputRef,
  remove,
}: {
  preview: string;
  mode: "url" | "upload";
  fileInputRef: RefObject<HTMLInputElement | null>;
  remove: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-2 sm:items-start">
      <div className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background shadow-sm">
        {preview ? (
          <img
            src={profileThumbnailUrl(preview)}
            alt={t("profile_image_preview")}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 px-3 text-center text-muted-foreground">
            <ImageIcon className="h-8 w-8" aria-hidden="true" />
            <span className="text-xs">{t("image_empty_state")}</span>
          </div>
        )}
      </div>
      {preview && (
        <div className="flex w-full justify-center gap-1 sm:justify-start">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() =>
              mode === "upload"
                ? fileInputRef.current?.click()
                : document.getElementById("img")?.focus()
            }
          >
            <ImageUp className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t("replace_image")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 shrink-0 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={remove}
            aria-label={t("remove_image")}
            title={t("remove_image")}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
