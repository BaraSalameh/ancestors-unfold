import { useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { useI18n } from "@/shared/i18n";
import { InvitationPageSkeleton } from "@/shared/ui/page-skeletons";

export function InvitationPage() {
  const { token } = useParams({ from: "/invitation/$token" });
  const { t } = useI18n();
  useEffect(() => {
    window.location.replace(
      `/auth?redirect=${encodeURIComponent("/")}&invitationToken=${encodeURIComponent(token)}`,
    );
  }, [token]);
  return <InvitationPageSkeleton label={t("loading")} />;
}
