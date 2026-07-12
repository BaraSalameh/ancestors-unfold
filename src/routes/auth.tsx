import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { LoaderCircle, LockKeyhole, Mail, TreePine, UserRound } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { AuthError } from "@/lib/auth-service";
import { useI18n } from "@/lib/i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" && search.redirect.startsWith("/") && !search.redirect.startsWith("//") ? search.redirect : "/",
  }),
  head: () => ({ meta: [{ title: "Sign in | Ancestors Unfold" }] }),
  component: AuthPage,
});

const schema = z.object({ email: z.string().trim().min(1, "email_required").email("email_invalid"), password: z.string().min(1, "password_required").min(8, "password_too_short"), confirmPassword: z.string().optional(), fullNameEn: z.string().optional(), fullNameAr: z.string().optional() });
type FormValues = z.infer<typeof schema>;

function AuthPage() {
  const { t } = useI18n();
  const { login, register, isAuthenticated } = useAuth();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "", confirmPassword: "", fullNameEn: "", fullNameAr: "" } });

  useEffect(() => {
    if (isAuthenticated) void navigate({ to: "/", replace: true });
  }, [isAuthenticated, navigate]);

  const submit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    if (mode === "register" && !values.fullNameEn?.trim()) {
      form.setError("fullNameEn", { message: "full_name_en_required" });
      return;
    }
    if (mode === "register" && !values.fullNameAr?.trim()) {
      form.setError("fullNameAr", { message: "full_name_ar_required" });
      return;
    }
    if (mode === "register" && !values.confirmPassword) {
      form.setError("confirmPassword", { message: "confirm_password_required" });
      return;
    }
    if (mode === "register" && values.password !== values.confirmPassword) {
      form.setError("confirmPassword", { message: "passwords_do_not_match" });
      return;
    }
    try {
      if (mode === "register") await register({ email: values.email, password: values.password, fullNameEn: values.fullNameEn!, fullNameAr: values.fullNameAr! });
      else await login(values.email, values.password);
      window.location.assign(redirect);
    } catch (error) {
      if (error instanceof AuthError && error.code === "EMAIL_EXISTS") setSubmitError(t("email_exists"));
      else if (error instanceof AuthError && error.code === "INVALID_CREDENTIALS") setSubmitError(t("invalid_credentials"));
      else setSubmitError(t("auth_error"));
    }
  });

  const message = (key?: string) => key ? t(key as Parameters<typeof t>[0]) : undefined;
  return <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-muted/25 px-4 py-10">
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><TreePine className="h-6 w-6" /></div>
        <CardTitle className="text-2xl">{t("auth_title")}</CardTitle>
        <CardDescription>{t("auth_description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={mode} onValueChange={(value) => { setMode(value as typeof mode); setSubmitError(null); form.clearErrors(); }}>
          <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="login">{t("login")}</TabsTrigger><TabsTrigger value="register">{t("register")}</TabsTrigger></TabsList>
          <TabsContent value={mode} className="mt-6">
            <form onSubmit={submit} className="space-y-4" noValidate>
              {mode === "register" && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="full-name-en">{t("full_name_en")}</Label><div className="relative"><UserRound className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="full-name-en" dir="ltr" placeholder={t("full_name_en_placeholder")} autoComplete="name" className="ps-9" aria-invalid={!!form.formState.errors.fullNameEn} aria-describedby={form.formState.errors.fullNameEn ? "full-name-en-error" : undefined} {...form.register("fullNameEn")} /></div>{form.formState.errors.fullNameEn && <p id="full-name-en-error" role="alert" className="text-sm text-destructive">{message(form.formState.errors.fullNameEn.message)}</p>}</div><div className="space-y-2"><Label htmlFor="full-name-ar">{t("full_name_ar")}</Label><div className="relative"><UserRound className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="full-name-ar" dir="rtl" placeholder={t("full_name_ar_placeholder")} autoComplete="off" className="ps-9" aria-invalid={!!form.formState.errors.fullNameAr} aria-describedby={form.formState.errors.fullNameAr ? "full-name-ar-error" : undefined} {...form.register("fullNameAr")} /></div>{form.formState.errors.fullNameAr && <p id="full-name-ar-error" role="alert" className="text-sm text-destructive">{message(form.formState.errors.fullNameAr.message)}</p>}</div></div>}
              <div className="space-y-2"><Label htmlFor="email">{t("email")}</Label><div className="relative"><Mail className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="email" type="email" placeholder={t("email_placeholder")} autoComplete="email" className="ps-9" aria-invalid={!!form.formState.errors.email} aria-describedby={form.formState.errors.email ? "email-error" : undefined} {...form.register("email")} /></div>{form.formState.errors.email && <p id="email-error" role="alert" className="text-sm text-destructive">{message(form.formState.errors.email.message)}</p>}</div>
              <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="password">{t("password")}</Label>{mode === "login" && <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => toast.info(t("feature_requires_backend"))}>{t("forgot_password")}</button>}</div><div className="relative"><LockKeyhole className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="password" type="password" placeholder={t("password_placeholder")} autoComplete={mode === "login" ? "current-password" : "new-password"} className="ps-9" aria-invalid={!!form.formState.errors.password} aria-describedby={form.formState.errors.password ? "password-error" : undefined} {...form.register("password")} /></div>{form.formState.errors.password && <p id="password-error" role="alert" className="text-sm text-destructive">{message(form.formState.errors.password.message)}</p>}</div>
              {mode === "register" && <div className="space-y-2"><Label htmlFor="confirm-password">{t("confirm_password")}</Label><div className="relative"><LockKeyhole className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="confirm-password" type="password" placeholder={t("confirm_password_placeholder")} autoComplete="new-password" className="ps-9" aria-invalid={!!form.formState.errors.confirmPassword} aria-describedby={form.formState.errors.confirmPassword ? "confirm-password-error" : undefined} {...form.register("confirmPassword")} /></div>{form.formState.errors.confirmPassword && <p id="confirm-password-error" role="alert" className="text-sm text-destructive">{message(form.formState.errors.confirmPassword.message)}</p>}</div>}
              {submitError && <Alert variant="destructive"><AlertDescription role="alert">{submitError}</AlertDescription></Alert>}
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting && <LoaderCircle className="me-2 h-4 w-4 animate-spin" />}{mode === "login" ? t("login") : t("create_account")}</Button>
              <div className="relative py-1"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">{t("or_continue_with")}</span></div></div>
              <Button type="button" variant="outline" className="w-full" onClick={() => toast.info(t("feature_requires_backend"))}><GoogleIcon />{t("continue_with_google")}</Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  </main>;
}

function GoogleIcon() {
  return <svg viewBox="0 0 24 24" className="me-2 h-4 w-4" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.4 2.9-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9.1L6.5 14Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.8A9.7 9.7 0 0 0 3.1 7.5l3.4 2.6A5.9 5.9 0 0 1 12 6Z"/></svg>;
}
