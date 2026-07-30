/* eslint-disable max-lines, max-lines-per-function, complexity -- Role-aware dashboard keeps coordinated remote state in one controller. */
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  Circle,
  GitBranch,
  MailPlus,
  Pencil,
  RotateCw,
  Share2,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  activityDescription,
  type ActivityItem,
  type ActivityPageResponse,
} from "../domain/activity-label";
import {
  authenticityLevels,
  authenticityRequirementStates,
  authenticityStepStatus,
  type AuthenticityLevel,
  type EarnedAuthenticityLevel,
} from "../domain/authenticity-progress";
import { copyTreePreviewUrl } from "./dashboard-share";
import { useAuth } from "@/features/auth";
import { useI18n } from "@/shared/i18n";
import { DashboardPageSkeleton, LoadingStatus } from "@/shared/ui/page-skeletons";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  activeContributorBranches,
  canUseOwnerTreeControls,
  shouldRefreshDashboard,
} from "./dashboard-owner-controls";

type CurrentTree = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  created_at: string;
  role: "owner" | "contributor";
  affiliation_status: "active" | "read_only" | "removed";
  assigned_branch_id: string | null;
};
type Statistics = {
  total_members: number;
  active_contributors: number;
  managed_branches: number;
  total_branches: number;
  serious_complaints: number;
  authenticity_level: AuthenticityLevel;
  earned_authenticity_level: EarnedAuthenticityLevel;
  growing_contributors: number;
  growing_branches: number;
  backed_contributors: number;
  backed_branches: number;
  established_contributors: number;
  established_branches: number;
  established_min_days: number;
  recent_activity_days: number;
  tree_age_days: number;
  recent_activity_met: boolean;
  tree_created_at: string;
  last_contribution_at: string | null;
  owner_name_en: string;
  owner_name_ar: string;
};
type Branch = {
  id: string;
  name_en: string;
  name_ar: string | null;
  status: string;
  contributor_user_id: string | null;
  contributor_name_en: string | null;
  contributor_name_ar: string | null;
};
type Invitation = {
  id: string;
  invited_name_en: string;
  invited_name_ar: string;
  invited_email: string;
  status: string;
  expires_at: string;
  branch_name_en: string;
  branch_name_ar: string | null;
};
type OwnershipTransfer = {
  id: string;
  tree_id: string;
  tree_name_en: string | null;
  tree_name_ar: string | null;
  current_owner_user_id: string;
  proposed_owner_user_id: string;
  current_owner_name_en: string;
  current_owner_name_ar: string;
  proposed_owner_name_en: string;
  proposed_owner_name_ar: string;
  branch_id: string;
  branch_name_en: string;
  branch_name_ar: string | null;
  verified: boolean;
  status: "pending";
  verification_expires_at: string | null;
  expires_at: string;
  created_at: string;
};
type DashboardData = {
  tree: CurrentTree;
  stats: Statistics;
  branches: Branch[];
  invitations: Invitation[];
  activity: ActivityItem[];
  ownershipTransfer: OwnershipTransfer | null;
};

let dashboardCache: DashboardData | undefined;
let dashboardCacheUpdatedAt = 0;
const DASHBOARD_STALE_MS = 60_000;

const getJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error((await response.json()).code ?? "REQUEST_FAILED");
  return response.json() as Promise<T>;
};

