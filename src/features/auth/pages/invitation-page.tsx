import { useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { useI18n } from "@/shared/i18n";

export function InvitationPage() {
  const { token } = useParams({ from: "/invitation/$token" });
  const { t } = useI18n();
  useEffect(() => {
    window.location.replace(
      `/auth?redirect=${encodeURIComponent("/")}&invitationToken=${encodeURIComponent(token)}`,
    );
  }, [token]);
  return <main className="mx-auto max-w-2xl p-8 text-center">{t("loading")}</main>;
}
