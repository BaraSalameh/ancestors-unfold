import { afterEach, describe, expect, it, vi } from "vitest";
import { apiAuthService } from "./auth-api-client";

afterEach(() => vi.unstubAllGlobals());

describe("API authentication adapter", () => {
  it("preserves known server error codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: "INVALID_CREDENTIALS" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(apiAuthService.login("person@example.com", "wrong")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  it("maps service failures without exposing response details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: "DATABASE_NOT_CONFIGURED" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(apiAuthService.getSession()).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("preserves the contributor email-change prohibition", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: "CONTRIBUTOR_EMAIL_CHANGE_FORBIDDEN" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(
      apiAuthService.requestEmailChange("new@example.com", "password"),
    ).rejects.toMatchObject({
      code: "CONTRIBUTOR_EMAIL_CHANGE_FORBIDDEN",
    });
  });

  it("sends both destructive confirmation and email code for account deletion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await apiAuthService.deleteContributorAccount("DELETE", "012345");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ confirmation: "DELETE", code: "012345" }),
      }),
    );
  });
});
