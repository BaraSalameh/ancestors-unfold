export { dashboardBootstrapQueryOptions } from "./client/dashboard-bootstrap-query";
export type { DashboardBootstrap } from "./domain/dashboard-bootstrap";
export { CollaborationDashboard } from "./pages/collaboration-dashboard";
export { invalidateDashboardQueries } from "./client/dashboard-queries";
export {
  useContributorRemoval,
  type ContributorRemovalController,
} from "./client/use-contributor-removal";
export {
  useDashboardInvitations,
  type DashboardInvitationsController,
} from "./client/use-dashboard-invitations";
export { InviteDialog } from "./components/dashboard-invite-dialog";
export { ContributorRemovalDialog } from "./components/contributor-removal-dialog";
export type { Branch, CurrentTree, Invitation } from "./pages/dashboard-types";
