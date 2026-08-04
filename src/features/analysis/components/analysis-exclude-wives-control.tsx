import { useI18n } from "@/shared/i18n";
import { Label } from "@/shared/ui/label";

export function AnalysisExcludeWivesControl({
  checked,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <Label
      htmlFor="analysis-exclude-wives"
      aria-disabled={disabled}
      className={`flex h-10 shrink-0 items-center gap-2 rounded-md border bg-background px-3 text-sm ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <input
        id="analysis-exclude-wives"
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{t("analysis_exclude_wives")}</span>
    </Label>
  );
}
