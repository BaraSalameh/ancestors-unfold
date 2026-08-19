import { ArrowLeft, ListChecks, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useI18n } from "@/shared/i18n";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  ContributorRemovalDialog,
  InviteDialog,
  type ContributorRemovalController,
  type DashboardInvitationsController,
} from "@/features/collaboration";
import type { BranchesData } from "../pages/branches-page";
import { BranchEditor } from "./branch-editor";
import { PendingBranchInvitations } from "./pending-branch-invitations";
import { BulkBranchActions } from "./bulk-branch-actions";

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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(() => new Set());
  const selected = props.data.branches.find(({ id }) => id === props.selectedId);
  const selectedBranches = props.data.branches.filter(({ id }) => selectedBranchIds.has(id));
  const local = (en?: string | null, ar?: string | null) =>
    lang === "ar" ? ar || en || "" : en || ar || "";
  const clearSelection = () => {
    setSelectedBranchIds(new Set());
    setSelectionMode(false);
  };
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
      {owner && selectedBranches.length ? (
        <BulkBranchActions
          branches={selectedBranches}
          tree={props.data.tree}
          treeDirty={props.treeDirty}
          onSaved={props.onSaved}
          onClear={clearSelection}
        />
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <BranchList
          branches={props.data.branches}
          selectedId={props.selectedId}
          setSelectedId={props.setSelectedId}
          local={local}
          owner={owner}
          selectionMode={selectionMode}
          onEnterSelectionMode={() => setSelectionMode(true)}
          onExitSelectionMode={clearSelection}
          selectedBranchIds={selectedBranchIds}
          setSelectedBranchIds={setSelectedBranchIds}
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
  owner,
  selectionMode,
  onEnterSelectionMode,
  onExitSelectionMode,
  selectedBranchIds,
  setSelectedBranchIds,
}: {
  branches: Props["data"]["branches"];
  selectedId?: string;
  setSelectedId: Props["setSelectedId"];
  local: (en?: string | null, ar?: string | null) => string;
  owner: boolean;
  selectionMode: boolean;
  onEnterSelectionMode: () => void;
  onExitSelectionMode: () => void;
  selectedBranchIds: Set<string>;
  setSelectedBranchIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const { t } = useI18n();
  const allSelected = branches.length > 0 && branches.every(({ id }) => selectedBranchIds.has(id));
  const toggle = (id: string) =>
    setSelectedBranchIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Card className="h-fit">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t("branches")}</CardTitle>
          {owner && branches.length ? (
            <Button
              type="button"
              size="sm"
              variant={selectionMode ? "ghost" : "outline"}
              onClick={selectionMode ? onExitSelectionMode : onEnterSelectionMode}
            >
              {!selectionMode ? <ListChecks aria-hidden="true" /> : null}
              {t(selectionMode ? "cancel" : "select_branches")}
            </Button>
          ) : null}
        </div>
        {owner && selectionMode && branches.length ? (
          <label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
            <input
              type="checkbox"
              checked={allSelected}
              aria-checked={selectedBranchIds.size > 0 && !allSelected ? "mixed" : allSelected}
              onChange={() =>
                setSelectedBranchIds(
                  allSelected ? new Set() : new Set(branches.map(({ id }) => id)),
                )
              }
              className="h-4 w-4 accent-primary"
            />
            {t("select_all_branches")}
          </label>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {branches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("no_assigned_branches")}</p>
        ) : null}
        {branches.map((branch) => (
          <BranchListRow
            key={branch.id}
            branch={branch}
            local={local}
            owner={owner}
            selectionMode={selectionMode}
            selected={selectedBranchIds.has(branch.id)}
            editorSelected={selectedId === branch.id}
            onToggle={() => toggle(branch.id)}
            onOpen={() => setSelectedId(branch.id)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function BranchListRow({
  branch,
  local,
  owner,
  selectionMode,
  selected,
  editorSelected,
  onToggle,
  onOpen,
}: {
  branch: Props["data"]["branches"][number];
  local: (en?: string | null, ar?: string | null) => string;
  owner: boolean;
  selectionMode: boolean;
  selected: boolean;
  editorSelected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const selectedStyle = selectionMode
    ? selected
      ? "border-primary bg-primary/10"
      : ""
    : editorSelected
      ? "border-primary bg-primary/5"
      : "";
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border p-3 hover:bg-accent ${selectedStyle}`}
    >
      {owner && selectionMode ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`${t("select_branch")}: ${local(branch.name_en, branch.name_ar)}`}
          className="mt-1 h-4 w-4 shrink-0 accent-primary"
        />
      ) : null}
      <button
        type="button"
        onClick={selectionMode ? onToggle : onOpen}
        aria-pressed={selectionMode ? selected : undefined}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-start"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {local(branch.name_en, branch.name_ar)}
          </span>
          <span className="block text-xs text-muted-foreground">
            {t("branch_people_recorded", { count: branch.member_count })}
          </span>
          {branch.contributor_user_id ? (
            <span className="mt-1 block text-xs text-muted-foreground">
              <span className="block truncate">
                {local(branch.contributor_name_en, branch.contributor_name_ar)}
              </span>
              <span className="block truncate" dir="ltr">
                {branch.contributor_email}
              </span>
            </span>
          ) : (
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("branch_no_contributor_assigned")}
            </span>
          )}
        </span>
        <Badge variant={branch.status === "active" ? "default" : "secondary"}>
          {t(branch.status === "active" ? "branch_active" : "branch_inactive")}
        </Badge>
      </button>
    </div>
  );
}
