import { describe, expect, it, vi } from "vitest";
import { deleteContributorIdentity } from "./account-deletion";

describe("deleteContributorIdentity", () => {
  it("removes authentication, affiliations, and anonymizes the contributor", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    await deleteContributorIdentity({ query } as never, "contributor-id", "owner-id");

    const statements = query.mock.calls.map(([sql]) => String(sql)).join("\n");
    expect(statements).toContain("UPDATE app.family_members SET linked_user_id=NULL");
    expect(statements).toContain("UPDATE app.branch_grants SET revoked_at=now(),revoked_by=$2");
    expect(statements).toContain("UPDATE app.tree_memberships SET family_member_id=NULL");
    expect(statements).toContain("UPDATE app.sessions SET revoked_at=now()");
    expect(statements).toContain("DELETE FROM app.password_credentials");
    expect(statements).toContain("DELETE FROM app.oauth_accounts");
    expect(statements).toContain("DELETE FROM app.totp_credentials");
    expect(statements).toContain("email='deleted+'||id::text||'@invalid.local'");
    expect(statements).toContain("status='deleted',deleted_at=now()");
    expect(query.mock.calls.some(([, values]) => values?.[1] === "owner-id")).toBe(true);
  });
});
