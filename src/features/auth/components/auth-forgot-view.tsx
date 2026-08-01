import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useI18n } from "@/shared/i18n";
import type { AuthPageController } from "../client/use-auth-page";

type TranslationKey = Parameters<ReturnType<typeof useI18n>["t"]>[0];

export function AuthForgotView({
  controller,
  error,
}: {
  controller: AuthPageController;
  error: string | null;
}) {
  const { t } = useI18n();
  const emailError = controller.form.formState.errors.email?.message;
  return (
    <form className="space-y-4" onSubmit={controller.forgot}>
      {controller.view === "forgot" && (
        <>
          <Label htmlFor="forgot-email">{t("email")}</Label>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            {...controller.form.register("email")}
          />
          {emailError && (
            <p className="text-sm text-destructive">{t(emailError as TranslationKey)}</p>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            className="w-full"
            loading={controller.busyAction === "forgot"}
            disabled={Boolean(controller.busyAction)}
          >
            {t("send_reset_link")}
          </Button>
        </>
      )}
      <Button
        type="button"
        variant="link"
        className="w-full"
        onClick={() => controller.setView("auth")}
      >
        {t("back_to_login")}
      </Button>
    </form>
  );
}
