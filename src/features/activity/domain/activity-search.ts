import { translate, type Lang, type TranslationKey } from "@/locales";

const activityActionKeys: Record<string, TranslationKey> = {
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

const searchableLabel = (lang: Lang, key: TranslationKey) =>
  translate(lang, key)
    .replaceAll(/\{[^}]+\}/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase(lang);

export function matchingActivityActionTypes(query: string, locale: Lang): string[] {
  const normalized = query.trim().toLocaleLowerCase(locale).replaceAll("_", " ");
  if (!normalized) return [];
  return Object.entries(activityActionKeys)
    .filter(
      ([actionType, key]) =>
        actionType.replaceAll("_", " ").includes(normalized) ||
        searchableLabel(locale, key).includes(normalized) ||
        searchableLabel(locale === "ar" ? "en" : "ar", key).includes(normalized),
    )
    .map(([actionType]) => actionType);
}
