import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { MemberForm } from "@/features/members";
import { familyStore, useFamily } from "@/features/trees";
import { useI18n } from "@/shared/i18n";
import { addMemberTitleKey } from "../domain/add-member-title";
import { memberDetailsSearch } from "../domain/member-navigation";
import { existingStagedSpouse, type StagedSpouse } from "../domain/staged-spouse";
import { StagedSpousesEditor } from "../components/staged-spouses-editor";
import type { FamilyMember } from "../domain/types";

function lockedFatherForMother(
  parentRole: "father" | "mother" | undefined,
  child: FamilyMember | undefined,
): string | undefined {
  return parentRole === "mother" ? child?.father_id : undefined;
}

export function AddPage() {
  const { fatherId, motherId, childId, spouseId, parentRole, returnPreview } = useSearch({
    from: "/add",
  });
  const treeId = familyStore.getActiveTreeId();
  return (
    <AddMemberPage
      treeId={treeId}
      fatherId={fatherId}
      motherId={motherId}
      childId={childId}
      spouseId={spouseId}
      parentRole={parentRole}
      returnPreview={returnPreview}
    />
  );
}

export function AddMemberPage({
  treeId,
  fatherId,
  motherId,
  childId,
  spouseId,
  parentRole,
  returnPreview = "lineage",
}: {
  treeId: string;
  fatherId?: string;
  motherId?: string;
  childId?: string;
  spouseId?: string;
  parentRole?: "father" | "mother";
  returnPreview?: "lineage" | "chronological";
}) {
  const navigate = useNavigate();
  const members = useFamily();
  const { t } = useI18n();
  const title = t(addMemberTitleKey({ fatherId, motherId, spouseId, parentRole }));

  // Pre-fill based on context
  const child = childId ? members.find((m) => m.id === childId) : undefined;
  const spouseTo = spouseId ? members.find((m) => m.id === spouseId) : undefined;
  const addingFather = parentRole === "father";
  const lockedFatherSpouseId = lockedFatherForMother(parentRole, child);
  const [stagedSpouses, setStagedSpouses] = useState<StagedSpouse[]>(() =>
    child?.mother_id ? [existingStagedSpouse(child.mother_id, true)] : [],
  );
  if (!familyStore.canEditActiveTree())
    return <div className="p-8 text-center text-muted-foreground">{t("not_found")}</div>;

  const initial = {
    father_id: fatherId,
    mother_id: motherId,
    spouse_id: spouseId ?? lockedFatherSpouseId,
    gender:
      parentRole === "mother"
        ? ("female" as const)
        : parentRole === "father"
          ? ("male" as const)
          : spouseTo
            ? spouseTo.gender === "male"
              ? ("female" as const)
              : ("male" as const)
            : ("male" as const),
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-foreground">{title}</h1>
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <MemberForm
          initial={initial}
          members={members}
          lockedGender={
            parentRole === "father"
              ? "male"
              : parentRole === "mother"
                ? "female"
                : spouseTo
                  ? spouseTo.gender === "male"
                    ? "female"
                    : "male"
                  : undefined
          }
          submitLabel={t("save")}
          lockedSpouse={Boolean(lockedFatherSpouseId)}
          relationshipFields={
            addingFather ? (
              <StagedSpousesEditor
                value={stagedSpouses}
                onChange={setStagedSpouses}
                members={members}
              />
            ) : undefined
          }
          onCancel={() => {
            if (spouseTo)
              navigate({
                to: "/edit/$id",
                params: { id: spouseTo.id },
                search: { returnPreview },
              });
            else
              navigate({
                to: "/tree/$id",
                params: { id: treeId },
                search: { mode: "edit", preview: returnPreview },
              });
          }}
          onSubmit={(data, imageFile) => {
            const m =
              parentRole === "father"
                ? familyStore.addFatherWithSpouses(data, child?.id, stagedSpouses, imageFile)
                : child && parentRole === "mother"
                  ? familyStore.addMotherForChild(data, child.id, imageFile)
                  : familyStore.add(data, imageFile);
            toast.success(t("created"));
            if (spouseTo)
              navigate({
                to: "/edit/$id",
                params: { id: spouseTo.id },
                search: { returnPreview },
              });
            else
              navigate({
                to: "/member/$id",
                params: { id: m.id },
                search: memberDetailsSearch({
                  treeId,
                  returnMode: "edit",
                  returnPreview,
                }),
              });
          }}
        />
      </div>
    </div>
  );
}
