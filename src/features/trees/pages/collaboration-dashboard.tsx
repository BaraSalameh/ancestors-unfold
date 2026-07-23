/* eslint-disable max-lines, max-lines-per-function -- Role-aware dashboard keeps coordinated remote state in one controller. */
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  GitBranch,
  MailPlus,
  RotateCw,
  ShieldCheck,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

type CurrentTree = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  created_at: string;
  role: string;
  affiliation_status: "active" | "read_only" | "removed";
  assigned_branch_id: string | null;
  is_owner: boolean;
  can_manage_tree: boolean;
  can_edit_branch: boolean;
};
type Statistics = {
  total_members: number;
  active_contributors: number;
  managed_branches: number;
  total_branches: number;
  serious_complaints: number;
  authenticity_level: "new" | "growing" | "family_backed" | "established" | "under_review";
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
type ActivityRow = { action_type: string; target_type: string; created_at: string };

const getJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error((await response.json()).code ?? "REQUEST_FAILED");
  return response.json() as Promise<T>;
};

export function CollaborationDashboard() {
  const { t, lang } = useI18n();
  const [tree, setTree] = useState<CurrentTree>();
  const [stats, setStats] = useState<Statistics>();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitationAction, setInvitationAction] = useState<string>();
  const local = (en?: string | null, ar?: string | null) =>
    lang === "ar" ? ar || en || "" : en || ar || "";
  const load = async () => {
    const current = await getJson<CurrentTree>("/api/tree/current");
    setTree(current);
    const [nextStats, nextBranches, nextActivity] = await Promise.all([
      getJson<Statistics>(`/api/trees/${current.id}/statistics`),
      getJson<Branch[]>(`/api/trees/${current.id}/branches`),
      getJson<ActivityRow[]>(`/api/trees/${current.id}/activity`),
    ]);
    setStats(nextStats);
    setBranches(nextBranches);
    setActivity(nextActivity);
    if (current.is_owner)
      setInvitations(await getJson<Invitation[]>(`/api/trees/${current.id}/invitations`));
  };
  useEffect(() => {
    void load().catch(() => setTree(undefined));
  }, []);
  const assigned = branches.find((branch) => branch.id === tree?.assigned_branch_id);
  const actOnInvitation = async (id: string, action: "cancel" | "resend") => {
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
      await load();
    } finally {
      setInvitationAction(undefined);
    }
  };
  const authenticityLabel = useMemo(() => {
    const key = {
      new: "new_family_tree",
      growing: "growing_family_tree",
      family_backed: "family_backed_tree",
      established: "established_family_tree",
      under_review: "under_review",
    }[stats?.authenticity_level ?? "new"];
    return t(key as Parameters<typeof t>[0]);
  }, [stats?.authenticity_level, t]);
  if (!tree || !stats)
    return <main className="mx-auto max-w-7xl p-8 text-center">{t("loading")}</main>;
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-muted/25">
      <section className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-sm font-medium text-primary">{t("family_dashboard")}</p>
              <h1 className="mt-2 text-3xl font-bold">{local(tree.name_en, tree.name_ar)}</h1>
              {!tree.is_owner && (
                <p className="mt-2 text-muted-foreground">{t("contributor_dashboard_intro")}</p>
              )}
            </div>
            <div className="flex gap-2">
              {tree.is_owner && (
                <Button variant="outline" onClick={() => setInviteOpen(true)}>
                  <MailPlus className="me-2 h-4 w-4" />
                  {t("invite_contributor")}
                </Button>
              )}
              <Button asChild>
                <Link
                  to="/tree/$id"
                  params={{ id: tree.id }}
                  search={{ mode: tree.is_owner ? "edit" : "view" }}
                >
                  {t("edit")}
                </Link>
              </Button>
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
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{tree.is_owner ? t("branches") : t("assigned_branch")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(tree.is_owner ? branches : assigned ? [assigned] : []).map((branch) => (
                <div
                  key={branch.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium">{local(branch.name_en, branch.name_ar)}</p>
                    <p className="text-sm text-muted-foreground">
                      {branch.contributor_name_en
                        ? local(branch.contributor_name_en, branch.contributor_name_ar)
                        : t("tree_owner")}
                    </p>
                  </div>
                  <Badge variant={branch.status === "active" ? "default" : "secondary"}>
                    {branch.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          {tree.is_owner && (
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
                            disabled={Boolean(invitationAction)}
                            onClick={() => void actOnInvitation(item.id, "resend")}
                          >
                            <RotateCw className="me-1 h-3.5 w-3.5" />
                            {t("resend_invitation")}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
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
            <CardHeader>
              <CardTitle>{t("activity_history")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activity.slice(0, 12).map((row, index) => (
                <div
                  key={`${row.created_at}-${index}`}
                  className="flex items-center gap-3 border-b pb-3 last:border-0"
                >
                  <Activity className="h-4 w-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {row.action_type.replaceAll("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
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
            <CardContent>
              <Badge className="mb-4">{authenticityLabel}</Badge>
              <p className="text-sm text-muted-foreground">{t("family_backed_explanation")}</p>
              <dl className="mt-5 space-y-3 text-sm">
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
          {tree.is_owner && (
            <Card>
              <CardHeader>
                <CardTitle>{t("owner_controls")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>{t("invite_contributor")}</p>
                <p>{t("pending_invitations")}</p>
                <p>{t("authenticity")}</p>
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
          await load();
        }}
      />
    </main>
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
  const submit = async () => {
    setError("");
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
          <Button onClick={() => void submit()} disabled={!branch || !member || !email.trim()}>
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
          {loading && <p className="px-3 py-2 text-sm text-muted-foreground">{t("loading")}</p>}
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
