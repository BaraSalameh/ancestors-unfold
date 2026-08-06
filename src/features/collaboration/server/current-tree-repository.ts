import { transaction } from "@/shared/server/database";

interface CurrentTreeSummary {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  description_en: string | null;
  description_ar: string | null;
  country_code: string | null;
  visibility: "private" | "public";
  role: "owner" | "contributor";
}

export function currentTreeForSession(
  session: { id: string | null; user_id: string },
  requestId: string,
) {
  return transaction(session.user_id, session.id, requestId, (client) =>
    client.query<
      CurrentTreeSummary & {
        created_at: string;
        version: number;
        affiliation_status: string;
        family_member_id: string | null;
        assigned_branch_id: string | null;
      }
    >(
      `SELECT t.id,t.name_en,t.name_ar,t.description_en,t.description_ar,
        t.country_code,t.visibility,t.created_at,t.version,
        CASE WHEN m.role='owner' THEN 'owner'
             WHEN g.id IS NOT NULL THEN 'contributor'
             ELSE m.role::text END role,
        m.affiliation_status,m.family_member_id,
        g.root_subfamily_id assigned_branch_id
      FROM app.tree_memberships m JOIN app.family_trees t ON t.id=m.tree_id
      LEFT JOIN app.branch_grants g ON g.user_id=m.user_id AND g.tree_id=m.tree_id
        AND g.role='branch_editor' AND g.revoked_at IS NULL
      WHERE m.user_id=$1 AND t.deleted_at IS NULL`,
      [session.user_id],
    ),
  );
}
