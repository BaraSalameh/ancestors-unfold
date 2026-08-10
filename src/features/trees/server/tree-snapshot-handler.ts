import type { Session } from "@/features/auth/server";
import {
  discardPendingMemberImage,
  reconcileMemberImages,
  registerMemberImage,
  signMemberImageUpload,
} from "@/features/members/server";
import { parseBody, schemas } from "@/server/security";
import { snapshotDeltaSchema } from "@/server/snapshot-delta-schema";
import { jsonResponse as json } from "@/shared/http/response";
import { importSnapshot } from "./snapshot-repository";
import { applySnapshotDelta } from "./snapshot-delta-repository";
import { readSnapshot } from "./snapshot-reader";

export async function handleTreeSnapshotRequest(
  request: Request,
  url: URL,
  session: Session,
  requestId: string,
) {
  const snapshot = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/snapshot$/);
  if (snapshot && request.method === "GET")
    return json(await readSnapshot(session, requestId, snapshot[1]));
  if (snapshot && request.method === "PUT") {
    const input = await parseBody(request, schemas.snapshot);
    const result = await importSnapshot(session, requestId, snapshot[1], {
      ...input,
      members: input.members.map((member) => ({
        ...member,
        citizen_status: member.citizen_status ?? "resident",
      })),
    });
    await reconcileMemberImages(session, requestId, snapshot[1]);
    return json(result);
  }
  if (snapshot && request.method === "PATCH") {
    const input = await parseBody(request, snapshotDeltaSchema, 15 * 1024 * 1024);
    const result = await applySnapshotDelta(session, requestId, snapshot[1], {
      ...input,
      upsertMembers: input.upsertMembers.map((member) => ({
        ...member,
        citizen_status: member.citizen_status ?? "resident",
      })),
    });
    await reconcileMemberImages(session, requestId, snapshot[1]);
    return json(result);
  }
  const image = url.pathname.match(
    /^\/api\/trees\/([0-9a-f-]+)\/member-images\/(sign|register|discard)$/,
  );
  if (!image || request.method !== "POST") return null;
  const treeId = image[1];
  if (image[2] === "sign") {
    const body = await parseBody(request, schemas.memberImageSign);
    return json(await signMemberImageUpload(session, requestId, treeId, body.memberId));
  }
  if (image[2] === "register") {
    const body = await parseBody(request, schemas.memberImageRegister);
    return json(await registerMemberImage(session, requestId, treeId, body));
  }
  const body = await parseBody(request, schemas.memberImageDiscard);
  return json(await discardPendingMemberImage(session, requestId, treeId, body.assetId));
}
