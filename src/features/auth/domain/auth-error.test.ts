import { describe, expect, it } from "vitest";
import { authErrorKey } from "./auth-error";
import { AuthError } from "./auth-service";

describe("authentication error messages", () => {
  it("maps an invalid contributor invitation to its specific message", () => {
    expect(authErrorKey(new AuthError("INVALID_INVITATION"))).toBe("invalid_invitation");
  });
});
