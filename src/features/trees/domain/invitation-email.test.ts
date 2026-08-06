import { describe, expect, it } from "vitest";
import { invitationErrorKey, isValidInvitationEmail } from "./invitation-email";

describe("contributor invitation email", () => {
  it("validates email syntax before submission", () => {
    expect(isValidInvitationEmail("invitee@example.test")).toBe(true);
    expect(isValidInvitationEmail("not-an-email")).toBe(false);
  });

  it("maps invalid input responses to the email-specific message", () => {
    expect(invitationErrorKey("INVALID_INPUT")).toBe("invalid_email_address");
    expect(invitationErrorKey(undefined)).toBe("auth_error");
  });
});
