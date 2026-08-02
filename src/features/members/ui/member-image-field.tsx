import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/shared/i18n";
import type { UploadedMemberImage } from "../api/member-image-client";
import { MemberImagePreview } from "./member-image-preview";
import { MemberImageSource } from "./member-image-source";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
type ImageValue = Partial<UploadedMemberImage> & { image_url: string };

const validHttpsUrl = (value: string) => {
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
};

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
  const [dragging, setDragging] = useState(false);

  useEffect(
    () => () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const selectFile = (file?: File) => {
    if (!file) return;
    setError("");
    if (!ALLOWED_TYPES.has(file.type)) return setError(t("image_format_invalid"));
    if (file.size > MAX_SIZE) return setError(t("image_too_large"));
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    onChange({ image_url: "" });
    onFileChange(file);
  };
  const changeUrl = (next: string) => {
    setError("");
    if (!validHttpsUrl(next)) return onChange({ ...value, image_url: next });
    setPreview(next.trim());
    onFileChange(undefined);
    onChange({ image_url: next });
  };
  const remove = () => {
    onFileChange(undefined);
    setPreview("");
    setFileName("");
    setError("");
    onChange({ image_url: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <section
      className="rounded-xl border bg-muted/25 p-4 sm:p-5"
      aria-labelledby="profile-image-heading"
    >
      <div className="grid gap-5 sm:grid-cols-[7rem_minmax(0,1fr)]">
        <MemberImagePreview
          preview={preview}
          mode={mode}
          fileInputRef={fileInputRef}
          remove={remove}
        />
        <MemberImageSource
          mode={mode}
          setMode={setMode}
          imageUrl={value.image_url}
          preview={preview}
          fileName={fileName}
          error={error}
          dragging={dragging}
          setDragging={setDragging}
          fileInputRef={fileInputRef}
          selectFile={selectFile}
          changeUrl={changeUrl}
        />
      </div>
    </section>
  );
}
