import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n";
import type { MemberFormController } from "../client/use-member-form";
import type { CitizenStatus, Gender } from "../domain/types";

export function MemberNameFields({ form }: { form: MemberFormController }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="name_en">{t("name_en")}</Label>
        <Input
          id="name_en"
          value={form.draft.name_en}
          onChange={(event) => form.patch("name_en", event.target.value)}
          dir="ltr"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name_ar">{t("name_ar")}</Label>
        <Input
          id="name_ar"
          value={form.draft.name_ar}
          onChange={(event) => form.patch("name_ar", event.target.value)}
          dir="rtl"
        />
      </div>
    </div>
  );
}

export function MemberDemographicFields({
  form,
  lockedGender,
}: {
  form: MemberFormController;
  lockedGender?: Gender;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <div className="space-y-2">
        <Label>{t("gender")}</Label>
        <Select
          value={form.draft.gender}
          disabled={Boolean(lockedGender)}
          onValueChange={(value) => form.patch("gender", value as Gender)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unspecified">{t("gender_unspecified")}</SelectItem>
            <SelectItem value="male">{t("male")}</SelectItem>
            <SelectItem value="female">{t("female")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{t("citizen_status")}</Label>
        <Select
          value={form.draft.citizen_status}
          onValueChange={(value) => form.patch("citizen_status", value as CitizenStatus)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="resident">{t("resident")}</SelectItem>
            <SelectItem value="non_resident">{t("non_resident")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DateField
        id="birth"
        label={t("birth_date")}
        value={form.draft.birth_date}
        onChange={(value) => form.patch("birth_date", value)}
      />
      <div className="space-y-2">
        <Label htmlFor="death">{t("death_date")}</Label>
        <Input
          id="death"
          type="date"
          value={form.draft.death_date}
          onChange={(event) => form.changeDeathDate(event.target.value)}
        />
        <label
          htmlFor="is_deceased"
          className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
        >
          <input
            id="is_deceased"
            type="checkbox"
            checked={form.draft.is_deceased}
            onChange={(event) => form.changeDeceased(event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <span>{t("deceased")}</span>
        </label>
      </div>
    </div>
  );
}

function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
