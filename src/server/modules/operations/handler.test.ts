import { describe, expect, it } from "vitest";
import { handleOperationsRequest } from "./handler";

describe("operations HTTP handler", () => {
  it("preserves the health response contract", async () => {
    const response = await handleOperationsRequest(new Request("http://localhost/api/health"));
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ status: "ok" });
  });

  it("declines unrelated routes", async () => {
    expect(
      await handleOperationsRequest(new Request("http://localhost/api/other")),
    ).toBeUndefined();
  });
});
