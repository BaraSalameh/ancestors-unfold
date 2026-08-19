import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { SnapshotInput } from "@/server/security";
import {
  countImportedSourceMappings,
  requireFamilyCsvImportManager,
  validateFamilyCsvAppend,
  validateSourceMappings,
} from "./family-csv-import-protection";
import { enforceSnapshotBranchRoots } from "./snapshot-branch-root-policy";
import { enforceBranchSnapshotScope } from "./snapshot-branch-scope";
import { enforceSnapshotBranchUniqueness } from "./snapshot-branch-uniqueness";
import { validateSnapshotImages } from "./snapshot-image-validation";
import { writeSnapshotMembers } from "./snapshot-member-writer";
import { writeSnapshotRelationships } from "./snapshot-relationship-writer";
import {
  authorizeSnapshotWrite,
  completedSnapshotWrite,
  lockSnapshotVersion,
} from "./snapshot-write-preparation";

export type SnapshotImportOptions = {
  familyCsv?: {
    sourceMemberIds: ReadonlyMap<string, string>;
    sourceBranchIds: ReadonlyMap<string, string>;
  };
};

async function validateFamilyCsvImport(
  client: PoolClient,
  treeId: string,
  userId: string,
  input: SnapshotInput,
  options: SnapshotImportOptions,
) {
  if (!options.familyCsv) return;
  await requireFamilyCsvImportManager(client, treeId, userId);
  validateSourceMappings(
    input,
    options.familyCsv.sourceMemberIds,
    options.familyCsv.sourceBranchIds,
  );
  await validateFamilyCsvAppend(client, treeId, input);
}

async function branchWriteScope(
  client: PoolClient,
  treeId: string,
  userId: string,
  isBranchEditor: boolean,
) {
  const allowedMembers = new Set<string>();
  if (isBranchEditor) {
    const members = await client.query<{ id: string }>(
      "SELECT member_id id FROM app.branch_members($1,$2)",
      [treeId, userId],
    );
    members.rows.forEach(({ id }) => allowedMembers.add(id));
  }
  const existingMembers = isBranchEditor
    ? await client.query<{ id: string }>(
        "SELECT id FROM app.family_members WHERE tree_id=$1 AND deleted_at IS NULL",
        [treeId],
      )
    : null;
  const existingMemberIds = new Set(existingMembers?.rows.map(({ id }) => id) ?? []);
  const mutableMembers = new Set(allowedMembers);
  if (isBranchEditor) {
    const drafts = await client.query<{ id: string }>(
      `SELECT id FROM app.family_members
       WHERE tree_id=$1 AND created_by=$2 AND deleted_at IS NULL
         AND app.is_unattached_member(tree_id,id)`,
      [treeId, userId],
    );
    drafts.rows.forEach(({ id }) => mutableMembers.add(id));
  }
  return { allowedMembers, existingMemberIds, mutableMembers };
}

function editableMembers(
  input: SnapshotInput,
  isBranchEditor: boolean,
  mutableMembers: ReadonlySet<string>,
  existingMemberIds: ReadonlySet<string>,
) {
  const members = input.members ?? [];
  return isBranchEditor
    ? members.filter((member) => mutableMembers.has(member.id) || !existingMemberIds.has(member.id))
    : members;
}

async function recordImportActivity(
  client: PoolClient,
  treeId: string,
  userId: string,
  options: SnapshotImportOptions,
) {
  if (!options.familyCsv) return;
  await client.query(
    `INSERT INTO app.tree_activity(
       tree_id,actor_user_id,action_type,target_type,target_id,metadata
     ) VALUES($1,$2,'family_csv_import','family_tree',$1,$3::jsonb)`,
    [
      treeId,
      userId,
      JSON.stringify({
        members: countImportedSourceMappings(options.familyCsv.sourceMemberIds, "member"),
        branches: countImportedSourceMappings(options.familyCsv.sourceBranchIds, "branch"),
      }),
    ],
  );
}

async function completeSnapshotImport(
  client: PoolClient,
  treeId: string,
  expectedVersion: number,
  batch: string,
) {
  const updated = await client.query<{ version: number }>(
    "UPDATE app.family_trees SET version=version+1 WHERE id=$1 RETURNING version",
    [treeId],
  );
  await client.query("SELECT app.store_tree_snapshot($1::uuid,$2::bigint,$3::bigint,$4::uuid)", [
    treeId,
    updated.rows[0].version,
    expectedVersion,
    batch,
  ]);
  return updated.rows[0].version;
}

export async function runSnapshotImport(
  client: PoolClient,
  treeId: string,
  userId: string,
  input: SnapshotInput,
  options: SnapshotImportOptions,
) {
  const { isBranchEditor, branchRootId } = await authorizeSnapshotWrite(client, treeId, userId);
  await enforceSnapshotBranchRoots(client, treeId, input, isBranchEditor ? branchRootId : null);
  await validateFamilyCsvImport(client, treeId, userId, input, options);
  const batch = input.batchId || randomUUID();
  const completed = await completedSnapshotWrite(client, treeId, batch);
  if (completed) return completed;
  await client.query("SELECT set_config('app.correlation_id',$1,true)", [batch]);
  const scope = await branchWriteScope(client, treeId, userId, isBranchEditor);
  const expectedVersion = await lockSnapshotVersion(client, treeId, Number(input.expectedVersion));
  if (!isBranchEditor) await enforceSnapshotBranchUniqueness(client, treeId, input);
  const members = editableMembers(
    input,
    isBranchEditor,
    scope.mutableMembers,
    scope.existingMemberIds,
  );
  await validateSnapshotImages(client, treeId, members);
  const editableIds = new Set(members.map(({ id }) => id));
  if (isBranchEditor)
    await enforceBranchSnapshotScope(
      client,
      treeId,
      userId,
      input.members ?? [],
      members,
      scope.existingMemberIds,
      scope.mutableMembers,
    );
  const { memberIds, subfamilyIds } = await writeSnapshotMembers(
    client,
    treeId,
    userId,
    batch,
    input,
    members,
    isBranchEditor,
    branchRootId,
    scope.existingMemberIds,
    scope.allowedMembers,
    editableIds,
    options.familyCsv?.sourceMemberIds,
    options.familyCsv?.sourceBranchIds,
  );
  await writeSnapshotRelationships(
    client,
    treeId,
    userId,
    input,
    members,
    isBranchEditor,
    scope.mutableMembers,
    editableIds,
    memberIds,
    subfamilyIds,
  );
  await client.query("SELECT app.reconcile_branch_structure($1)", [treeId]);
  await recordImportActivity(client, treeId, userId, options);
  const version = await completeSnapshotImport(client, treeId, expectedVersion, batch);
  return {
    batchId: batch,
    mapped: memberIds.size + subfamilyIds.size,
    reconciled: true,
    version,
  };
}
