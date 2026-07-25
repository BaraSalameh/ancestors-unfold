import type { TranslationKey } from "@/locales";

type Translate = (key: TranslationKey) => string;

const activityLabels: Record<string, TranslationKey> = {
  tree_created: "activity_tree_created",
  branch_created: "activity_branch_created",
  invitation_sent: "activity_invitation_sent",
  invitation_resent: "activity_invitation_resent",
  invitation_cancelled: "activity_invitation_cancelled",
  invitation_accepted: "activity_invitation_accepted",
};

export function activityLabel(actionType: string, t: Translate): string {
  const key = activityLabels[actionType];
  return key ? t(key) : actionType.replaceAll("_", " ");
}
