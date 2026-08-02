import { describe, expect, it } from "vitest";
import { ApiError } from "../security";
import { apiErrorResponse } from "./api-error-response";

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("API error responses", () => {
  it("preserves explicit API error status and request id", async () => {
    const response = apiErrorResponse(new ApiError("FORBIDDEN_ACTION", 403), "/api/x", "req");
    expect(response.status).toBe(403);
    expect(await body(response)).toEqual({ code: "FORBIDDEN_ACTION", requestId: "req" });
  });

  it.each([
    ["users_email_uq", "EMAIL_EXISTS"],
    ["branch_grants_one_active_editor_per_branch_uq", "BRANCH_ALREADY_ASSIGNED"],
    ["tree_memberships_one_tree_per_user_uq", "ONE_TREE_ACCOUNT"],
  ])("maps the %s unique constraint", async (constraint, code) => {
    const response = apiErrorResponse({ code: "23505", constraint }, "/api/x", "req");
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ code });
  });

  it("preserves the OAuth callback redirect contract", () => {
    const response = apiErrorResponse(new Error("failed"), "/api/auth/google/callback", "req");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/auth?oauth_error=failed");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
