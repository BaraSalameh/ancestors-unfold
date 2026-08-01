import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

export function TwoFactorCard() {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {t("two_factor_authentication")}
            </CardTitle>
            <CardDescription className="mt-2">{t("two_factor_description")}</CardDescription>
          </div>
          <Badge variant="secondary">{t("not_enabled")}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="flex gap-3">
            <KeyRound className="h-5 w-5" />
            <p>{t("authenticator_app_description")}</p>
          </div>
        </div>
        <Button className="mt-4" onClick={() => toast.info(t("feature_requires_backend"))}>
          {t("enable_authenticator")}
        </Button>
      </CardContent>
    </Card>
  );
}
