import type { Session } from "@/features/auth/server";
import { handleTreeAccessRequest } from "./tree-access-handler";
import { handleTreeCatalogRequest } from "./tree-catalog-handler";
import { handleTreeMetadataRequest } from "./tree-metadata-handler";
import { handleTreeSnapshotRequest } from "./tree-snapshot-handler";
import { handleFamilyCsvImportRequest } from "./family-csv-import-handler";

type TreeHandler = (
  request: Request,
  url: URL,
  session: Session,
  requestId: string,
) => Promise<Response | null>;

const handlers: TreeHandler[] = [
  handleTreeCatalogRequest,
  handleFamilyCsvImportRequest,
  handleTreeSnapshotRequest,
  handleTreeAccessRequest,
  handleTreeMetadataRequest,
];

export async function handleTreeRequest(
  request: Request,
  url: URL,
  session: Session,
  requestId: string,
): Promise<Response | null> {
  for (const handler of handlers) {
    const response = await handler(request, url, session, requestId);
    if (response) return response;
  }
  return null;
}
