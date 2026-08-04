import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { MemberSearchPicker, type FamilyMember } from "@/features/members";
import type { Branch } from "../pages/dashboard-types";
import type { BranchMutation, BranchMutationAction } from "./branch-editor";

// eslint-disable-next-line complexity
export function BranchDetailsForm({
  branch,
  members,
  mutate,
  saving,
  onCancel,
}: {
  branch?: Branch;
  members: FamilyMember[];
  mutate: BranchMutation;
  saving?: BranchMutationAction;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [nameEn, setNameEn] = useState(branch?.name_en ?? "");
  const [nameAr, setNameAr] = useState(branch?.name_ar ?? "");
  const [rootId, setRootId] = useState(branch?.root_family_member_id ?? "");
  const path = branch ? `/${branch.id}` : "";
  const saveAction = branch ? "details" : "create";
  const save = async () => {
    if (!nameEn.trim() || ((!branch || branch.status === "active") && !rootId)) return;
    const changes = {
      name_en: nameEn.trim(),
      name_ar: nameAr.trim() || null,
      ...((!branch || branch.status === "active") && { rootFamilyMemberId: rootId }),
    };
    const saved = branch
      ? await mutate("PATCH", path, changes, saveAction)
      : await mutate("POST", path, { ...changes, status: "active" }, saveAction);
    if (saved) toast.success(t(branch ? "branch_saved" : "branch_created"));
  };
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <Field id="branch-name-en" label={t("name_en")} value={nameEn} setValue={setNameEn} />
      <Field
        id="branch-name-ar"
        label={t("name_ar")}
        value={nameAr}
        setValue={setNameAr}
        dir="rtl"
      />
      {(!branch || branch.status === "active") && (
        <div>
          <Label htmlFor="branch-root">{t("branch_root")}</Label>
          <div id="branch-root" className="mt-2">
            <MemberSearchPicker
              value={rootId}
              onChange={setRootId}
              options={members.filter(({ gender, is_unknown }) => gender === "male" && !is_unknown)}
            />
          </div>
        </div>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button
          loading={saving === saveAction}
          disabled={
            !nameEn.trim() ||
            ((!branch || branch.status === "active") && !rootId) ||
            Boolean(saving)
          }
          onClick={() => void save()}
        >
          {t("save")}
        </Button>
        {!branch && onCancel ? (
          <Button variant="outline" disabled={Boolean(saving)} onClick={onCancel}>
            {t("cancel")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function Field({
  id,
  label,
  value,
  setValue,
  dir,
}: {
  id: string;
  label: string;
  value: string;
  setValue: (value: string) => void;
  dir?: "rtl";
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className="mt-2"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        dir={dir}
      />
    </div>
  );
}
