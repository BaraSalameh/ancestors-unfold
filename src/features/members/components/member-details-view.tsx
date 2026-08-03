import { Link } from "@tanstack/react-router";
import { ArrowLeft, Edit, User } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { displayName, useI18n } from "@/shared/i18n";
import { ExpandableProfileImage } from "../ui/expandable-profile-image";
import { ancestorConnector } from "../domain/member-display";
import { isMemberDeceased } from "../domain/member-status";
import {
  memberDetailsSearch,
  memberReturnDestination,
  type MemberNavigationContext,
} from "../domain/member-navigation";
import type { DescendantEntry } from "../domain/member-details";
import type { FamilyMember } from "../domain/types";

interface MemberDetailsViewProps {
  member: FamilyMember;
  father?: FamilyMember;
  mother?: FamilyMember;
  spouses: FamilyMember[];
  children: FamilyMember[];
  ancestors: FamilyMember[];
  descendants: DescendantEntry[];
  generation: number;
  imageSrc?: string;
  canEdit: boolean;
  navigation: MemberNavigationContext;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 border-t pt-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}

function EmptyValue() {
  const { t } = useI18n();
  return <p className="text-sm text-muted-foreground">{t("none")}</p>;
}

function RelationshipCard({
  label,
  member,
  navigation,
}: {
  label?: string;
  member?: FamilyMember;
  navigation: MemberNavigationContext;
}) {
  const { t, lang } = useI18n();
  if (!member) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        {label && <div className="text-xs">{label}</div>}
        {t("none")}
      </div>
    );
  }
  return (
    <Link
      to="/member/$id"
      params={{ id: member.id }}
      search={memberDetailsSearch(navigation)}
      className="block rounded-lg border bg-background p-3 text-sm hover:bg-accent"
    >
      {label && <div className="text-xs text-muted-foreground">{label}</div>}
      <div className="font-medium text-foreground">{displayName(member, lang)}</div>
      <div className="text-xs text-muted-foreground">{member.birth_date?.slice(0, 4) ?? "—"}</div>
    </Link>
  );
}

function MemberToolbar({
  memberId,
  canEdit,
  navigation,
}: {
  memberId: string;
  canEdit: boolean;
  navigation: MemberNavigationContext;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-4 flex items-center justify-between">
      <Button asChild variant="ghost" size="sm">
        <Link {...memberReturnDestination(navigation)}>
          <ArrowLeft className="ltr:mr-2 rtl:ml-2 h-4 w-4" />
          {t("back")}
        </Link>
      </Button>
      {canEdit && (
        <Button asChild size="sm" variant="outline">
          <Link
            to="/edit/$id"
            params={{ id: memberId }}
            search={{ returnPreview: navigation.returnPreview }}
          >
            <Edit className="ltr:mr-2 rtl:ml-2 h-4 w-4" />
            {t("edit")}
          </Link>
        </Button>
      )}
    </div>
  );
}

function DetailBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border bg-muted px-2.5 py-0.5 text-muted-foreground">
      {children}
    </span>
  );
}

function MemberIdentity({
  member,
  imageSrc,
  generation,
}: {
  member: FamilyMember;
  imageSrc?: string;
  generation: number;
}) {
  const { t, lang } = useI18n();
  return (
    <div className="flex flex-col items-start gap-6 sm:flex-row">
      <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-muted">
        {imageSrc ? (
          <ExpandableProfileImage
            src={imageSrc}
            name={displayName(member, lang)}
            className="h-full w-full rounded-2xl"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <User className="h-12 w-12" />
          </div>
        )}
      </div>
      <div className="flex-1">
        <h1 className="text-3xl font-bold text-foreground">{displayName(member, lang)}</h1>
        <p className="text-lg text-muted-foreground" dir={lang === "ar" ? "ltr" : "rtl"}>
          {lang === "ar" ? member.name_en : member.name_ar}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <DetailBadge>{t(member.gender)}</DetailBadge>
          <DetailBadge>{t(isMemberDeceased(member) ? "deceased" : "living")}</DetailBadge>
          <DetailBadge>
            {t(member.citizen_status === "non_resident" ? "non_resident" : "resident")}
          </DetailBadge>
          <DetailBadge>
            {t("generation")}: {generation}
          </DetailBadge>
        </div>
      </div>
    </div>
  );
}

