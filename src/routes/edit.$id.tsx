import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { MemberForm } from "@/components/MemberForm";
import { familyStore, useFamily } from "@/lib/family-store";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/edit/$id")({
  head: () => ({ meta: [{ title: "Edit Member — Family Tree Hub" }] }),
  component: EditPage,
});

function EditPage() {
  const { id } = useParams({ from: "/edit/$id" });
  const navigate = useNavigate();
  const members = useFamily();
  const { t } = useI18n();
  const member = members.find((m) => m.id === id);

  if (!member) {
    return <div className="p-8 text-center text-muted-foreground">{t("not_found")}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-foreground">{t("edit_member")}</h1>
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <MemberForm
          initial={member}
          memberId={id}
          members={members.filter((m) => m.id !== id)}
          submitLabel={t("save")}
          onCancel={() => navigate({ to: "/member/$id", params: { id } })}
          onSubmit={(data) => {
            familyStore.update(id, data);
            toast.success(t("updated"));
            navigate({ to: "/member/$id", params: { id } });
          }}
        />
      </div>
    </div>
  );
}
