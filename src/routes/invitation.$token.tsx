import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/invitation/$token")({
  head: () => ({ meta: [{ title: "Contributor invitation | Ancestors Unfold" }] }),
  component: InvitationPage,
});

function InvitationPage() {
  const { token } = Route.useParams();
  const { t } = useI18n();
  useEffect(() => {
    window.location.replace(
      `/auth?redirect=${encodeURIComponent("/")}&invitationToken=${encodeURIComponent(token)}`,
    );
  }, [token]);
  return <main className="mx-auto max-w-2xl p-8 text-center">{t("loading")}</main>;
}
