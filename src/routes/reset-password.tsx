import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AuthError } from "@/lib/auth-service";
import { useI18n } from "@/lib/i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : "",
  }),
  head: () => ({ meta: [{ title: "Reset password | Ancestors Unfold" }] }),
  component: ResetPasswordPage,
});
function ResetPasswordPage() {
  const { token } = Route.useSearch(),
    { t } = useI18n(),
    { confirmPasswordReset } = useAuth();
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError(t("registration_password_too_short"));
      return;
    }
    if (password !== confirm) {
      setError(t("passwords_do_not_match"));
      return;
    }
    if (!token) {
      setError(t("invalid_or_expired_link"));
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
    } catch (e) {
      setError(
        e instanceof AuthError && e.code === "INVALID_OR_EXPIRED_TOKEN"
          ? t("invalid_or_expired_link")
          : t("auth_error"),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-muted/25 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("reset_password")}</CardTitle>
          <CardDescription>
            {done ? t("password_reset_success") : t("choose_new_password")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <Button asChild className="w-full">
              <Link to="/auth" search={{ redirect: "/" }}>
                {t("back_to_login")}
              </Link>
            </Button>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="new-password">{t("password")}</Label>
                <div className="relative mt-2">
                  <LockKeyhole className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="new-password"
                    className="ps-9"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="confirm-new-password">{t("confirm_password")}</Label>
                <Input
                  id="confirm-new-password"
                  className="mt-2"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button className="w-full" disabled={busy}>
                {busy && <LoaderCircle className="me-2 h-4 w-4 animate-spin" />}
                {t("reset_password")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
