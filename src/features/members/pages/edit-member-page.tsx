import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { familyStore, useFamily } from "@/features/trees";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { MemberDeletionDialog } from "../components/member-deletion-dialog";
import { memberDeletionPlan } from "../domain/member-deletion";
import { memberDeleteDestination, memberDetailsSearch } from "../domain/member-navigation";
import { MemberForm } from "../ui/member-form";

export function EditPage() {
  const { id } = useParams({ from: "/edit/$id" });
  const { returnPreview } = useSearch({ from: "/edit/$id" });
  const navigate = useNavigate();
  const members = useFamily();
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const member = members.find((m) => m.id === id);
  const treeId = familyStore.getActiveTreeId();
  const checkpoint = useRef<ReturnType<typeof familyStore.createDraftCheckpoint> | null>(null);
  if (member && familyStore.canEditActiveTree() && !checkpoint.current)
    checkpoint.current = familyStore.createDraftCheckpoint();

  if (!member || !familyStore.canEditActiveTree()) {
    return <div className="p-8 text-center text-muted-foreground">{t("not_found")}</div>;
  }
  const children = members.filter((candidate) =>
    [candidate.father_id, candidate.mother_id].includes(member.id),
  );
  const deletionPlan = memberDeletionPlan([member.id], members, (memberId) =>
    Boolean(familyStore.protectedImportGender(memberId)),
  );
  const wives = deletionPlan.wifeIds.flatMap((wifeId) => {
    const wife = members.find((candidate) => candidate.id === wifeId);
    return wife ? [wife] : [];
  });

  const handleDelete = (includeWives: boolean) => {
    const ids = includeWives ? [...deletionPlan.selectedIds, ...deletionPlan.wifeIds] : [member.id];
    const result = familyStore.removeMany(ids);
    if (result.removed)
      toast.success(
        result.removed === 1 ? t("deleted") : t("members_deleted", { count: result.removed }),
      );
    if (result.blockedBranchRoots) toast.error(t("branch_root_delete_blocked"));
    if (result.skipped) toast.warning(t("members_delete_skipped", { count: result.skipped }));
    if (!familyStore.get(member.id)) navigate(memberDeleteDestination(treeId, returnPreview));
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">{t("edit_member")}</h1>
        <Button
          type="button"
          variant="destructive"
          disabled={Boolean(familyStore.protectedImportGender(id))}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="me-2 h-4 w-4" />
          {t("delete")}
        </Button>
      </div>
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <MemberForm
          initial={member}
          initialImageFile={familyStore.getStagedMemberImage(id)}
          memberId={id}
          members={members}
          lockedGender={familyStore.protectedImportGender(id)}
          submitLabel={t("save")}
          cancelLabel={t("back")}
          onCancel={() => {
            if (checkpoint.current) familyStore.restoreDraftCheckpoint(checkpoint.current);
            navigate({
              to: "/tree/$id",
              params: { id: treeId },
              search: { mode: "edit", preview: returnPreview },
            });
          }}
          onSubmit={(data, imageFile) => {
            familyStore.update(id, data, imageFile ?? null);
            toast.success(t("updated"));
            navigate({
              to: "/member/$id",
              params: { id },
              search: memberDetailsSearch({
                treeId,
                returnMode: "edit",
                returnPreview,
              }),
            });
          }}
        />
      </div>
      <MemberDeletionDialog
        open={confirmOpen}
        selected={[member]}
        wives={wives}
        hasChildren={children.length > 0}
        onOpenChange={setConfirmOpen}
        onConfirm={handleDelete}
      />
    </div>
  );
}
