import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { MemberSearchPicker } from "@/features/members/components";
import type { FamilyMember } from "@/features/members/domain";
import type { Branch } from "@/features/collaboration";
import { newBranchConflicts } from "@/features/trees/domain";
import type { BranchMutation, BranchMutationAction } from "./branch-editor";

export function BranchDetailsForm({
  branch,
  branches,
  members,
  mutate,
  saving,
  onCancel,
}: {
  branch?: Branch;
  branches: Branch[];
  members: FamilyMember[];
  mutate: BranchMutation;
  saving?: BranchMutationAction;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const form = useBranchDetailsForm({ branch, branches, mutate, t });
  const requiresRoot = !branch || branch.status === "active";
  const saveDisabled = !form.nameEn.trim() || (requiresRoot && !form.rootId) || Boolean(saving);
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <Field
        id="branch-name-en"
        label={t("name_en")}
        value={form.nameEn}
        setValue={form.setNameEn}
      />
      <Field
        id="branch-name-ar"
        label={t("name_ar")}
        value={form.nameAr}
        setValue={form.setNameAr}
        dir="rtl"
      />
      {requiresRoot ? (
        <BranchRootField members={members} value={form.rootId} onChange={form.setRootId} />
      ) : null}
      <div className="flex gap-2 sm:col-span-2">
        <Button
          loading={saving === form.saveAction}
          disabled={saveDisabled}
          onClick={() => void form.save()}
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

function useBranchDetailsForm({
  branch,
  branches,
  mutate,
  t,
}: {
  branch?: Branch;
  branches: Branch[];
  mutate: BranchMutation;
  t: ReturnType<typeof useI18n>["t"];
}) {
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
    const conflict = branchFormConflict(branches, branch, changes.name_en, changes.name_ar, rootId);
    if (conflict) {
      const key =
        conflict.code === "DUPLICATE_BRANCH_ROOT"
          ? "duplicate_branch_root"
          : "duplicate_branch_name";
      toast.error(t(key));
      return;
    }
    const saved = branch
      ? await mutate("PATCH", path, changes, saveAction)
      : await mutate("POST", path, { ...changes, status: "active" }, saveAction);
    if (saved) toast.success(t(branch ? "branch_saved" : "branch_created"));
  };
  return { nameEn, setNameEn, nameAr, setNameAr, rootId, setRootId, saveAction, save };
}

function BranchRootField({
  members,
  value,
  onChange,
}: {
  members: FamilyMember[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const options = members.filter(({ gender, is_unknown }) => gender === "male" && !is_unknown);
  return (
    <div>
      <Label htmlFor="branch-root">{t("branch_root")}</Label>
      <div id="branch-root" className="mt-2">
        <MemberSearchPicker value={value} onChange={onChange} options={options} members={members} />
      </div>
    </div>
  );
}

function branchFormConflict(
  branches: Branch[],
  branch: Branch | undefined,
  nameEn: string,
  nameAr: string | null,
  rootId: string,
) {
  const current = branches.map((item) => ({
    id: item.id,
    name_en: item.name_en,
    name_ar: item.name_ar,
    linked_male_id: item.root_family_member_id,
  }));
  const candidate = {
    id: branch?.id ?? "new",
    name_en: nameEn,
    name_ar: nameAr,
    linked_male_id: rootId,
  };
  const next = branch
    ? current.map((item) => (item.id === branch.id ? candidate : item))
    : [...current, candidate];
  return newBranchConflicts(current, next)[0];
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
