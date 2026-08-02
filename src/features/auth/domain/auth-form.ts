import { z } from "zod";

export const authFormSchema = z
  .object({
    mode: z.enum(["login", "register"]),
    email: z
      .string()
      .trim()
      .min(1, "email_required")
      .max(320, "email_invalid")
      .email("email_invalid"),
    password: z.string().max(256, "invalid_auth_input"),
    confirmPassword: z.string().max(256, "invalid_auth_input").optional(),
    fullNameEn: z.string().trim().max(200, "invalid_auth_input").optional(),
    fullNameAr: z.string().trim().max(200, "invalid_auth_input").optional(),
    gender: z.enum(["male", "female"]).optional(),
  })
  .superRefine((values, context) => {
    if (!values.password) {
      context.addIssue({ code: "custom", path: ["password"], message: "password_required" });
    } else if (values.password.length < 12) {
      context.addIssue({
        code: "custom",
        path: ["password"],
        message:
          values.mode === "register" ? "registration_password_too_short" : "password_too_short",
      });
    }
    if (values.mode !== "register") return;
    if (!values.fullNameEn && !values.fullNameAr)
      context.addIssue({ code: "custom", path: ["fullNameEn"], message: "full_name_required" });
    if (!values.gender)
      context.addIssue({ code: "custom", path: ["gender"], message: "gender_required" });
    if (!values.confirmPassword)
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "confirm_password_required",
      });
    else if (values.password !== values.confirmPassword)
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "passwords_do_not_match",
      });
  });

export type AuthFormValues = z.infer<typeof authFormSchema>;
export type AuthMode = "login" | "register";
export type AuthView = "auth" | "verify" | "forgot" | "forgot-sent";
export type AuthBusyAction = "verify" | "resend" | "forgot";

export interface InvitationPrefill {
  invited_email: string;
  invited_name_en: string;
  invited_name_ar: string;
  member_gender: "male" | "female" | "unspecified";
}

export function invitationRegistrationValues(invitation: InvitationPrefill): AuthFormValues {
  return {
    mode: "register",
    email: invitation.invited_email,
    fullNameEn: invitation.invited_name_en,
    fullNameAr: invitation.invited_name_ar,
    gender: invitation.member_gender === "unspecified" ? undefined : invitation.member_gender,
    password: "",
    confirmPassword: "",
  };
}

export function normalizedRegistrationNames(
  values: Pick<AuthFormValues, "fullNameEn" | "fullNameAr">,
) {
  const fullNameEn = values.fullNameEn?.trim() ?? "";
  const fullNameAr = values.fullNameAr?.trim() ?? "";
  return { fullNameEn: fullNameEn || fullNameAr, fullNameAr: fullNameAr || fullNameEn };
}
