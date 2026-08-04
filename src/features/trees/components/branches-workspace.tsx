import { ArrowLeft, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useI18n } from "@/shared/i18n";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import type { ContributorRemovalController } from "../client/use-contributor-removal";
import type { DashboardInvitationsController } from "../client/use-dashboard-invitations";
import type { BranchesData } from "../pages/branches-page";
import { BranchEditor } from "./branch-editor";
import { InviteDialog } from "./dashboard-invite-dialog";
import { ContributorRemovalDialog } from "./contributor-removal-dialog";
import { PendingBranchInvitations } from "./pending-branch-invitations";

interface Props {
  data: BranchesData;
  selectedId?: string;
  setSelectedId: (id: string | undefined) => void;
  onCancelCreate: () => void;
  treeDirty: boolean;
  invitations: DashboardInvitationsController;
  removal: ContributorRemovalController;
  onSaved: () => Promise<void>;
}

export function BranchesWorkspace(props: Props) {
  const { lang, t } = useI18n();
  const owner = props.data.tree.role === "owner";
  const selected = props.data.branches.find(({ id }) => id === props.selectedId);
  const local = (en?: string | null, ar?: string | null) =>
    lang === "ar" ? ar || en || "" : en || ar || "";
  return (
    <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-7xl px-4 py-7 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-3 -ms-3">
            <Link to="/">
              <ArrowLeft aria-hidden="true" />
              {t("back_to_dashboard")}
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">{t("branches")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(owner ? "subfamilies_manage_desc" : "assigned_subfamily_desc")}
          </p>
        </div>
        {owner ? (
          <Button onClick={() => props.setSelectedId("new")}>
            <Plus aria-hidden="true" />
            {t("create_branch")}
          </Button>
        ) : null}
      </div>
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <BranchList
          branches={props.data.branches}
          selectedId={props.selectedId}
          setSelectedId={props.setSelectedId}
          local={local}
        />
        <SelectedBranchEditor {...props} owner={owner} selected={selected} />
      </div>
      {owner && props.data.invitations.some(({ status }) => status === "pending") ? (
        <PendingBranchInvitations
          invitations={props.data.invitations}
          controller={props.invitations}
          local={local}
        />
      ) : null}
      {selected ? (
        <InviteDialog
          open={props.invitations.inviteOpen}
          onOpenChange={props.invitations.setInviteOpen}
          treeId={props.data.tree.id}
          onSent={props.invitations.sent}
          initialBranch={
            selected
              ? { id: selected.id, name_en: selected.name_en, name_ar: selected.name_ar }
              : undefined
          }
        />
      ) : null}
      <ContributorRemovalDialog controller={props.removal} local={local} />
    </main>
  );
}

function SelectedBranchEditor({
  owner,
  selected,
  ...props
}: Props & { owner: boolean; selected?: Props["data"]["branches"][number] }) {
  const { t } = useI18n();
  if (props.selectedId === "new" && owner)
    return (
      <BranchEditor
        key="new"
        branches={props.data.branches}
        tree={props.data.tree}
        treeDirty={props.treeDirty}
        onSaved={props.onSaved}
        onCancel={props.onCancelCreate}
      />
    );
  if (!selected)
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          {t("no_assigned_branches")}
        </CardContent>
      </Card>
    );
  return (
    <BranchEditor
      key={`${selected.id}:${props.data.tree.version}`}
      branch={selected}
      branches={props.data.branches}
      tree={props.data.tree}
      treeDirty={props.treeDirty}
      readOnly={!owner}
      onSaved={props.onSaved}
      onInvite={() => props.invitations.setInviteOpen(true)}
      onRemoveContributor={() => {
        props.removal.setContributorId(selected.contributor_user_id ?? "");
        props.removal.setOpen(true);
      }}
    />
  );
}

function BranchList({
  branches,
  selectedId,
  setSelectedId,
  local,
}: {
  branches: Props["data"]["branches"];
  selectedId?: string;
  setSelectedId: Props["setSelectedId"];
  local: (en?: string | null, ar?: string | null) => string;
}) {
  const { t } = useI18n();
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>{t("branches")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {branches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("no_assigned_branches")}</p>
        ) : null}
        {branches.map((branch) => (
          <button
            type="button"
            key={branch.id}
            onClick={() => setSelectedId(branch.id)}
            className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-start hover:bg-accent ${selectedId === branch.id ? "border-primary bg-primary/5" : ""}`}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {local(branch.name_en, branch.name_ar)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t("branch_people_recorded", { count: branch.member_count })}
              </span>
            </span>
            <Badge variant={branch.status === "active" ? "default" : "secondary"}>
              {t(branch.status === "active" ? "branch_active" : "branch_inactive")}
            </Badge>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
