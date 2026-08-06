import { Link } from "@tanstack/react-router";
import { GitBranch } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { displayName, useI18n } from "@/shared/i18n";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { useFamily, useFamilyLoadState } from "../client/family-hooks";
import { familyStore } from "../client/family-store";
import type { Branch, CurrentTree } from "../pages/dashboard-types";
import { BranchDetailsForm } from "./branch-details-form";
import { BranchAttachments } from "./branch-attachments";
import { BranchLifecycleActions } from "./branch-lifecycle-actions";

export type BranchMutation = (
  method: string,
  path: string,
  changes: Record<string, unknown>,
  action: BranchMutationAction,
) => Promise<boolean>;

export type BranchMutationAction = "create" | "details" | "reactivate" | "delete";

interface Props {
  branch?: Branch;
  branches: Branch[];
  tree: CurrentTree;
  treeDirty: boolean;
  readOnly?: boolean;
  onSaved: () => Promise<void>;
  onInvite?: () => void;
  onRemoveContributor?: () => void;
  onCancel?: () => void;
}

export function BranchEditor(props: Props) {
  const { lang, t } = useI18n();
  const members = useFamily();
  const loadState = useFamilyLoadState();
  const mutation = useBranchMutation(props);
  const title = props.branch ? branchName(props.branch, lang) : t("create_branch");
  const branchMembers = props.branch ? familyStore.getSubfamilyMembers(props.branch.id) : [];
  if (props.readOnly)
    return (
      <ReadOnlyBranch
        branch={props.branch}
        members={branchMembers}
        loading={loadState !== "ready"}
        tree={props.tree}
        owner={false}
      />
    );
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        {props.branch ? <OpenCanvasButton branch={props.branch} tree={props.tree} /> : null}
      </CardHeader>
      <CardContent className="space-y-6">
        <BranchDetailsForm
          branch={props.branch}
          branches={props.branches}
          members={members}
          mutate={mutation.mutate}
          saving={mutation.saving}
          onCancel={props.onCancel}
        />
        {props.branch ? (
          <BranchAttachments
            treeId={props.tree.id}
            branchId={props.branch.id}
            active={props.branch.status === "active"}
            owner
          />
        ) : null}
        {props.branch ? (
          <>
            <BranchLifecycleActions
              branch={props.branch}
              mutate={mutation.mutate}
              saving={mutation.saving}
              onInvite={props.onInvite}
              onRemoveContributor={props.onRemoveContributor}
              tree={props.tree}
              members={members}
              onSaved={props.onSaved}
            />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function useBranchMutation({ tree, treeDirty, onSaved }: Props) {
  const { t } = useI18n();
  const [saving, setSaving] = useState<BranchMutationAction>();
  const mutate: BranchMutation = async (method, path, changes, action) => {
    if (treeDirty) {
      toast.error(t("save_tree_before_branch_management"));
      return false;
    }
    setSaving(action);
    try {
      const response = await fetch(`/api/trees/${tree.id}/branches${path}`, {
        method,
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...changes,
          expectedVersion: tree.version,
          batchId: crypto.randomUUID(),
        }),
      });
      const body = (await response.json()) as { code?: string };
      if (!response.ok) {
        const key =
          body.code === "DUPLICATE_BRANCH_NAME"
            ? "duplicate_branch_name"
            : body.code === "DUPLICATE_BRANCH_ROOT"
              ? "duplicate_branch_root"
              : body.code === "BRANCH_IN_USE"
                ? "branch_in_use"
                : body.code === "BRANCH_MUST_BE_INACTIVE"
                  ? "branch_must_be_inactive"
                  : "branch_management_failed";
        toast.error(t(key));
        return false;
      }
      await onSaved();
      return true;
    } catch {
      toast.error(t("branch_management_failed"));
      return false;
    } finally {
      setSaving(undefined);
    }
  };
  return { mutate, saving };
}

function ReadOnlyBranch({
  branch,
  members,
  loading,
  tree,
  owner,
}: {
  branch?: Branch;
  members: ReturnType<typeof useFamily>;
  loading: boolean;
  tree: CurrentTree;
  owner: boolean;
}) {
  const { lang, t } = useI18n();
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{branch ? branchName(branch, lang) : t("branch_details")}</CardTitle>
        {branch ? (
          <Badge variant={branch.status === "active" ? "default" : "secondary"}>
            {t(branch.status === "active" ? "branch_active" : "branch_inactive")}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">{t("branch_read_only_description")}</p>
        <section>
          <h2 className="mb-2 font-semibold">{t("branch_members")}</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {members.map((member) => (
                <Badge key={member.id} variant="outline">
                  {displayName(member, lang)}
                </Badge>
              ))}
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("none")}</p>
              ) : null}
            </div>
          )}
        </section>
        {branch ? (
          <BranchAttachments
            treeId={tree.id}
            branchId={branch.id}
            active={branch.status === "active"}
            owner={owner}
          />
        ) : null}
        {branch ? <OpenCanvasButton branch={branch} tree={tree} /> : null}
      </CardContent>
    </Card>
  );
}

function OpenCanvasButton({ branch, tree }: { branch: Branch; tree: CurrentTree }) {
  const { t } = useI18n();
  if (branch.status !== "active")
    return (
      <Button disabled variant="outline" size="sm">
        <GitBranch aria-hidden="true" />
        {t("open_branch_canvas")}
      </Button>
    );
  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/tree/$id" params={{ id: tree.id }} search={{ mode: "edit", branchId: branch.id }}>
        <GitBranch aria-hidden="true" />
        {t("open_branch_canvas")}
      </Link>
    </Button>
  );
}

function branchName(branch: Branch, lang: "en" | "ar") {
  return lang === "ar" ? branch.name_ar || branch.name_en : branch.name_en || branch.name_ar || "";
}
