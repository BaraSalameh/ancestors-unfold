import type { Lang, TranslationKey, TranslationValues } from "@/locales";

type Translate = (key: TranslationKey, values?: TranslationValues) => string;
type ActivityPerson = { userId: string | null; nameEn: string; nameAr: string };
type ActivityNamedTarget = { nameEn: string | null; nameAr: string | null };

export type ActivityItem = {
  id: string;
  actionType: string;
  actor: ActivityPerson | null;
  subject: ActivityPerson | null;
  target: ActivityNamedTarget & { type: string; id: string | null };
  branchId: string | null;
  branch: ActivityNamedTarget | null;
  createdAt: string;
  editingSession: {
    firstVersion: number;
    lastVersion: number;
    snapshotCount: number;
    endedAt: string;
  } | null;
};

export type ActivityPageResponse = {
  items: ActivityItem[];
  nextCursor: string | null;
};

const activityLabels: Record<string, TranslationKey> = {
  tree_created: "activity_tree_created",
  tree_updated: "activity_tree_updated",
  tree_metadata_updated: "activity_tree_metadata_updated",
  branch_created: "activity_branch_created",
  branch_updated: "activity_branch_updated",
  branch_activated: "activity_branch_activated",
  branch_deactivated: "activity_branch_deactivated",
  invitation_sent: "activity_invitation_sent",
  invitation_resent: "activity_invitation_resent",
  invitation_cancelled: "activity_invitation_cancelled",
  invitation_accepted: "activity_invitation_accepted",
  contributor_removed: "activity_contributor_removed",
  contributor_account_deleted: "activity_contributor_account_deleted",
  ownership_transfer_requested: "activity_ownership_transfer_requested",
  ownership_transfer_verified: "activity_ownership_transfer_verified",
  ownership_transfer_accepted: "activity_ownership_transfer_accepted",
  ownership_transfer_rejected: "activity_ownership_transfer_rejected",
  ownership_transfer_cancelled: "activity_ownership_transfer_cancelled",
};

const localizedName = (person: ActivityPerson | ActivityNamedTarget | null, lang: Lang) => {
  if (!person) return "";
  return lang === "ar"
    ? person.nameAr || person.nameEn || ""
    : person.nameEn || person.nameAr || "";
};

export function activityLabel(actionType: string, t: Translate): string {
  const key = activityLabels[actionType];
  return key ? t(key) : actionType.replaceAll("_", " ");
}

export function activityDescription(item: ActivityItem, lang: Lang, t: Translate): string {
  const key = activityLabels[item.actionType];
  if (!key) return item.actionType.replaceAll("_", " ");
  return t(key, {
    actor: localizedName(item.actor, lang) || t("activity_unknown_actor"),
    subject: localizedName(item.subject, lang) || t("activity_unknown_subject"),
    target: localizedName(item.target, lang) || t("activity_unknown_target"),
    branch: localizedName(item.branch, lang),
    count: item.editingSession?.snapshotCount ?? 1,
  });
}