function SpouseSection({
  member,
  spouses,
  navigation,
}: {
  member: FamilyMember;
  spouses: FamilyMember[];
  navigation: MemberNavigationContext;
}) {
  const { t } = useI18n();
  return (
    <DetailSection title={t("spouses") ?? t("spouse")}>
      {spouses.length === 0 ? (
        <EmptyValue />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {spouses.map((spouse) => (
            <div key={spouse.id}>
              <RelationshipCard member={spouse} navigation={navigation} />
              <div className="mt-1 flex gap-1 text-[10px]">
                {spouse.is_unknown && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    {t("unknown_wife") ?? "Unknown"}
                  </span>
                )}
                {(member.divorced_from ?? []).includes(spouse.id) && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    {t("divorced") ?? "Divorced"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </DetailSection>
  );
}

function AncestorSection({
  ancestors,
  navigation,
}: {
  ancestors: FamilyMember[];
  navigation: MemberNavigationContext;
}) {
  const { t, lang, dir } = useI18n();
  return (
    <DetailSection title={t("ancestors")}>
      {ancestors.length === 0 ? (
        <EmptyValue />
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {ancestors.map((ancestor, index) => (
            <span key={ancestor.id} className="flex items-center gap-2">
              <Link
                to="/member/$id"
                params={{ id: ancestor.id }}
                search={memberDetailsSearch(navigation)}
                className="rounded-md border px-2 py-1 hover:bg-accent"
              >
                {displayName(ancestor, lang)}
              </Link>
              {index < ancestors.length - 1 && (
                <span className="text-muted-foreground">{ancestorConnector(dir)}</span>
              )}
            </span>
          ))}
        </div>
      )}
    </DetailSection>
  );
}

function DescendantSection({
  descendants,
  navigation,
}: {
  descendants: DescendantEntry[];
  navigation: MemberNavigationContext;
}) {
  const { t, lang } = useI18n();
  return (
    <DetailSection title={t("descendants")}>
      {descendants.length === 0 ? (
        <EmptyValue />
      ) : (
        <ul className="space-y-1 text-sm">
          {descendants.map(({ member, depth }) => (
            <li key={member.id} style={{ paddingInlineStart: depth * 16 }}>
              <Link
                to="/member/$id"
                params={{ id: member.id }}
                search={memberDetailsSearch(navigation)}
                className="hover:underline"
              >
                • {displayName(member, lang)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}

export function MemberDetailsView(props: MemberDetailsViewProps) {
  const { t } = useI18n();
  const { member, navigation } = props;
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <MemberToolbar memberId={member.id} canEdit={props.canEdit} navigation={navigation} />
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <MemberIdentity member={member} imageSrc={props.imageSrc} generation={props.generation} />
        <DetailSection title={t("basic_info")}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">{t("birth_date")}</div>
              {member.birth_date ?? "—"}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("death_date")}</div>
              {member.death_date ?? "—"}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("citizen_status")}</div>
              {t(member.citizen_status === "non_resident" ? "non_resident" : "resident")}
            </div>
          </div>
        </DetailSection>
        {member.notes && (
          <DetailSection title={t("notes")}>
            <p className="text-sm leading-relaxed text-card-foreground">{member.notes}</p>
          </DetailSection>
        )}
        <DetailSection title={`${t("father")} / ${t("mother")}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <RelationshipCard label={t("father")} member={props.father} navigation={navigation} />
            <RelationshipCard label={t("mother")} member={props.mother} navigation={navigation} />
          </div>
        </DetailSection>
        <SpouseSection member={member} spouses={props.spouses} navigation={navigation} />
        <DetailSection title={t("children")}>
          {props.children.length === 0 ? (
            <EmptyValue />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {props.children.map((child) => (
                <RelationshipCard key={child.id} member={child} navigation={navigation} />
              ))}
            </div>
          )}
        </DetailSection>
        <AncestorSection ancestors={props.ancestors} navigation={navigation} />
        <DescendantSection descendants={props.descendants} navigation={navigation} />
      </div>
    </div>
  );
}
