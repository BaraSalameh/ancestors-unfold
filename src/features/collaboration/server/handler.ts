import { handleTreeOverviewRequest } from "./tree-overview-handler";
import { handleCollaborationSearchRequest } from "./collaboration-search-handler";
import { handleBranchRequest } from "./branch-handler";
import { handleInvitationRequest } from "./invitation-handler";
import { handleActivityRequest } from "./activity-handler";
import { handleModerationRequest } from "./moderation-handler";
import { handleMemberChangeRequest } from "./member-change-handler";
import { handleAuthenticityConfigRequest } from "./authenticity-config-handler";
import { handleContributorRemovalRequest } from "./contributor-removal-handler";
import { handleOwnershipTransferRequest } from "./ownership-transfer-handler";
import type { CollaborationSession as Session } from "./types";

export async function handleCollaborationRequest(
  request: Request,
  session: Session,
  requestId: string,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const overviewResponse = await handleTreeOverviewRequest(request, url, session, requestId);
  if (overviewResponse) return overviewResponse;
  const searchResponse = await handleCollaborationSearchRequest(request, url, session, requestId);
  if (searchResponse) return searchResponse;
  const branchResponse = await handleBranchRequest(request, url, session, requestId);
  if (branchResponse) return branchResponse;
  const invitationResponse = await handleInvitationRequest(request, url, session, requestId);
  if (invitationResponse) return invitationResponse;
  const activityResponse = await handleActivityRequest(request, url, session, requestId);
  if (activityResponse) return activityResponse;
  const moderationResponse = await handleModerationRequest(request, url, session, requestId);
  if (moderationResponse) return moderationResponse;
  const memberChangeResponse = await handleMemberChangeRequest(request, url, session, requestId);
  if (memberChangeResponse) return memberChangeResponse;
  const configResponse = await handleAuthenticityConfigRequest(request, url, session, requestId);
  if (configResponse) return configResponse;
  const removalResponse = await handleContributorRemovalRequest(request, url, session, requestId);
  if (removalResponse) return removalResponse;
  const transferResponse = await handleOwnershipTransferRequest(request, url, session, requestId);
  if (transferResponse) return transferResponse;
  return undefined;
}
