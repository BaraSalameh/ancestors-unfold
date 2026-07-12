import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile | Ancestors Unfold" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const { t } = useI18n();

  return <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
    <div className="mb-7"><h1 className="text-3xl font-bold tracking-tight">{t("profile_settings")}</h1><p className="mt-2 text-muted-foreground">{t("profile_description")}</p></div>
    <div className="space-y-6">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" />{t("account_information")}</CardTitle><CardDescription>{t("account_information_description")}</CardDescription></CardHeader><CardContent><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="profile-name-en">{t("full_name_en")}</Label><Input id="profile-name-en" dir="ltr" value={user?.fullNameEn ?? ""} readOnly aria-readonly="true" /></div><div className="space-y-2"><Label htmlFor="profile-name-ar">{t("full_name_ar")}</Label><Input id="profile-name-ar" dir="rtl" value={user?.fullNameAr ?? ""} readOnly aria-readonly="true" /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="profile-email">{t("email")}</Label><Input id="profile-email" value={user?.email ?? ""} readOnly aria-readonly="true" /></div></div></CardContent></Card>
      <Card><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />{t("two_factor_authentication")}</CardTitle><CardDescription className="mt-2 max-w-xl">{t("two_factor_description")}</CardDescription></div><Badge variant="secondary">{t("not_enabled")}</Badge></div></CardHeader><CardContent><div className="rounded-lg border bg-muted/40 p-4"><div className="flex gap-3"><KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div><p className="font-medium">{t("authenticator_app")}</p><p className="mt-1 text-sm text-muted-foreground">{t("authenticator_app_description")}</p></div></div></div><Button className="mt-4" onClick={() => toast.info(t("feature_requires_backend"))}>{t("enable_authenticator")}</Button></CardContent></Card>
    </div>
  </main>;
}
