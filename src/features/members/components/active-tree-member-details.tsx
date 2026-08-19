import { familyStore, useFamily } from "@/features/trees/client";
import { useI18n } from "@/shared/i18n";
import { memberDescendants, memberSpouses, paternalAncestors } from "../domain/member-details";
import type { MemberDetailsNavigationContext } from "../domain/member-navigation";
import { getChildren, getGeneration } from "../domain/queries";
import { MemberDetailsView } from "./member-details-view";

interface ActiveTreeMemberDetailsProps {
  memberId: string;
  navigation: MemberDetailsNavigationContext;
}

export function ActiveTreeMemberDetails(props: ActiveTreeMemberDetailsProps) {
  const members = useFamily();
  const { t } = useI18n();
  const member = members.find((candidate) => candidate.id === props.memberId);
  if (!member) return <div className="p-8 text-center text-muted-foreground">{t("not_found")}</div>;

  return (
    <MemberDetailsView
      member={member}
      father={members.find((candidate) => candidate.id === member.father_id)}
      mother={members.find((candidate) => candidate.id === member.mother_id)}
      spouses={memberSpouses(member, members)}
      children={getChildren(members, member.id)}
      ancestors={paternalAncestors(member, members)}
      descendants={memberDescendants(member, members)}
      generation={getGeneration(members, member.id)}
      imageSrc={familyStore.getMemberImageSrc(member.id)}
      canEdit={familyStore.canEditActiveTree()}
      navigation={props.navigation}
    />
  );
}
