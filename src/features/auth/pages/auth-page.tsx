import { TreePine } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { useI18n } from "@/shared/i18n";
import { useAuthPage, type AuthPageSearch } from "../client/use-auth-page";
import { AuthCredentialsView } from "../components/auth-credentials-view";
import { AuthForgotView } from "../components/auth-forgot-view";
import { AuthVerificationView } from "../components/auth-verification-view";
import type { AuthView } from "../domain/auth-form";

type TranslationKey = Parameters<ReturnType<typeof useI18n>["t"]>[0];

function headerKeys(view: AuthView): { title: TranslationKey; description: TranslationKey } {
  if (view === "verify") return { title: "verify_email", description: "verification_sent" };
  if (view === "forgot-sent") return { title: "reset_password", description: "reset_email_sent" };
  if (view === "forgot")
    return { title: "reset_password", description: "forgot_password_description" };
  return { title: "auth_title", description: "auth_description" };
}

export function AuthPage({ search }: { search: AuthPageSearch }) {
  const { t } = useI18n();
  const controller = useAuthPage(search);
  const header = headerKeys(controller.view);
  const error = controller.errorKey ? t(controller.errorKey as TranslationKey) : null;
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-muted/25 px-4 py-10">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <TreePine className="h-6 w-6" />
          </div>
          <CardTitle>{t(header.title)}</CardTitle>
          <CardDescription>{t(header.description)}</CardDescription>
        </CardHeader>
        <CardContent>
          {controller.view === "verify" && (
            <AuthVerificationView controller={controller} error={error} />
          )}
          {(controller.view === "forgot" || controller.view === "forgot-sent") && (
            <AuthForgotView controller={controller} error={error} />
          )}
          {controller.view === "auth" && (
            <AuthCredentialsView
              controller={controller}
              redirect={search.redirect}
              invitationToken={search.invitationToken}
              error={error}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
