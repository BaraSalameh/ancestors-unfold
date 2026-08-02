import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { useI18n } from "@/shared/i18n";
import { useMemberForm } from "../client/use-member-form";
import { MemberDemographicFields, MemberNameFields } from "../components/member-form-fields";
import { MemberRelationshipFields } from "../components/member-relationship-fields";
import type { ReactNode } from "react";
import type { FamilyMember, Gender, MemberInput } from "../domain/types";
import { MemberImageField } from "./member-image-field";

interface MemberFormProps {
  initial?: Partial<MemberInput>;
  memberId?: string;
  members: FamilyMember[];
  onSubmit: (data: MemberInput, imageFile?: File) => void;
  onCancel: () => void;
  cancelLabel?: string;
  relationshipFields?: ReactNode | false;
  lockedSpouse?: boolean;
  submitLabel: string;
  lockedGender?: Gender;
  initialImageFile?: File;
}

export function MemberForm(props: MemberFormProps) {
  const { t } = useI18n();
  const form = useMemberForm(props);
  return (
    <form onSubmit={form.submit} className="space-y-5">
      <MemberNameFields form={form} />
      <MemberDemographicFields form={form} lockedGender={props.lockedGender} />
      <MemberImageField
        initialFile={props.initialImageFile}
        value={{
          image_url: form.draft.image_url,
          image_public_id: form.draft.image_public_id,
          image_asset_id: form.draft.image_asset_id,
        }}
        onChange={(image) => {
          form.patch("image_url", image.image_url);
          form.patch("image_public_id", image.image_public_id);
          form.patch("image_asset_id", image.image_asset_id);
          form.clearError();
        }}
        onFileChange={form.setImageFile}
      />
      {props.relationshipFields === false
        ? null
        : (props.relationshipFields ?? (
            <MemberRelationshipFields
              form={form}
              memberId={props.memberId}
              members={props.members}
              lockedSpouse={props.lockedSpouse}
            />
          ))}
      <div className="space-y-2">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Textarea
          id="notes"
          rows={4}
          value={form.draft.notes}
          onChange={(event) => form.patch("notes", event.target.value)}
        />
      </div>
      {form.error && <p className="text-sm text-destructive">{t(form.error)}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={props.onCancel}>
          {props.cancelLabel ?? t("cancel")}
        </Button>
        <Button type="submit">{props.submitLabel}</Button>
      </div>
    </form>
  );
}
