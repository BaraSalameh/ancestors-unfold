import { randomUUID } from "node:crypto";
import { transaction } from "@/shared/server/database";
import type { SnapshotInput } from "@/server/security";
import type { SessionContext } from "./snapshot-reader";
import {
  authorizeSnapshotWrite,
  completedSnapshotWrite,
  lockSnapshotVersion,
} from "./snapshot-write-preparation";
import { validateSnapshotImages } from "./snapshot-image-validation";
import { validateBranchEditorRoot, validateSnapshotBranchRoots } from "./snapshot-graph-validation";
import { enforceBranchSnapshotScope } from "./snapshot-branch-scope";
import { writeSnapshotMembers } from "./snapshot-member-writer";
import { writeSnapshotRelationships } from "./snapshot-relationship-writer";
import {
  requireFamilyCsvImportManager,
  validateProtectedFamilyCsvImport,
  validateSourceMappings,
} from "./family-csv-import-protection";

type SnapshotImportOptions = {
  familyCsv?: {
    sourceMemberIds: ReadonlyMap<string, string>;
    sourceBranchIds: ReadonlyMap<string, string>;
  };
};

// Snapshot replacement is deliberately one serialized transaction to preserve version and RLS semantics.
// This coordinator keeps the serialized snapshot transaction visible as one auditable unit.
// eslint-disable-next-line max-lines-per-function
export async function importSnapshot(
  s: SessionContext,
  rid: string,
  treeId: string,
  b: SnapshotInput,
  options: SnapshotImportOptions = {},
) {
  // Keeping the complete reconciliation in this callback guarantees rollback on any failed entity write.
  // The transaction callback explicitly coordinates authorization, mapping, writes, and history.
  // eslint-disable-next-line complexity
  return transaction(s.user_id, s.id, rid, async (c) => {
    const { isBranchEditor, branchRootId } = await authorizeSnapshotWrite(c, treeId, s.user_id);
    validateSnapshotBranchRoots(b);
    if (isBranchEditor) await validateBranchEditorRoot(c, treeId, branchRootId, b);
    if (options.familyCsv) {
      await requireFamilyCsvImportManager(c, treeId, s.user_id);
      validateSourceMappings(
        b,
        options.familyCsv.sourceMemberIds,
        options.familyCsv.sourceBranchIds,
      );
      await validateProtectedFamilyCsvImport(c, treeId, b);
    }
    const batch = b.batchId || randomUUID();
    const completed = await completedSnapshotWrite(c, treeId, batch);
    if (completed) return completed;
    await c.query("SELECT set_config('app.correlation_id',$1,true)", [batch]);
    const allowedMembers = new Set<string>();
    if (isBranchEditor) {
      const members = await c.query<{ id: string }>(
        "SELECT member_id id FROM app.branch_members($1,$2)",
        [treeId, s.user_id],
      );
      members.rows.forEach(({ id }) => allowedMembers.add(id));
    }
    const expectedVersion = await lockSnapshotVersion(c, treeId, Number(b.expectedVersion));
    const existingMembers = isBranchEditor
      ? await c.query<{ id: string }>(
          "SELECT id FROM app.family_members WHERE tree_id=$1 AND deleted_at IS NULL",
          [treeId],
        )
      : null;
    const existingMemberIds = new Set(existingMembers?.rows.map(({ id }) => id) ?? []);
    const mutableMembers = new Set(allowedMembers);
    if (isBranchEditor) {
      const ownedDrafts = await c.query<{ id: string }>(
        `SELECT id FROM app.family_members
         WHERE tree_id=$1 AND created_by=$2 AND deleted_at IS NULL
           AND app.is_unattached_member(tree_id,id)`,
        [treeId, s.user_id],
      );
      ownedDrafts.rows.forEach(({ id }) => mutableMembers.add(id));
    }
    const editablePayloadMembers = isBranchEditor
      ? (b.members ?? []).filter(
          (member) => mutableMembers.has(member.id) || !existingMemberIds.has(member.id),
        )
      : (b.members ?? []);
    await validateSnapshotImages(c, treeId, editablePayloadMembers);
    const editableIds = new Set(editablePayloadMembers.map(({ id }) => id));
    if (isBranchEditor)
      await enforceBranchSnapshotScope(
        c,
        treeId,
        s.user_id,
        b.members ?? [],
        editablePayloadMembers,
        existingMemberIds,
        mutableMembers,
      );
    const { memberIds: map, subfamilyIds: sfMap } = await writeSnapshotMembers(
      c,
      treeId,
      s.user_id,
      batch,
      b,
      editablePayloadMembers,
      isBranchEditor,
      branchRootId,
      existingMemberIds,
      allowedMembers,
      editableIds,
      options.familyCsv?.sourceMemberIds,
      options.familyCsv?.sourceBranchIds,
    );
    await writeSnapshotRelationships(
      c,
      treeId,
      s.user_id,
      b,
      editablePayloadMembers,
      isBranchEditor,
      mutableMembers,
      editableIds,
      map,
      sfMap,
    );
    await c.query("SELECT app.reconcile_branch_structure($1)", [treeId]);
    if (options.familyCsv)
      await c.query(
        `INSERT INTO app.tree_activity(
           tree_id,actor_user_id,action_type,target_type,target_id,metadata
         ) VALUES($1,$2,'family_csv_import','family_tree',$1,$3::jsonb)`,
        [
          treeId,
          s.user_id,
          JSON.stringify({
            members: b.members?.length ?? 0,
            branches: b.subfamilies?.length ?? 0,
          }),
        ],
      );
    const updated = await c.query<{ version: number }>(
      "UPDATE app.family_trees SET version=version+1 WHERE id=$1 RETURNING version",
      [treeId],
    );
    await c.query("SELECT app.store_tree_snapshot($1::uuid,$2::bigint,$3::bigint,$4::uuid)", [
      treeId,
      updated.rows[0].version,
      expectedVersion,
      batch,
    ]);
    return {
      batchId: batch,
      mapped: map.size + sfMap.size,
      reconciled: true,
      version: updated.rows[0].version,
    };
  });
}
