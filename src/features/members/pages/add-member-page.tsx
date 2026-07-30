import { useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { MemberForm } from "@/features/members";
import { familyStore, useFamily } from "@/features/trees";
import { useI18n } from "@/shared/i18n";
import { addMemberTitleKey } from "../domain/add-member-title";

export const addMemberSearchSchema = z
  .object({
    fatherId: z.string().optional(),
    motherId: z.string().optional(),
    childId: z.string().optional(),
    spouseId: z.string().optional(),
    parentRole: z.enum(["father", "mother"]).optional(),
    returnPreview: z.enum(["lineage", "chronological"]).optional(),
  })
  .strict();

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
  if (!familyStore.canEditActiveTree())
    return <div className="p-8 text-center text-muted-foreground">{t("not_found")}</div>;

  const initial = {
    father_id: fatherId,
    mother_id: motherId,
    spouse_id: spouseId,
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
          onSubmit={(data) => {
            const m =
              child && parentRole === "mother"
                ? familyStore.addMotherForChild(data, child.id)
                : familyStore.add(data);
            if (child && parentRole === "father") familyStore.update(child.id, { father_id: m.id });
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
                search: { returnPreview },
              });
          }}
        />
      </div>
    </div>
  );
}
