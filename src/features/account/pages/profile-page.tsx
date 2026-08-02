import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { EmailChangeCard } from "../components/email-change-card";
import { ProfileIdentityCard } from "../components/profile-identity-card";
import { TwoFactorCard } from "../components/two-factor-card";

export function ProfilePage() {
  const { t } = useI18n();
  const [role, setRole] = useState<"owner" | "contributor">();

  useEffect(() => {
    void fetch("/api/tree/current", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return;
        const current = (await response.json()) as { role: "owner" | "contributor" };
        setRole(current.role);
      })
      .catch(() => undefined);
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-7">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-4"
          onClick={() => window.history.back()}
        >
          <ArrowLeft className="h-4 w-4 ltr:mr-2 rtl:ml-2 rtl:rotate-180" />
          {t("back")}
        </Button>
        <h1 className="text-3xl font-bold">{t("profile_settings")}</h1>
        <p className="mt-2 text-muted-foreground">{t("profile_description")}</p>
      </div>
      <div className="space-y-6">
        <ProfileIdentityCard />
        {role === "owner" && <EmailChangeCard />}
        <TwoFactorCard />
      </div>
    </main>
  );
}
