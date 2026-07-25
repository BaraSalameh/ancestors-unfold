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
  })
  .strict();

export function AddPage() {
  const { fatherId, motherId, childId, spouseId, parentRole } = useSearch({ from: "/add" });
  const treeId = familyStore.getActiveTreeId();
  return (
    <AddMemberPage
      treeId={treeId}
      fatherId={fatherId}
      motherId={motherId}
      childId={childId}
      spouseId={spouseId}
      parentRole={parentRole}
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
}: {
  treeId: string;
  fatherId?: string;
  motherId?: string;
  childId?: string;
  spouseId?: string;
  parentRole?: "father" | "mother";
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
            parentRole === "father" ? "male" : parentRole === "mother" ? "female" : undefined
          }
          submitLabel={t("save")}
          onCancel={() =>
            navigate({ to: "/tree/$id", params: { id: treeId }, search: { mode: "edit" } })
          }
          onSubmit={async (data) => {
            const m = familyStore.add(data);
            // If creating a parent for an existing child, attach the child
            if (child) {
              if (parentRole === "father") familyStore.update(child.id, { father_id: m.id });
              else if (parentRole === "mother") familyStore.update(child.id, { mother_id: m.id });
            }
            try {
              await familyStore.flushPendingSave();
              toast.success(t("created"));
              navigate({ to: "/member/$id", params: { id: m.id } });
            } catch {
              toast.error(t("save_failed"));
            }
          }}
        />
      </div>
    </div>
  );
}
