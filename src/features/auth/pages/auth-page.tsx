/* eslint-disable max-lines -- Invitation registration shares the existing verification state machine. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const schema = z.object({
  email: z.string().trim().min(1, "email_required").email("email_invalid"),
  password: z.string(),
  confirmPassword: z.string().optional(),
  fullNameEn: z.string().optional(),
  fullNameAr: z.string().optional(),
  gender: z.enum(["male", "female"]).optional(),
});
type Values = z.infer<typeof schema>;
type View = "auth" | "verify" | "forgot" | "forgot-sent";
type TranslationKey = Parameters<ReturnType<typeof useI18n>["t"]>[0];
type InvitationPrefill = {
  invited_email: string;
  invited_name_en: string;
  invited_name_ar: string;
  member_gender: "male" | "female" | "unspecified";
};

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
    INVALID_INVITATION: "invalid_invitation",
    INVITEE_ALREADY_REGISTERED: "existing_user_invitation_error",
    SERVICE_UNAVAILABLE: "auth_service_unavailable",
  };
  return t((map[error.code] ?? "auth_error") as TranslationKey);
}

// Authentication views intentionally share form state while transitions remain contract-compatible.
// eslint-disable-next-line max-lines-per-function, complexity
export function AuthPage({
  search,
}: {
  search: { redirect: string; oauthError?: string; invitationToken?: string };
}) {
  const { t } = useI18n(),
    auth = useAuth(),
    navigate = useNavigate(),
    { redirect, oauthError, invitationToken } = search;
  const [mode, setMode] = useState<"login" | "register">(invitationToken ? "register" : "login"),
    [view, setView] = useState<View>("auth"),
    [pendingEmail, setPendingEmail] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [invitationLoading, setInvitationLoading] = useState(Boolean(invitationToken));
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      fullNameEn: "",
      fullNameAr: "",
      gender: undefined,
    },
  });
  useEffect(() => {
    if (auth.isAuthenticated) window.location.assign(redirect);
  }, [auth.isAuthenticated, redirect]);
  useEffect(() => {
    if (oauthError) setError(t("auth_error"));
  }, [oauthError, t]);
  useEffect(() => {
    if (!invitationToken) return;
    let active = true;
    void fetch(`/api/invitations/${encodeURIComponent(invitationToken)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("INVALID_INVITATION");
        return response.json() as Promise<InvitationPrefill>;
      })
      .then((invitation) => {
        if (!active) return;
        form.reset({
          email: invitation.invited_email,
          fullNameEn: invitation.invited_name_en,
          fullNameAr: invitation.invited_name_ar,
          gender: invitation.member_gender === "unspecified" ? undefined : invitation.member_gender,
          password: "",
          confirmPassword: "",
        });
      })
      .catch(() => {
        if (active) setError(t("invalid_invitation"));
      })
      .finally(() => {
        if (active) setInvitationLoading(false);
      });
    return () => {
      active = false;
    };
  }, [form, invitationToken, t]);
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
      if (!v.gender) {
        form.setError("gender", { message: "gender_required" });
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
          gender: v.gender!,
          invitationToken,
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
              <TabsList
                className={`grid w-full ${invitationToken ? "grid-cols-1" : "grid-cols-2"}`}
              >
                {!invitationToken && <TabsTrigger value="login">{t("login")}</TabsTrigger>}
                <TabsTrigger value="register">{t("register")}</TabsTrigger>
              </TabsList>
              <TabsContent value={mode} className="mt-6">
                {!invitationToken && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mb-4 w-full"
                    onClick={() =>
                      window.location.assign(
                        `/api/auth/google?redirect=${encodeURIComponent(redirect)}`,
                      )
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
                <form onSubmit={submit} className="space-y-4" noValidate>
                  {mode === "register" && (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t("full_name_en")} icon={<UserRound />}>
                          <Input dir="ltr" {...form.register("fullNameEn")} />
                        </Field>
                        <Field label={t("full_name_ar")} icon={<UserRound />}>
                          <Input dir="rtl" {...form.register("fullNameAr")} />
                        </Field>
                      </div>
                      <div>
                        <Label>{t("gender")}</Label>
                        <Select
                          value={form.watch("gender")}
                          onValueChange={(value) =>
                            form.setValue("gender", value as "male" | "female", {
                              shouldValidate: true,
                            })
                          }
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder={t("gender_required")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">{t("male")}</SelectItem>
                            <SelectItem value="female">{t("female")}</SelectItem>
                          </SelectContent>
                        </Select>
                        {form.formState.errors.gender && (
                          <p className="mt-2 text-sm text-destructive">
                            {msg(form.formState.errors.gender.message)}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                  <Field label={t("email")} icon={<Mail />}>
                    <Input
                      type="email"
                      autoComplete="email"
                      readOnly={Boolean(invitationToken)}
                      aria-readonly={Boolean(invitationToken)}
                      {...form.register("email")}
                    />
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
                  <Button
                    className="w-full"
                    disabled={form.formState.isSubmitting || invitationLoading}
                  >
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
function GoogleMark() {
  return (
    <svg className="me-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.7h3.5c2-1.9 3.2-4.6 3.2-7.7Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.9 0 5.3-1 7-2.6l-3.5-2.7c-1 .7-2.2 1-3.5 1a6.2 6.2 0 0 1-5.8-4.3H2.6v2.8A10 10 0 0 0 12 22Z"
      />
      <path fill="#FBBC05" d="M6.2 13.4a6 6 0 0 1 0-3.8V6.8H2.6a10 10 0 0 0 0 9.4l3.6-2.8Z" />
      <path
        fill="#EA4335"
        d="M12 6.2c1.6 0 3 .5 4.1 1.6l3.1-3A10 10 0 0 0 2.6 6.7l3.6 2.8A6.2 6.2 0 0 1 12 6.2Z"
      />
    </svg>
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
          <span className="absolute inset-s-3 top-2.5 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-muted-foreground">
            {icon}
          </span>
        )}
        <div className={icon ? "[&>input]:ps-9" : ""}>{children}</div>
      </div>
    </div>
  );
}
