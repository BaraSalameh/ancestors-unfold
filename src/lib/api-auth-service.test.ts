import { afterEach, describe, expect, it, vi } from "vitest";
import { apiAuthService } from "./api-auth-service";

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
});
