import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "../components/auth-context";
import { authErrorKey } from "../domain/auth-error";
import { AuthError } from "../domain/auth-service";
import {
  authFormSchema,
  normalizedRegistrationNames,
  type AuthBusyAction,
  type AuthFormValues,
  type AuthMode,
  type AuthView,
} from "../domain/auth-form";
import { useAuthInvitation } from "./use-auth-invitation";

export interface AuthPageSearch {
  redirect: string;
  oauthError?: string;
  invitationToken?: string;
}

export function useAuthPage(search: AuthPageSearch) {
  const auth = useAuth();
  const [mode, setMode] = useState<AuthMode>(search.invitationToken ? "register" : "login");
  const [view, setView] = useState<AuthView>("auth");
  const [pendingEmail, setPendingEmail] = useState("");
  const [code, setCode] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(search.oauthError ? "auth_error" : null);
  const [busyAction, setBusyAction] = useState<AuthBusyAction>();
  const [invitationLoading, setInvitationLoading] = useState(Boolean(search.invitationToken));
  const form = useForm<AuthFormValues>({
    resolver: zodResolver(authFormSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: {
      mode,
      email: "",
      password: "",
      confirmPassword: "",
      fullNameEn: "",
      fullNameAr: "",
      gender: undefined,
    },
  });
  useEffect(() => {
    if (auth.isAuthenticated) window.location.assign(search.redirect);
  }, [auth.isAuthenticated, search.redirect]);
  useEffect(() => {
    if (search.oauthError) setErrorKey("auth_error");
  }, [search.oauthError]);
  const invalidInvitation = useCallback(() => setErrorKey("invalid_invitation"), []);
  const invitationLoaded = useCallback(() => setInvitationLoading(false), []);
  useAuthInvitation(search.invitationToken, form, invalidInvitation, invitationLoaded);

  const submit = form.handleSubmit(async (values) => {
    setErrorKey(null);
    try {
      if (mode === "register") {
        const names = normalizedRegistrationNames(values);
        const result = await auth.register({
          email: values.email,
          password: values.password,
          ...names,
          gender: values.gender!,
          invitationToken: search.invitationToken,
        });
        setPendingEmail(result.email);
        setView("verify");
      } else await auth.login(values.email, values.password);
    } catch (error) {
      if (error instanceof AuthError && error.code === "EMAIL_NOT_VERIFIED") {
        setPendingEmail(values.email.trim().toLowerCase());
        setView("verify");
      }
      setErrorKey(authErrorKey(error));
    }
  });
  const runBusy = async (action: AuthBusyAction, operation: () => Promise<void>) => {
    if (busyAction) return;
    setBusyAction(action);
    setErrorKey(null);
    try {
      await operation();
    } catch (error) {
      setErrorKey(authErrorKey(error));
    } finally {
      setBusyAction(undefined);
    }
  };
  const verify = () => runBusy("verify", () => auth.confirmEmail(pendingEmail, code));
  const resend = () => runBusy("resend", () => auth.resendEmailCode(pendingEmail));
  const forgot = form.handleSubmit((values) =>
    runBusy("forgot", async () => {
      await auth.requestPasswordReset(values.email);
      setView("forgot-sent");
    }),
  );
  const changeMode = (value: string) => {
    if (value === "login" || value === "register") {
      setMode(value);
      form.setValue("mode", value);
    }
    setErrorKey(null);
    form.clearErrors();
  };
  const backToLogin = () => {
    setView("auth");
    setMode("login");
    setErrorKey(null);
  };
  return {
    form,
    mode,
    view,
    setView,
    pendingEmail,
    code,
    setCode,
    errorKey,
    busyAction,
    invitationLoading,
    submit,
    verify,
    resend,
    forgot,
    changeMode,
    backToLogin,
  };
}

export type AuthPageController = ReturnType<typeof useAuthPage>;
