import type { PoolClient } from "pg";
import type { AnalysisQueryDefinition, AnalysisScope, SavedAnalysisView } from "../domain/types";

export async function listSavedViews(client: PoolClient, scope: AnalysisScope, userId: string) {
  const result = await client.query<SavedAnalysisView>(
    `SELECT id,name,definition,created_at,updated_at FROM app.analysis_saved_views
     WHERE tree_id=$1 AND user_id=$2 ORDER BY updated_at DESC,id`,
    [scope.treeId, userId],
  );
  return result.rows;
}

export async function createSavedView(
  client: PoolClient,
  scope: AnalysisScope,
  userId: string,
  name: string,
  definition: AnalysisQueryDefinition,
) {
  const result = await client.query<SavedAnalysisView>(
    `INSERT INTO app.analysis_saved_views(tree_id,user_id,name,definition)
     VALUES($1,$2,$3,$4) RETURNING id,name,definition,created_at,updated_at`,
    [scope.treeId, userId, name, definition],
  );
  return result.rows[0];
}

export async function updateSavedView(
  client: PoolClient,
  scope: AnalysisScope,
  userId: string,
  viewId: string,
  patch: { name?: string; definition?: AnalysisQueryDefinition },
) {
  const result = await client.query<SavedAnalysisView>(
    `UPDATE app.analysis_saved_views SET name=coalesce($4,name),definition=coalesce($5,definition),updated_at=now()
     WHERE id=$3 AND tree_id=$1 AND user_id=$2 RETURNING id,name,definition,created_at,updated_at`,
    [scope.treeId, userId, viewId, patch.name ?? null, patch.definition ?? null],
  );
  return result.rows[0] ?? null;
}

export async function deleteSavedView(
  client: PoolClient,
  scope: AnalysisScope,
  userId: string,
  viewId: string,
) {
  return client.query(
    `DELETE FROM app.analysis_saved_views WHERE id=$3 AND tree_id=$1 AND user_id=$2`,
    [scope.treeId, userId, viewId],
  );
}
