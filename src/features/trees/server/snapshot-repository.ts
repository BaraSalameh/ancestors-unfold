import type { SnapshotInput } from "@/server/security";
import { transaction } from "@/shared/server/database";
import { runSnapshotImport, type SnapshotImportOptions } from "./snapshot-import-transaction";
import type { SessionContext } from "./snapshot-reader";

export function importSnapshot(
  session: SessionContext,
  requestId: string,
  treeId: string,
  input: SnapshotInput,
  options: SnapshotImportOptions = {},
) {
  return transaction(session.user_id, session.id, requestId, (client) =>
    runSnapshotImport(client, treeId, session.user_id, input, options),
  );
}
