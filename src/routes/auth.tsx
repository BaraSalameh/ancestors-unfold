import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { LoaderCircle, LockKeyhole, Mail, TreePine, UserRound } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { AuthError } from "@/lib/auth-service";
import { useI18n } from "@/lib/i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect:
      typeof s.redirect === "string" && s.redirect.startsWith("/") && !s.redirect.startsWith("//")
        ? s.redirect
        : "/",
  }),
  head: () => ({ meta: [{ title: "Sign in | Ancestors Unfold" }] }),
  component: AuthPage,
});
const schema = z.object({
  email: z.string().trim().min(1, "email_required").email("email_invalid"),
  password: z.string(),
  confirmPassword: z.string().optional(),
  fullNameEn: z.string().optional(),
  fullNameAr: z.string().optional(),
});
type Values = z.infer<typeof schema>;
type View = "auth" | "verify" | "forgot" | "forgot-sent";
type TranslationKey = Parameters<ReturnType<typeof useI18n>["t"]>[0];

function errorText(error: unknown, t: (key: TranslationKey) => string) {
  if (!(error instanceof AuthError)) return t("auth_error");
  const map: Record<string, string> = {
    EMAIL_EXISTS: "email_exists",
    INVALID_CREDENTIALS: "invalid_credentials",
    INVALID_INPUT: "invalid_auth_input",
    RATE_LIMITED: "auth_rate_limited",
    EMAIL_NOT_VERIFIED: "email_not_verified",
    INVALID_OR_EXPIRED_CODE: "invalid_or_expired_code",
    RESEND_TOO_SOON: "resend_too_soon",
    DELIVERY_FAILED: "delivery_failed",
    SERVICE_UNAVAILABLE: "auth_service_unavailable",
  };
  return t((map[error.code] ?? "auth_error") as TranslationKey);
}

