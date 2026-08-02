import type { DragEvent, RefObject } from "react";
import { ImageUp, Link, Upload } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { cn } from "@/shared/utils/cn";

const MEMBER_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

export function MemberImageSource({
  mode,
  setMode,
  imageUrl,
  preview,
  fileName,
  error,
  dragging,
  setDragging,
  fileInputRef,
  selectFile,
  changeUrl,
}: {
  mode: "url" | "upload";
  setMode: (mode: "url" | "upload") => void;
  imageUrl: string;
  preview: string;
  fileName: string;
  error: string;
  dragging: boolean;
  setDragging: (dragging: boolean) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  selectFile: (file?: File) => void;
  changeUrl: (value: string) => void;
}) {
  const { t } = useI18n();
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  };
  return (
    <div className="min-w-0 space-y-4">
      <div>
        <Label id="profile-image-heading" className="text-base font-semibold">
          {t("profile_image")}
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">{t("profile_image_description")}</p>
      </div>
      <Tabs value={mode} onValueChange={(value) => setMode(value as "url" | "upload")}>
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
        <UrlSource value={imageUrl} change={changeUrl} />
      ) : (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            id="img-upload"
            type="file"
            className="sr-only"
            accept={MEMBER_IMAGE_ACCEPT}
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
          <div
            className={cn(
              "flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed bg-background px-4 py-5 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "hover:border-primary/60",
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
            }}
            onDrop={drop}
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
              {preview ? t("replace_image") : t("choose_image")}
            </Button>
          </div>
          {fileName && (
            <p className="truncate text-xs text-muted-foreground" dir="auto">
              {t("image_selected_file", { name: fileName })}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t("image_staged_notice")}</p>
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function UrlSource({ value, change }: { value: string; change: (value: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <Label htmlFor="img" className="text-sm">
        {t("image_url_label")}
      </Label>
      <Input
        id="img"
        type="url"
        inputMode="url"
        dir="ltr"
        value={value}
        onChange={(event) => change(event.target.value)}
        placeholder="https://example.com/photo.jpg"
        aria-describedby="image-url-help"
      />
      <p id="image-url-help" className="text-xs text-muted-foreground">
        {t("image_url_help")}
      </p>
    </div>
  );
}
