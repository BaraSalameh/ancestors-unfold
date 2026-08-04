import { useI18n } from "@/shared/i18n";
import type { MemberFormController } from "../client/use-member-form";
import type { FamilyMember } from "../domain/types";
import { ExternalChildrenEditor } from "./external-children-editor";
import { MotherChildrenEditor } from "./mother-children-editor";
import { RelationSearch } from "./relation-search";
import { SpousesEditor } from "./spouses-editor";

export function MemberRelationshipFields({
  form,
  memberId,
  members,
  lockedSpouse = false,
}: {
  form: MemberFormController;
  memberId?: string;
  members: FamilyMember[];
  lockedSpouse?: boolean;
}) {
  const { t, lang } = useI18n();
  const spouseEditor = form.draft.gender === "male" && Boolean(memberId);
  return (
    <>
      {memberId && (
        <div className="grid gap-4 sm:grid-cols-2">
          <RelationSearch
            label={t("father")}
            value={form.draft.father_id}
            onChange={form.changeFather}
            options={form.eligibleFathers}
            selectedOption={form.selectedFather}
            lang={lang}
            searchFirst
          />
          <RelationSearch
            label={t("mother")}
            value={form.draft.mother_id}
            onChange={(value) => form.patch("mother_id", value)}
            options={form.draft.father_id ? form.fatherWives : form.eligibleMothers}
            selectedOption={form.selectedMother}
            lang={lang}
            searchFirst={!form.draft.father_id}
          />
        </div>
      )}
      {!spouseEditor && (
        <RelationSearch
          label={t("spouse")}
          value={form.draft.spouse_id}
          onChange={(value) => form.patch("spouse_id", value)}
          options={form.draft.gender === "male" ? form.females : form.males}
          lang={lang}
          selectedOption={members.find((member) => member.id === form.draft.spouse_id)}
          disabled={lockedSpouse}
        />
      )}
      {spouseEditor && memberId && <SpousesEditor maleId={memberId} allMembers={members} />}
      {form.draft.gender === "female" && (
        <>
          {memberId && <MotherChildrenEditor motherId={memberId} members={members} />}
          <ExternalChildrenEditor
            value={form.draft.external_children}
            onChange={(value) => form.patch("external_children", value)}
          />
        </>
      )}
    </>
  );
}