function AuthPage() {
  const { t } = useI18n(),
    auth = useAuth(),
    navigate = useNavigate(),
    { redirect } = Route.useSearch();
  const [mode, setMode] = useState<"login" | "register">("login"),
    [view, setView] = useState<View>("auth"),
    [pendingEmail, setPendingEmail] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", confirmPassword: "", fullNameEn: "", fullNameAr: "" },
  });
  useEffect(() => {
    if (auth.isAuthenticated) window.location.assign(redirect);
  }, [auth.isAuthenticated, redirect]);
  const submit = form.handleSubmit(async (v) => {
    setError(null);
    if (!v.password) {
      form.setError("password", { message: "password_required" });
      return;
    }
    if (mode === "register") {
      if (!v.fullNameEn?.trim()) {
        form.setError("fullNameEn", { message: "full_name_en_required" });
        return;
      }
      if (!v.fullNameAr?.trim()) {
        form.setError("fullNameAr", { message: "full_name_ar_required" });
        return;
      }
      if (v.password.length < 12) {
        form.setError("password", { message: "registration_password_too_short" });
        return;
      }
      if (v.password !== v.confirmPassword) {
        form.setError("confirmPassword", { message: "passwords_do_not_match" });
        return;
      }
    }
    try {
      if (mode === "register") {
        const result = await auth.register({
          email: v.email,
          password: v.password,
          fullNameEn: v.fullNameEn!,
          fullNameAr: v.fullNameAr!,
        });
        setPendingEmail(result.email);
        setView("verify");
      } else await auth.login(v.email, v.password);
    } catch (e) {
      if (e instanceof AuthError && e.code === "EMAIL_NOT_VERIFIED") {
        setPendingEmail(v.email.trim().toLowerCase());
        setView("verify");
      }
      setError(errorText(e, t));
    }
  });
  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.confirmEmail(pendingEmail, code);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.resendEmailCode(pendingEmail);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };
  const forgot = form.handleSubmit(async (v) => {
    setBusy(true);
    setError(null);
    try {
      await auth.requestPasswordReset(v.email);
      setView("forgot-sent");
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  });
  const msg = (k?: string) => (k ? t(k as TranslationKey) : undefined);
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-muted/25 px-4 py-10">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <TreePine className="h-6 w-6" />
          </div>
          <CardTitle>
            {view === "verify"
              ? t("verify_email")
              : view.startsWith("forgot")
                ? t("reset_password")
                : t("auth_title")}
          </CardTitle>
          <CardDescription>
            {view === "verify"
              ? t("verification_sent")
              : view === "forgot-sent"
                ? t("reset_email_sent")
                : view === "forgot"
                  ? t("forgot_password_description")
                  : t("auth_description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {view === "verify" && (
            <div className="space-y-5">
              <p className="text-center text-sm font-medium" dir="ltr">
                {pendingEmail}
              </p>
              <div className="flex justify-center" dir="ltr">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={setCode}
                  inputMode="numeric"
                  pattern="[0-9]*"
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button className="w-full" disabled={busy || code.length !== 6} onClick={verify}>
                {busy && <LoaderCircle className="me-2 h-4 w-4 animate-spin" />}
                {t("confirm_code")}
              </Button>
              <Button variant="ghost" className="w-full" disabled={busy} onClick={resend}>
                {t("resend_code")}
              </Button>
              <Button
                variant="link"
                className="w-full"
                onClick={() => {
                  setView("auth");
                  setMode("login");
                  setError(null);
                }}
              >
                {t("back_to_login")}
              </Button>
            </div>
          )}
          {(view === "forgot" || view === "forgot-sent") && (
            <form className="space-y-4" onSubmit={forgot}>
              {view === "forgot" && (
                <>
                  <Label htmlFor="forgot-email">{t("email")}</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    {...form.register("email")}
                  />
                  {form.formState.errors.email && (
                    <p className="text-sm text-destructive">
                      {msg(form.formState.errors.email.message)}
                    </p>
                  )}
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <Button className="w-full" disabled={busy}>
                    {t("send_reset_link")}
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="link"
                className="w-full"
                onClick={() => setView("auth")}
              >
                {t("back_to_login")}
              </Button>
            </form>
          )}
          {view === "auth" && (
            <Tabs
              value={mode}
              onValueChange={(v) => {
                if (v === "login" || v === "register") setMode(v);
                setError(null);
                form.clearErrors();
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">{t("login")}</TabsTrigger>
                <TabsTrigger value="register">{t("register")}</TabsTrigger>
              </TabsList>
              <TabsContent value={mode} className="mt-6">
                <form onSubmit={submit} className="space-y-4" noValidate>
                  {mode === "register" && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t("full_name_en")} icon={<UserRound />}>
                        <Input dir="ltr" {...form.register("fullNameEn")} />
                      </Field>
                      <Field label={t("full_name_ar")} icon={<UserRound />}>
                        <Input dir="rtl" {...form.register("fullNameAr")} />
                      </Field>
                    </div>
                  )}
                  <Field label={t("email")} icon={<Mail />}>
                    <Input type="email" autoComplete="email" {...form.register("email")} />
                  </Field>
                  {form.formState.errors.email && (
                    <p className="text-sm text-destructive">
                      {msg(form.formState.errors.email.message)}
                    </p>
                  )}
                  <div>
                    <div className="mb-2 flex justify-between">
                      <Label>{t("password")}</Label>
                      {mode === "login" && (
                        <button
                          type="button"
                          className="text-sm text-primary hover:underline"
                          onClick={() => setView("forgot")}
                        >
                          {t("forgot_password")}
                        </button>
                      )}
                    </div>
                    <Field icon={<LockKeyhole />}>
                      <Input
                        type="password"
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        {...form.register("password")}
                      />
                    </Field>
                    {form.formState.errors.password && (
                      <p className="mt-2 text-sm text-destructive">
                        {msg(form.formState.errors.password.message)}
                      </p>
                    )}
                  </div>
                  {mode === "register" && (
                    <>
                      <Label>{t("confirm_password")}</Label>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        {...form.register("confirmPassword")}
                      />
                      {form.formState.errors.confirmPassword && (
                        <p className="text-sm text-destructive">
                          {msg(form.formState.errors.confirmPassword.message)}
                        </p>
                      )}
                    </>
                  )}
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <Button className="w-full" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting && (
                      <LoaderCircle className="me-2 h-4 w-4 animate-spin" />
                    )}
                    {mode === "login" ? t("login") : t("create_account")}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
function Field({
  label,
  icon,
  children,
}: {
  label?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <div className="relative">
        {icon && (
          <span className="absolute start-3 top-2.5 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-muted-foreground">
            {icon}
          </span>
        )}
        <div className={icon ? "[&>input]:ps-9" : ""}>{children}</div>
      </div>
    </div>
  );
}
