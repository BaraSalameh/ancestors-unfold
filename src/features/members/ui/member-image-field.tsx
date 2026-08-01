import { useEffect, useRef, useState, type DragEvent } from "react";
import { ImageIcon, ImageUp, Link, Upload, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { cn } from "@/shared/utils/cn";
import { useI18n } from "@/shared/i18n";
import type { UploadedMemberImage } from "../api/member-image-client";
import { profileThumbnailUrl } from "./expandable-profile-image";

const MAX_SIZE = 5 * 1024 * 1024;
const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type ImageValue = Partial<UploadedMemberImage> & { image_url: string };

function isValidHttpsUrl(value: string) {
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

export function MemberImageField({
  value,
  initialFile,
  onChange,
  onFileChange,
}: {
  value: ImageValue;
  initialFile?: File;
  onChange: (value: ImageValue) => void;
  onFileChange: (file?: File) => void;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"url" | "upload">(
    initialFile || value.image_asset_id ? "upload" : "url",
  );
  const [preview, setPreview] = useState(() =>
    initialFile ? URL.createObjectURL(initialFile) : value.image_url,
  );
  const [fileName, setFileName] = useState(initialFile?.name ?? "");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  useEffect(
    () => () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const selectFile = (file?: File) => {
    if (!file) return;
    setError("");
    if (!ALLOWED_TYPES.has(file.type)) {
      setError(t("image_format_invalid"));
      return;
    }
    if (file.size > MAX_SIZE) {
      setError(t("image_too_large"));
      return;
    }
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    onChange({ image_url: "" });
    onFileChange(file);
  };

  const handleUrlChange = (next: string) => {
    setError("");
    if (isValidHttpsUrl(next)) {
      setPreview(next.trim());
      onFileChange(undefined);
      onChange({ image_url: next });
      return;
    }
    onChange({ ...value, image_url: next });
  };

  const remove = () => {
    onFileChange(undefined);
    setPreview("");
    setFileName("");
    setError("");
    onChange({ image_url: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  const hasImage = Boolean(preview);

  return (
    <section
      className="rounded-xl border bg-muted/25 p-4 sm:p-5"
      aria-labelledby="profile-image-heading"
    >
      <div className="grid gap-5 sm:grid-cols-[7rem_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background shadow-sm">
            {hasImage ? (
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
          {hasImage ? (
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
          ) : null}
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <Label id="profile-image-heading" className="text-base font-semibold">
              {t("profile_image")}
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">{t("profile_image_description")}</p>
          </div>

          <Tabs value={mode} onValueChange={(next) => setMode(next as "url" | "upload")}>
            <TabsList className="grid h-10 w-full grid-cols-2" aria-label={t("image_source")}>
              <TabsTrigger value="url">
                <Link className="me-2 h-4 w-4" aria-hidden="true" />
                {t("image_source_url")}
              </TabsTrigger>
              <TabsTrigger value="upload">
                <ImageUp className="me-2 h-4 w-4" aria-hidden="true" />
                {t("image_source_upload")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === "url" ? (
            <div className="space-y-2">
              <Label htmlFor="img" className="text-sm">
                {t("image_url_label")}
              </Label>
              <Input
                id="img"
                type="url"
                inputMode="url"
                dir="ltr"
                value={value.image_url}
                onChange={(event) => handleUrlChange(event.target.value)}
                placeholder="https://example.com/photo.jpg"
                aria-describedby="image-url-help"
              />
              <p id="image-url-help" className="text-xs text-muted-foreground">
                {t("image_url_help")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                id="img-upload"
                type="file"
                className="sr-only"
                accept={FILE_ACCEPT}
                onChange={(event) => selectFile(event.target.files?.[0])}
              />
              <div
                className={cn(
                  "flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed bg-background px-4 py-5 text-center transition-colors",
                  isDragging ? "border-primary bg-primary/5" : "hover:border-primary/60",
                )}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node))
                    setIsDragging(false);
                }}
                onDrop={handleDrop}
              >
                <Upload className="mb-2 h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">{t("image_drop_title")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("image_upload_help")}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {hasImage ? t("replace_image") : t("choose_image")}
                </Button>
              </div>
              {fileName ? (
                <p className="truncate text-xs text-muted-foreground" dir="auto">
                  {t("image_selected_file", { name: fileName })}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">{t("image_staged_notice")}</p>
            </div>
          )}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
