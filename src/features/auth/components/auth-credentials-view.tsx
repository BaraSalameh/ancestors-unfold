import { LockKeyhole, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { PasswordInput } from "@/shared/ui/password-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useI18n } from "@/shared/i18n";
import type { AuthPageController } from "../client/use-auth-page";
import { AuthField, GoogleMark } from "./auth-field";
import { AuthRegistrationFields, FormError } from "./auth-registration-fields";

function errorAttributes(message: string | undefined, id: string) {
  return message ? { "aria-invalid": true as const, "aria-describedby": id } : {};
}

function choose<T>(condition: boolean, whenTrue: T, whenFalse: T): T {
  return condition ? whenTrue : whenFalse;
}

export function AuthCredentialsView({
  controller,
  redirect,
  invitationToken,
  error,
}: {
  controller: AuthPageController;
  redirect: string;
  invitationToken?: string;
  error: string | null;
}) {
  const { t } = useI18n();
  const register = controller.mode === "register";
  const errors = controller.form.formState.errors;
  return (
    <Tabs value={controller.mode} onValueChange={controller.changeMode}>
      <TabsList
        className={`grid w-full ${choose(Boolean(invitationToken), "grid-cols-1", "grid-cols-2")}`}
      >
        {!invitationToken && <TabsTrigger value="login">{t("login")}</TabsTrigger>}
        <TabsTrigger value="register">{t("register")}</TabsTrigger>
      </TabsList>
      <TabsContent value={controller.mode} className="mt-6">
        {!invitationToken && (
          <Button
            type="button"
            variant="outline"
            className="mb-4 w-full"
            onClick={() =>
              window.location.assign(`/api/auth/google?redirect=${encodeURIComponent(redirect)}`)
            }
          >
            <GoogleMark />
            {t("continue_with_google")}
          </Button>
        )}
        {!invitationToken && (
          <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("or_continue_with")}
            <span className="h-px flex-1 bg-border" />
          </div>
        )}
        <form onSubmit={controller.submit} className="space-y-4" noValidate>
          {register && <AuthRegistrationFields controller={controller} />}
          <AuthField label={t("email")} htmlFor="auth-email" icon={<Mail />}>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              readOnly={Boolean(invitationToken)}
              aria-readonly={Boolean(invitationToken)}
              {...errorAttributes(errors.email?.message, "email-error")}
              {...controller.form.register("email")}
            />
          </AuthField>
          <FormError id="email-error" message={errors.email?.message} />
          <div>
            <div className="mb-2 flex justify-between">
              <Label htmlFor="auth-password">{t("password")}</Label>
              {!register && (
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => controller.setView("forgot")}
                >
                  {t("forgot_password")}
                </button>
              )}
            </div>
            <AuthField icon={<LockKeyhole />}>
              <PasswordInput
                id="auth-password"
                showLabel={t("show_password")}
                hideLabel={t("hide_password")}
                autoComplete={choose(register, "new-password", "current-password")}
                {...errorAttributes(errors.password?.message, "password-error")}
                {...controller.form.register("password")}
              />
            </AuthField>
            <FormError id="password-error" message={errors.password?.message} />
          </div>
          {register && (
            <>
              <Label htmlFor="confirm-password">{t("confirm_password")}</Label>
              <PasswordInput
                id="confirm-password"
                showLabel={t("show_password")}
                hideLabel={t("hide_password")}
                autoComplete="new-password"
                {...errorAttributes(errors.confirmPassword?.message, "confirm-password-error")}
                {...controller.form.register("confirmPassword")}
              />
              <FormError id="confirm-password-error" message={errors.confirmPassword?.message} />
            </>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            className="w-full"
            loading={controller.form.formState.isSubmitting}
            disabled={controller.form.formState.isSubmitting || controller.invitationLoading}
          >
            {choose(register, t("create_account"), t("login"))}
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}
