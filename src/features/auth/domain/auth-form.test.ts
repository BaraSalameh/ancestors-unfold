import { describe, expect, it } from "vitest";
import {
  authFormSchema,
  invitationRegistrationValues,
  normalizedRegistrationNames,
} from "./auth-form";

const registration = {
  mode: "register" as const,
  email: "person@example.test",
  password: "long-password",
  confirmPassword: "long-password",
  fullNameEn: "English Name",
  fullNameAr: "Arabic Name",
  gender: "male" as const,
};

function errorsFor(input: unknown) {
  const result = authFormSchema.safeParse(input);
  if (result.success) return {};
  return result.error.issues.reduce<Record<string, string>>((errors, issue) => {
    const field = String(issue.path[0]);
    errors[field] ??= issue.message;
    return errors;
  }, {});
}

describe("authentication form validation", () => {
  it("requires login email and password", () => {
    expect(errorsFor({ mode: "login", email: "", password: "" })).toEqual({
      email: "email_required",
      password: "password_required",
    });
  });

  it("rejects malformed login email", () => {
    expect(errorsFor({ mode: "login", email: "not-an-email", password: "secret" })).toEqual({
      email: "email_invalid",
      password: "password_too_short",
    });
  });

  it("rejects short login passwords and accepts 12 characters", () => {
    expect(errorsFor({ mode: "login", email: "a@example.test", password: "12345678901" })).toEqual({
      password: "password_too_short",
    });
    expect(
      authFormSchema.safeParse({
        mode: "login",
        email: "a@example.test",
        password: "123456789012",
      }).success,
    ).toBe(true);
  });

  it("reports every missing registration requirement", () => {
    expect(errorsFor({ mode: "register", email: "", password: "", confirmPassword: "" })).toEqual({
      email: "email_required",
      password: "password_required",
      fullNameEn: "full_name_required",
      gender: "gender_required",
      confirmPassword: "confirm_password_required",
    });
  });

  it("distinguishes short passwords from mismatched confirmation", () => {
    expect(
      errorsFor({ ...registration, password: "short", confirmPassword: "different" }),
    ).toMatchObject({
      password: "registration_password_too_short",
      confirmPassword: "passwords_do_not_match",
    });
  });

  it("accepts either or both full names and mirrors a missing name", () => {
    expect(authFormSchema.safeParse({ ...registration, fullNameAr: "" }).success).toBe(true);
    expect(authFormSchema.safeParse({ ...registration, fullNameEn: "" }).success).toBe(true);
    expect(authFormSchema.safeParse(registration).success).toBe(true);
    expect(normalizedRegistrationNames({ fullNameEn: " Name ", fullNameAr: "" })).toEqual({
      fullNameEn: "Name",
      fullNameAr: "Name",
    });
  });

  it("preserves registration mode when an invitation prefills the form", () => {
    expect(
      invitationRegistrationValues({
        invited_email: "invitee@example.test",
        invited_name_en: "Invited Person",
        invited_name_ar: "Invited Person",
        member_gender: "male",
      }),
    ).toMatchObject({ mode: "register", email: "invitee@example.test", gender: "male" });
  });
});
