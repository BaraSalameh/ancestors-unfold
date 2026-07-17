import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { MemberForm } from "@/components/MemberForm";
import { familyStore, useFamily } from "@/lib/family-store";
import { useI18n } from "@/lib/i18n";

const searchSchema = z.object({
  parentId: z.string().optional(),
  childId: z.string().optional(),
  spouseId: z.string().optional(),
});

export const Route = createFileRoute("/add")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Add Member — Family Tree Hub" }] }),
  component: AddPage,
});

function AddPage() {
  const navigate = useNavigate();
  const members = useFamily();
  const { t } = useI18n();
  const { parentId, childId, spouseId } = useSearch({ from: "/add" });
  const treeId = familyStore.getActiveTreeId();

  // Pre-fill based on context
  const child = childId ? members.find((m) => m.id === childId) : undefined;
  const spouseTo = spouseId ? members.find((m) => m.id === spouseId) : undefined;

  const initial = {
    father_id:
      parentId && members.find((m) => m.id === parentId)?.gender === "male" ? parentId : undefined,
    mother_id:
      parentId && members.find((m) => m.id === parentId)?.gender === "female"
        ? parentId
        : undefined,
    spouse_id: spouseId,
    gender: spouseTo
      ? spouseTo.gender === "male"
        ? ("female" as const)
        : ("male" as const)
      : ("male" as const),
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-foreground">{t("add_member")}</h1>
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <MemberForm
          initial={initial}
          members={members}
          submitLabel={t("save")}
          onCancel={() =>
            navigate({ to: "/tree/$id", params: { id: treeId }, search: { mode: "edit" } })
          }
          onSubmit={(data) => {
            const m = familyStore.add(data);
            // If creating a parent for an existing child, attach the child
            if (child) {
              if (m.gender === "male") familyStore.update(child.id, { father_id: m.id });
              else familyStore.update(child.id, { mother_id: m.id });
            }
            toast.success(t("created"));
            navigate({ to: "/member/$id", params: { id: m.id } });
          }}
        />
      </div>
    </div>
  );
}
