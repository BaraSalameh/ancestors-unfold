import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, requireTreeOwner } = vi.hoisted(() => ({
  query: vi.fn(),
  requireTreeOwner: vi.fn(),
}));

vi.mock("@/shared/server/database", () => ({
  transaction: vi.fn(
    async (
      _userId: string,
      _sessionId: string,
      _requestId: string,
      callback: (client: { query: typeof query }) => Promise<unknown>,
    ) => callback({ query }),
  ),
}));

vi.mock("./authorization", () => ({ requireTreeOwner }));

import { handleCollaborationSearchRequest } from "./collaboration-search-handler";

const treeId = "10000000-0000-4000-8000-000000000001";
const session = { id: "session", user_id: "owner", email: "owner@example.com" };

describe("collaboration member search", () => {
  beforeEach(() => {
    query.mockReset();
    requireTreeOwner.mockReset();
  });

  it("returns paternal lineage and searches all four names plus birth year", async () => {
    const row = {
      id: "member",
      name_en: "Ahmad",
      name_ar: "أحمد",
      birth_year: 1984,
      father_id: "father",
      father_name_en: "Saleh",
      father_name_ar: "صالح",
      grandfather_id: "grandfather",
      grandfather_name_en: "Omar",
      grandfather_name_ar: "عمر",
      great_grandfather_id: "great-grandfather",
      great_grandfather_name_en: "Khalil",
      great_grandfather_name_ar: "خليل",
    };
    query.mockResolvedValue({ rows: [row] });
    const request = new Request(`http://localhost/api/trees/${treeId}/invitable-members?q=khalil`);

    const response = await handleCollaborationSearchRequest(
      request,
      new URL(request.url),
      session,
      "request-id",
    );

    expect(requireTreeOwner).toHaveBeenCalledWith(expect.anything(), treeId, session.user_id);
    expect(await response?.json()).toEqual([row]);
    expect(query.mock.calls[0][0]).toContain("great_grandfather.name_en");
    expect(query.mock.calls[0][0]).toContain("extract(year FROM m.birth_date)::text");
    expect(query.mock.calls[0][0]).toContain("linked_user_id IS NULL");
    expect(query.mock.calls[0][0]).toContain("i.status='pending'");
  });

  it("escapes SQL wildcard characters in the search pattern", async () => {
    query.mockResolvedValue({ rows: [] });
    const request = new Request(
      `http://localhost/api/trees/${treeId}/invitable-members?q=${encodeURIComponent("A%_B")}`,
    );

    await handleCollaborationSearchRequest(request, new URL(request.url), session, "request-id");

    expect(query.mock.calls[0][1]).toEqual([treeId, "%A\\%\\_B%"]);
  });
});