export function CollaborationDashboard() {
  const { t, lang } = useI18n();
  const { deleteContributorAccount, requestContributorAccountDeletionCode, session } = useAuth();
  const navigate = useNavigate();
  const [tree, setTree] = useState<CurrentTree>();
  const [stats, setStats] = useState<Statistics>();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [ownershipTransfer, setOwnershipTransfer] = useState<OwnershipTransfer | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteAccountCode, setDeleteAccountCode] = useState("");
  const [deleteAccountCodeExpiresAt, setDeleteAccountCodeExpiresAt] = useState<string>();
  const [deleteAccountAction, setDeleteAccountAction] = useState<"request" | "delete">();
  const [invitationAction, setInvitationAction] = useState<string>();
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferUserId, setTransferUserId] = useState("");
  const [transferCode, setTransferCode] = useState("");
  const [transferAction, setTransferAction] = useState<
    "request" | "verify" | "resend" | "accept" | "reject" | "cancel"
  >();
  const [removalOpen, setRemovalOpen] = useState(false);
  const [removalContributorId, setRemovalContributorId] = useState("");
  const [removalChallenge, setRemovalChallenge] = useState<{
    id: string;
    expires_at: string;
  }>();
  const [removalCode, setRemovalCode] = useState("");
  const [removalAction, setRemovalAction] = useState<"request" | "resend" | "confirm">();
  const mounted = useRef(false);
  const loadInFlight = useRef<Promise<DashboardData> | undefined>(undefined);
  const local = (en?: string | null, ar?: string | null) =>
    lang === "ar" ? ar || en || "" : en || ar || "";
  const applyDashboard = useCallback((data: DashboardData) => {
    setTree(data.tree);
    setStats(data.stats);
    setBranches(data.branches);
    setInvitations(data.invitations);
    setActivity(data.activity);
    setOwnershipTransfer(data.ownershipTransfer);
  }, []);
  const load = useCallback(
    async (force = false) => {
      if (!force && dashboardCache) {
        applyDashboard(dashboardCache);
        if (Date.now() - dashboardCacheUpdatedAt < DASHBOARD_STALE_MS) return;
      }
      if (!loadInFlight.current) {
        loadInFlight.current = (async () => {
          const current = await getJson<CurrentTree>("/api/tree/current");
          const [nextStats, nextBranches, nextActivity, nextTransfer] = await Promise.all([
            getJson<Statistics>(`/api/trees/${current.id}/statistics`),
            getJson<Branch[]>(`/api/trees/${current.id}/branches`),
            getJson<ActivityPageResponse>(
              `/api/trees/${current.id}/activity?limit=5&locale=${lang}`,
            ).then((page) => page.items),
            getJson<OwnershipTransfer | null>(`/api/trees/${current.id}/ownership-transfers`),
          ]);
          const nextInvitations =
            current.role === "owner"
              ? await getJson<Invitation[]>(`/api/trees/${current.id}/invitations`)
              : [];
          return {
            tree: current,
            stats: nextStats,
            branches: nextBranches,
            activity: nextActivity,
            invitations: nextInvitations,
            ownershipTransfer: nextTransfer,
          };
        })().finally(() => {
          loadInFlight.current = undefined;
        });
      }
      const data = await loadInFlight.current;
      dashboardCache = data;
      dashboardCacheUpdatedAt = Date.now();
      if (mounted.current) applyDashboard(data);
    },
    [applyDashboard, lang],
  );
  useEffect(() => {
    mounted.current = true;
    void load().catch(() => {
      if (mounted.current && !dashboardCache) setTree(undefined);
    });
    const refreshWhenVisible = () => {
      if (
        shouldRefreshDashboard(
          document.visibilityState,
          dashboardCacheUpdatedAt,
          Date.now(),
          DASHBOARD_STALE_MS,
        )
      )
        void load(true).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);
  const assigned = branches.find((branch) => branch.id === tree?.assigned_branch_id);
  const actOnInvitation = async (id: string, action: "cancel" | "resend") => {
    if (invitationAction) return;
    setInvitationAction(`${id}:${action}`);
    try {
      const response = await fetch(`/api/invitations/${id}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await response.json()) as { code?: string };
      if (!response.ok) {
        toast.error(body.code === "RESEND_TOO_SOON" ? t("resend_too_soon") : t("auth_error"));
        return;
      }
      toast.success(t(action === "cancel" ? "invitation_cancelled" : "invitation_resent"));
      await load(true);
    } finally {
      setInvitationAction(undefined);
    }
  };
  const openRename = () => {
    if (!tree || !canUseOwnerTreeControls(tree.role)) return;
    setNameEn(tree.name_en ?? "");
    setNameAr(tree.name_ar ?? "");
    setRenameOpen(true);
  };
  const renameTree = async () => {
    if (renaming || !tree || !canUseOwnerTreeControls(tree.role) || !nameEn.trim()) return;
    setRenaming(true);
    try {
      const response = await fetch(`/api/trees/${tree.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name_en: nameEn.trim(), name_ar: nameAr.trim() }),
      });
      if (!response.ok) throw new Error("TREE_RENAME_FAILED");
      setTree({ ...tree, name_en: nameEn.trim(), name_ar: nameAr.trim() || null });
      setRenameOpen(false);
      toast.success(t("updated"));
    } catch {
      toast.error(t("tree_update_failed"));
    } finally {
      setRenaming(false);
    }
  };
  const copyPreview = async () => {
    if (!tree || !canUseOwnerTreeControls(tree.role)) return;
    try {
      await copyTreePreviewUrl(tree.id, window.location.origin, navigator.clipboard);
      toast.success(t("preview_link_copied"));
    } catch {
      toast.error(t("preview_link_copy_failed"));
    }
  };
  const requestTransfer = async () => {
    if (transferAction || !tree || !transferUserId) return;
    setTransferAction("request");
    try {
      const response = await fetch(`/api/trees/${tree.id}/ownership-transfers`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposedOwnerUserId: transferUserId }),
      });
      if (!response.ok) throw new Error(((await response.json()) as { code?: string }).code);
      toast.success(t("ownership_transfer_code_sent"));
      await load(true);
    } catch {
      toast.error(t("ownership_transfer_failed"));
    } finally {
      setTransferAction(undefined);
    }
  };
  const verifyTransfer = async () => {
    if (transferAction || !ownershipTransfer || !/^\d{6}$/.test(transferCode)) return;
    setTransferAction("verify");
    try {
      const response = await fetch(`/api/ownership-transfers/${ownershipTransfer.id}/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: transferCode }),
      });
      if (!response.ok) throw new Error("VERIFY_FAILED");
      setTransferCode("");
      toast.success(t("ownership_transfer_verified"));
      await load(true);
      setTransferOpen(false);
    } catch {
      toast.error(t("ownership_transfer_invalid_code"));
    } finally {
      setTransferAction(undefined);
    }
  };
  const resendTransferCode = async () => {
    if (transferAction || !ownershipTransfer || ownershipTransfer.verified) return;
    setTransferAction("resend");
    try {
      const response = await fetch(`/api/ownership-transfers/${ownershipTransfer.id}/resend-code`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("RESEND_FAILED");
      setTransferCode("");
      toast.success(t("ownership_transfer_code_sent"));
      await load(true);
    } catch {
      toast.error(t("ownership_transfer_failed"));
    } finally {
      setTransferAction(undefined);
    }
  };
  const actOnTransfer = async (action: "accept" | "reject" | "cancel") => {
    if (transferAction || !ownershipTransfer) return;
    setTransferAction(action);
    try {
      const response = await fetch(`/api/ownership-transfers/${ownershipTransfer.id}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("TRANSFER_ACTION_FAILED");
      dashboardCache = undefined;
      const successKey =
        action === "accept"
          ? "ownership_transfer_accepted"
          : action === "reject"
            ? "ownership_transfer_rejected"
            : "ownership_transfer_canceled";
      toast.success(t(successKey));
      await load(true);
    } catch {
      toast.error(t("ownership_transfer_failed"));
    } finally {
      setTransferAction(undefined);
    }
  };
  const selectedRemovalBranch = branches.find(
    (branch) => branch.contributor_user_id === removalContributorId,
  );
  const removableContributorBranches = activeContributorBranches(branches);
  const requestContributorRemoval = async () => {
    if (removalAction || !tree || tree.role !== "owner" || !removalContributorId) return;
    setRemovalAction(removalChallenge ? "resend" : "request");
    try {
      const response = await fetch(
        `/api/trees/${tree.id}/contributors/${removalContributorId}/removal-requests`,
        { method: "POST", credentials: "include" },
      );
      const body = (await response.json()) as {
        id?: string;
        expires_at?: string;
        code?: string;
      };
      if (!response.ok || !body.id || !body.expires_at) {
        toast.error(
          body.code === "CONTRIBUTOR_UNAVAILABLE"
            ? t("contributor_removal_unavailable")
            : t("contributor_removal_code_failed"),
        );
        return;
      }
      setRemovalChallenge({ id: body.id, expires_at: body.expires_at });
      setRemovalCode("");
      toast.success(t("contributor_removal_code_sent"));
    } catch {
      toast.error(t("contributor_removal_code_failed"));
    } finally {
      setRemovalAction(undefined);
    }
  };
  const confirmContributorRemoval = async () => {
    if (removalAction || !removalChallenge || !/^\d{6}$/.test(removalCode)) return;
    setRemovalAction("confirm");
    try {
      const response = await fetch(
        `/api/contributor-removal-requests/${removalChallenge.id}/confirm`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: removalCode }),
        },
      );
      const body = (await response.json()) as { code?: string };
      if (!response.ok) {
        toast.error(
          body.code === "INVALID_OR_EXPIRED_CODE"
            ? t("contributor_removal_invalid_code")
            : body.code === "CONTRIBUTOR_UNAVAILABLE"
              ? t("contributor_removal_unavailable")
              : t("contributor_removal_failed"),
        );
        return;
      }
      setRemovalOpen(false);
      setRemovalContributorId("");
      setRemovalChallenge(undefined);
      setRemovalCode("");
      toast.success(t("contributor_removal_completed"));
      await load(true);
    } catch {
      toast.error(t("contributor_removal_failed"));
    } finally {
      setRemovalAction(undefined);
    }
  };
  const requestDeleteAccountCode = async () => {
    if (deleteAccountAction || deleteConfirmation !== "DELETE") return;
    setDeleteAccountAction("request");
    try {
      const result = await requestContributorAccountDeletionCode("DELETE");
      setDeleteAccountCode("");
      setDeleteAccountCodeExpiresAt(result.expiresAt);
      toast.success(t("account_deletion_code_sent"));
    } catch (error) {
      toast.error(
        (error as { code?: string }).code === "RESEND_TOO_SOON"
          ? t("resend_too_soon")
          : t("account_deletion_code_failed"),
      );
    } finally {
      setDeleteAccountAction(undefined);
    }
  };
  const deleteAccount = async () => {
    if (
      deleteAccountAction ||
      deleteConfirmation !== "DELETE" ||
      !/^\d{6}$/.test(deleteAccountCode)
    )
      return;
    setDeleteAccountAction("delete");
    try {
      await deleteContributorAccount("DELETE", deleteAccountCode);
      await navigate({ to: "/auth", search: { redirect: "/", oauthError: undefined } });
    } catch (error) {
      toast.error(
        (error as { code?: string }).code === "INVALID_OR_EXPIRED_CODE"
          ? t("account_deletion_invalid_code")
          : t("account_delete_failed"),
      );
      setDeleteAccountAction(undefined);
    }
  };
  if (!tree || !stats)
    return (
      <DashboardPageSkeleton
        label={t("loading")}
        role={tree?.role ?? session?.currentTree?.role}
        familyName={
          tree
            ? local(tree.name_en, tree.name_ar)
            : local(session?.currentTree?.nameEn, session?.currentTree?.nameAr)
        }
      />
    );
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-muted/25">
      <section className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-sm font-medium text-primary">{t("family_dashboard")}</p>
              <h1 className="mt-2 text-3xl font-bold">{local(tree.name_en, tree.name_ar)}</h1>
              {tree.role === "contributor" && (
                <p className="mt-2 text-muted-foreground">{t("contributor_dashboard_intro")}</p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {canUseOwnerTreeControls(tree.role) && (
                <>
                  <Button variant="outline" onClick={openRename}>
                    <Pencil className="me-2 h-4 w-4" />
                    {t("rename")}
                  </Button>
                  <Button variant="outline" onClick={() => void copyPreview()}>
                    <Share2 className="me-2 h-4 w-4" />
                    {t("copy_preview_link")}
                  </Button>
                </>
              )}
              <Button asChild>
                <Link to="/tree/$id" params={{ id: tree.id }} search={{ mode: "edit" }}>
                  {t("edit")}
                </Link>
              </Button>
              {tree.role === "contributor" && (
                <>
                  <Button asChild variant="outline">
                    <Link to="/tree/$id" params={{ id: tree.id }} search={{ mode: "preview" }}>
                      {t("preview")}
                    </Link>
                  </Button>
                  <Button variant="destructive" onClick={() => setDeleteAccountOpen(true)}>
                    <Trash2 className="me-2 h-4 w-4" />
                    {t("cancel_contribution")}
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={<Users />} label={t("people_recorded")} value={stats.total_members} />
            <Stat
              icon={<UserRoundCog />}
              label={t("active_contributors")}
              value={stats.active_contributors}
            />
            <Stat
              icon={<GitBranch />}
              label={t("managed_branches")}
              value={stats.managed_branches}
            />
            <Stat icon={<GitBranch />} label={t("total_branches")} value={stats.total_branches} />
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-8 sm:px-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {tree.role === "contributor" &&
            ownershipTransfer?.proposed_owner_user_id &&
            ownershipTransfer.verified && (
              <OwnershipTransferPrompt
                transfer={ownershipTransfer}
                local={local}
                action={transferAction}
                onAction={actOnTransfer}
              />
            )}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{tree.role === "owner" ? t("branches") : t("assigned_branch")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(tree.role === "owner" ? branches : assigned ? [assigned] : []).map((branch) => (
                <div
                  key={branch.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium">{local(branch.name_en, branch.name_ar)}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("branch_responsible", {
                        name: branch.contributor_name_en
                          ? local(branch.contributor_name_en, branch.contributor_name_ar)
                          : local(stats.owner_name_en, stats.owner_name_ar),
                      })}
                    </p>
                  </div>
                  <Badge variant={branch.status === "active" ? "default" : "secondary"}>
                    {branch.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          {tree.role === "owner" && (
            <Card>
              <CardHeader>
                <CardTitle>{t("pending_invitations")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {invitations.filter((item) => item.status === "pending").length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("no_pending_invitations")}</p>
                )}
                {invitations
                  .filter((item) => item.status === "pending")
                  .map((item) => (
                    <div key={item.id} className="rounded-lg border p-4">
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {local(item.invited_name_en, item.invited_name_ar)}
                          </p>
                          <p className="text-sm text-muted-foreground" dir="ltr">
                            {item.invited_email}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Badge variant="outline">{item.status}</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            loading={invitationAction === `${item.id}:resend`}
                            disabled={Boolean(invitationAction)}
                            onClick={() => void actOnInvitation(item.id, "resend")}
                          >
                            <RotateCw className="me-1 h-3.5 w-3.5" />
                            {t("resend_invitation")}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            loading={invitationAction === `${item.id}:cancel`}
                            disabled={Boolean(invitationAction)}
                            onClick={() => void actOnInvitation(item.id, "cancel")}
                          >
                            <X className="me-1 h-3.5 w-3.5" />
                            {t("cancel_invitation")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t("latest_activity")}</CardTitle>
              <Button asChild size="icon" variant="ghost" aria-label={t("view_activity_history")}>
                <Link to="/activity">
                  <Activity className="h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {activity.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("no_activity")}</p>
              )}
              {activity.slice(0, 5).map((row) => (
                <div key={row.id} className="flex items-center gap-3 border-b pb-3 last:border-0">
                  <Activity className="h-4 w-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {activityDescription(row, lang, t)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString(lang === "ar" ? "ar" : "en")}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                {t("authenticity")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {stats.authenticity_level === "under_review" && (
                <div
                  className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
                  role="status"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div>
                    <p className="font-semibold text-destructive">{t("under_review")}</p>
                    <p className="mt-1 text-muted-foreground">
                      {t(
                        stats.serious_complaints === 1
                          ? "authenticity_under_review_description_one"
                          : "authenticity_under_review_description_many",
                        { count: stats.serious_complaints },
                      )}
                    </p>
                  </div>
                </div>
              )}
              <AuthenticityRoadmap stats={stats} />
              <p className="text-sm text-muted-foreground">{t("family_backed_explanation")}</p>
              <dl className="space-y-3 text-sm">
                <Fact
                  label={t("tree_owner")}
                  value={local(stats.owner_name_en, stats.owner_name_ar)}
                />
                <Fact label={t("serious_complaints")} value={String(stats.serious_complaints)} />
                <Fact
                  label={t("tree_active_since")}
                  value={new Date(stats.tree_created_at).toLocaleDateString()}
                />
              </dl>
            </CardContent>
          </Card>
          {tree.role === "owner" && (
            <Card>
              <CardHeader>
                <CardTitle>{t("owner_controls")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => setInviteOpen(true)}
                >
                  <MailPlus className="me-2 h-4 w-4" />
                  {t("invite_contributor")}
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  disabled={removableContributorBranches.length === 0}
                  onClick={() => setRemovalOpen(true)}
                >
                  <Trash2 className="me-2 h-4 w-4" />
                  {t("cancel_contributor_contribution")}
                </Button>
                {removableContributorBranches.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("no_active_contributors_to_remove")}
                  </p>
                )}
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  disabled={Boolean(ownershipTransfer?.verified)}
                  onClick={() => setTransferOpen(true)}
                >
                  <ShieldCheck className="me-2 h-4 w-4" />
                  {t(
                    ownershipTransfer && !ownershipTransfer.verified
                      ? "continue_ownership_transfer"
                      : "transfer_ownership",
                  )}
                </Button>
                {ownershipTransfer && (
                  <div className="mt-4 space-y-3 rounded-lg border p-4 text-foreground">
                    <p className="font-medium">{t("ownership_transfer_pending")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("ownership_transfer_to", {
                        name: local(
                          ownershipTransfer.proposed_owner_name_en,
                          ownershipTransfer.proposed_owner_name_ar,
                        ),
                        branch: local(
                          ownershipTransfer.branch_name_en,
                          ownershipTransfer.branch_name_ar,
                        ),
                      })}
                    </p>
                    {ownershipTransfer.verified ? (
                      <Badge>{t("awaiting_contributor_acceptance")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("verification_code_required")}</Badge>
                    )}
                    <Button
                      variant="outline"
                      loading={transferAction === "cancel"}
                      disabled={Boolean(transferAction)}
                      onClick={() => void actOnTransfer("cancel")}
                    >
                      {t("cancel_transfer")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </section>
      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        treeId={tree.id}
        onSent={async () => {
          toast.success(t("invitation_sent"));
          setInviteOpen(false);
          await load(true);
        }}
      />
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("transfer_ownership")}</DialogTitle>
          </DialogHeader>
          {!ownershipTransfer ? (
            <>
              <p className="text-sm text-muted-foreground">{t("transfer_ownership_desc")}</p>
              <div className="space-y-2">
                {removableContributorBranches.map((branch) => (
                  <button
                    type="button"
                    key={branch.id}
                    className={`w-full rounded-lg border p-4 text-start ${
                      transferUserId === branch.contributor_user_id
                        ? "border-primary bg-primary/5"
                        : ""
                    }`}
                    onClick={() => setTransferUserId(branch.contributor_user_id ?? "")}
                  >
                    <span className="block font-medium">
                      {local(branch.contributor_name_en, branch.contributor_name_ar)}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {t("former_owner_receives_branch", {
                        branch: local(branch.name_en, branch.name_ar),
                      })}
                    </span>
                  </button>
                ))}
                {removableContributorBranches.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("no_eligible_contributors")}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTransferOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button
                  loading={transferAction === "request"}
                  disabled={!transferUserId || Boolean(transferAction)}
                  onClick={() => void requestTransfer()}
                >
                  {t("send_verification_code")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t("ownership_transfer_code_desc", {
                  name: local(
                    ownershipTransfer.proposed_owner_name_en,
                    ownershipTransfer.proposed_owner_name_ar,
                  ),
                })}
              </p>
              <div className="space-y-2">
                <Label htmlFor="ownership-transfer-code">{t("verification_code")}</Label>
                <Input
                  id="ownership-transfer-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  dir="ltr"
                  maxLength={6}
                  value={transferCode}
                  onChange={(event) =>
                    setTransferCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
                {ownershipTransfer.verification_expires_at && (
                  <p className="text-xs text-muted-foreground">
                    {t("verification_code_expires", {
                      time: new Date(ownershipTransfer.verification_expires_at).toLocaleTimeString(
                        lang === "ar" ? "ar" : "en",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      ),
                    })}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  loading={transferAction === "resend"}
                  disabled={Boolean(transferAction)}
                  onClick={() => void resendTransferCode()}
                >
                  {t("resend_code")}
                </Button>
                <Button
                  loading={transferAction === "verify"}
                  disabled={Boolean(transferAction) || transferCode.length !== 6}
                  onClick={() => void verifyTransfer()}
                >
                  {t("verify_transfer")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={removalOpen}
        onOpenChange={(open) => {
          setRemovalOpen(open);
          if (!open) {
            setRemovalContributorId("");
            setRemovalChallenge(undefined);
            setRemovalCode("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cancel_contributor_contribution")}</DialogTitle>
          </DialogHeader>
          {!removalChallenge ? (
            <>
              <p className="text-sm text-muted-foreground">{t("select_contributor_to_cancel")}</p>
              <div className="space-y-2">
                {removableContributorBranches.map((branch) => (
                  <button
                    type="button"
                    key={branch.id}
                    className={`w-full rounded-lg border p-4 text-start ${
                      removalContributorId === branch.contributor_user_id
                        ? "border-destructive bg-destructive/5"
                        : ""
                    }`}
                    onClick={() => setRemovalContributorId(branch.contributor_user_id ?? "")}
                  >
                    <span className="block font-medium">
                      {local(branch.contributor_name_en, branch.contributor_name_ar)}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {local(branch.name_en, branch.name_ar)}
                    </span>
                  </button>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRemovalOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button
                  variant="destructive"
                  loading={removalAction === "request"}
                  disabled={!removalContributorId || Boolean(removalAction)}
                  onClick={() => void requestContributorRemoval()}
                >
                  {t("send_verification_code")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t("contributor_removal_code_desc", {
                  name: local(
                    selectedRemovalBranch?.contributor_name_en,
                    selectedRemovalBranch?.contributor_name_ar,
                  ),
                  branch: local(selectedRemovalBranch?.name_en, selectedRemovalBranch?.name_ar),
                })}
              </p>
              <div className="space-y-2">
                <Label htmlFor="contributor-removal-code">{t("verification_code")}</Label>
                <Input
                  id="contributor-removal-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  dir="ltr"
                  maxLength={6}
                  value={removalCode}
                  onChange={(event) =>
                    setRemovalCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t("verification_code_expires", {
                    time: new Date(removalChallenge.expires_at).toLocaleTimeString(
                      lang === "ar" ? "ar" : "en",
                      { hour: "2-digit", minute: "2-digit" },
                    ),
                  })}
                </p>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  loading={removalAction === "resend"}
                  disabled={Boolean(removalAction)}
                  onClick={() => void requestContributorRemoval()}
                >
                  {t("resend_code")}
                </Button>
                <Button
                  variant="destructive"
                  loading={removalAction === "confirm"}
                  disabled={Boolean(removalAction) || removalCode.length !== 6}
                  onClick={() => void confirmContributorRemoval()}
                >
                  {t("confirm_contributor_removal")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("update_family_tree")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tree-name-en">{t("family_name_en")}</Label>
              <Input
                id="tree-name-en"
                autoFocus
                dir="ltr"
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tree-name-ar">
                {t("family_name_ar")}{" "}
                <span className="font-normal text-muted-foreground">{t("optional")}</span>
              </Label>
              <Input
                id="tree-name-ar"
                dir="rtl"
                value={nameAr}
                onChange={(event) => setNameAr(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              {t("cancel")}
            </Button>
            <Button loading={renaming} disabled={!nameEn.trim()} onClick={() => void renameTree()}>
              {t("save_changes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_contributor_account")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete_contributor_account_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          {!deleteAccountCodeExpiresAt ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="delete-account-confirmation">{t("type_delete_to_confirm")}</Label>
                <Input
                  id="delete-account-confirmation"
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  autoComplete="off"
                  dir="ltr"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <Button
                  variant="destructive"
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  loading={deleteAccountAction === "request"}
                  disabled={Boolean(deleteAccountAction) || deleteConfirmation !== "DELETE"}
                  onClick={(event) => {
                    event.preventDefault();
                    void requestDeleteAccountCode();
                  }}
                >
                  {t("send_verification_code")}
                </Button>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="delete-account-code">{t("verification_code")}</Label>
                <Input
                  id="delete-account-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  dir="ltr"
                  maxLength={6}
                  value={deleteAccountCode}
                  onChange={(event) =>
                    setDeleteAccountCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
                <p className="text-xs text-muted-foreground">{t("account_deletion_code_desc")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("verification_code_expires", {
                    time: new Date(deleteAccountCodeExpiresAt).toLocaleTimeString(
                      lang === "ar" ? "ar" : "en",
                      { hour: "2-digit", minute: "2-digit" },
                    ),
                  })}
                </p>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <Button
                  variant="outline"
                  loading={deleteAccountAction === "request"}
                  disabled={Boolean(deleteAccountAction)}
                  onClick={() => void requestDeleteAccountCode()}
                >
                  {t("resend_code")}
                </Button>
                <Button
                  variant="destructive"
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  loading={deleteAccountAction === "delete"}
                  disabled={Boolean(deleteAccountAction) || deleteAccountCode.length !== 6}
                  onClick={(event) => {
                    event.preventDefault();
                    void deleteAccount();
                  }}
                >
                  {t("delete_account")}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function OwnershipTransferPrompt({
  transfer,
  local,
  action,
  onAction,
}: {
  transfer: OwnershipTransfer;
  local: (en?: string | null, ar?: string | null) => string;
  action: "accept" | "reject" | "cancel" | "request" | "verify" | "resend" | undefined;
  onAction: (action: "accept" | "reject") => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle>{t("ownership_transfer_request")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("ownership_transfer_request_desc", {
            owner: local(transfer.current_owner_name_en, transfer.current_owner_name_ar),
            tree: local(transfer.tree_name_en, transfer.tree_name_ar),
          })}
        </p>
        <div className="rounded-lg bg-muted p-3 text-sm">
          {t("ownership_transfer_branch_swap", {
            branch: local(transfer.branch_name_en, transfer.branch_name_ar),
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            loading={action === "accept"}
            disabled={Boolean(action)}
            onClick={() => void onAction("accept")}
          >
            {t("accept_ownership")}
          </Button>
          <Button
            variant="outline"
            loading={action === "reject"}
            disabled={Boolean(action)}
            onClick={() => void onAction("reject")}
          >
            {t("reject")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="text-primary">{icon}</span>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
function AuthenticityRoadmap({ stats }: { stats: Statistics }) {
  const { t } = useI18n();
  const requirementStates = authenticityRequirementStates({
    activeContributors: stats.active_contributors,
    managedBranches: stats.managed_branches,
    treeAgeDays: stats.tree_age_days,
    recentActivityMet: stats.recent_activity_met,
    growingContributors: stats.growing_contributors,
    growingBranches: stats.growing_branches,
    backedContributors: stats.backed_contributors,
    backedBranches: stats.backed_branches,
    establishedContributors: stats.established_contributors,
    establishedBranches: stats.established_branches,
    establishedMinDays: stats.established_min_days,
  });
  const levelLabels = {
    new: t("new_family_tree"),
    growing: t("growing_family_tree"),
    family_backed: t("family_backed_tree"),
    established: t("established_family_tree"),
  };
  const requirements: Record<EarnedAuthenticityLevel, { label: string; met: boolean }[]> = {
    new: [{ label: t("authenticity_starting_level"), met: requirementStates.new[0] }],
    growing: [
      {
        label: t(
          stats.growing_contributors === 1
            ? "authenticity_contributor_progress"
            : "authenticity_contributors_progress",
          {
            current: stats.active_contributors,
            required: stats.growing_contributors,
          },
        ),
        met: requirementStates.growing[0],
      },
      {
        label: t(
          stats.growing_branches === 1
            ? "authenticity_branch_progress"
            : "authenticity_branches_progress",
          {
            current: stats.managed_branches,
            required: stats.growing_branches,
          },
        ),
        met: requirementStates.growing[1],
      },
    ],
    family_backed: [
      {
        label: t(
          stats.backed_contributors === 1
            ? "authenticity_contributor_progress"
            : "authenticity_contributors_progress",
          {
            current: stats.active_contributors,
            required: stats.backed_contributors,
          },
        ),
        met: requirementStates.family_backed[0],
      },
      {
        label: t(
          stats.backed_branches === 1
            ? "authenticity_branch_progress"
            : "authenticity_branches_progress",
          {
            current: stats.managed_branches,
            required: stats.backed_branches,
          },
        ),
        met: requirementStates.family_backed[1],
      },
    ],
    established: [
      {
        label: t(
          stats.established_contributors === 1
            ? "authenticity_contributor_progress"
            : "authenticity_contributors_progress",
          {
            current: stats.active_contributors,
            required: stats.established_contributors,
          },
        ),
        met: requirementStates.established[0],
      },
      {
        label: t(
          stats.established_branches === 1
            ? "authenticity_branch_progress"
            : "authenticity_branches_progress",
          {
            current: stats.managed_branches,
            required: stats.established_branches,
          },
        ),
        met: requirementStates.established[1],
      },
      {
        label: t(
          stats.established_min_days === 1
            ? "authenticity_age_progress_one"
            : "authenticity_age_progress",
          {
            current: stats.tree_age_days,
            required: stats.established_min_days,
          },
        ),
        met: requirementStates.established[2],
      },
      {
        label: t(
          stats.recent_activity_days === 1
            ? "authenticity_recent_activity_one"
            : "authenticity_recent_activity",
          { days: stats.recent_activity_days },
        ),
        met: requirementStates.established[3],
      },
    ],
  };
  return (
    <ol className="space-y-0">
      {authenticityLevels.map((level, index) => {
        const status = authenticityStepStatus(level, stats.earned_authenticity_level);
        const statusLabel = t(
          status === "completed"
            ? "authenticity_completed"
            : status === "current"
              ? "authenticity_current"
              : "authenticity_upcoming",
        );
        return (
          <li
            key={level}
            className={`relative pb-4 ps-8 last:pb-0 ${
              index < authenticityLevels.length - 1 ? "border-s border-border" : ""
            }`}
          >
            <span
              className={`absolute -start-3 top-0 flex h-6 w-6 items-center justify-center rounded-full border ${
                status === "completed"
                  ? "border-primary bg-primary text-primary-foreground"
                  : status === "current"
                    ? "border-primary bg-primary/10 text-primary ring-4 ring-primary/10"
                    : "border-muted-foreground/30 bg-background text-muted-foreground"
              }`}
              aria-hidden="true"
            >
              {status === "completed" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Circle className="h-2.5 w-2.5" fill="currentColor" />
              )}
            </span>
            <div
              className={`rounded-lg border p-3 ${
                status === "current"
                  ? "border-primary/40 bg-primary/5"
                  : status === "upcoming"
                    ? "border-border/70 bg-muted/20"
                    : "border-border"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{levelLabels[level]}</p>
                <Badge variant={status === "current" ? "default" : "secondary"}>
                  {statusLabel}
                </Badge>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {requirements[level].map((requirement) => {
                  return (
                    <li key={requirement.label} className="flex items-start gap-1.5">
                      {requirement.met ? (
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : (
                        <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                      )}
                      <span>{requirement.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
function InviteDialog({
  open,
  onOpenChange,
  treeId,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treeId: string;
  onSent: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [branch, setBranch] = useState<SearchOption>();
  const [member, setMember] = useState<SearchOption>();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/trees/${treeId}/invitations`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          branchId: branch?.id,
          existingFamilyMemberId: member?.id,
        }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { code?: string };
        setError(
          body.code === "INVITEE_ALREADY_REGISTERED"
            ? t("existing_user_invitation_error")
            : body.code === "BRANCH_ALREADY_ASSIGNED"
              ? t("branch_already_has_contributor")
              : t("auth_error"),
        );
        return;
      }
      await onSent();
    } catch {
      setError(t("auth_error"));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("invite_contributor")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={t("email")} value={email} setValue={setEmail} type="email" />
          <SearchPicker kind="branch" treeId={treeId} value={branch} onSelect={setBranch} />
          <SearchPicker kind="member" treeId={treeId} value={member} onSelect={setMember} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            loading={submitting}
            onClick={() => void submit()}
            disabled={!branch || !member || !email.trim()}
          >
            {t("send_invitation")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SearchOption = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  birth_year?: number | null;
};

function SearchPicker({
  kind,
  treeId,
  value,
  onSelect,
}: {
  kind: "branch" | "member";
  treeId: string;
  value?: SearchOption;
  onSelect: (value: SearchOption | undefined) => void;
}) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      const endpoint = kind === "branch" ? "available-branches" : "invitable-members";
      void fetch(`/api/trees/${treeId}/${endpoint}?q=${encodeURIComponent(query.trim())}`, {
        credentials: "include",
        signal: controller.signal,
      })
        .then(async (response) => (response.ok ? ((await response.json()) as SearchOption[]) : []))
        .then(setResults)
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [kind, query, treeId]);
  const display = (option: SearchOption) => {
    const name =
      (lang === "ar" ? option.name_ar || option.name_en : option.name_en || option.name_ar) ?? "";
    return option.birth_year ? `${name} (${option.birth_year})` : name;
  };
  return (
    <div className="relative">
      <Label>{t(kind === "branch" ? "select_branch" : "select_family_member")}</Label>
      <Input
        className="mt-2"
        value={value ? display(value) : query}
        placeholder={t(kind === "branch" ? "search_branch" : "search_family_member")}
        onChange={(event) => {
          onSelect(undefined);
          setQuery(event.target.value);
        }}
        onFocus={() => {
          if (value) {
            setQuery(display(value));
            onSelect(undefined);
          }
        }}
      />
      {!value && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {loading && (
            <div className="space-y-2 px-3 py-2">
              <LoadingStatus label={t("loading")} />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">{t("no_search_results")}</p>
          )}
          {results.map((option) => (
            <button
              key={option.id}
              type="button"
              className="block w-full rounded-sm px-3 py-2 text-start text-sm hover:bg-accent"
              onClick={() => {
                onSelect(option);
                setQuery("");
                setResults([]);
              }}
            >
              {display(option)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function Field({
  label,
  value,
  setValue,
  type = "text",
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        className="mt-2"
        type={type}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </div>
  );
}
