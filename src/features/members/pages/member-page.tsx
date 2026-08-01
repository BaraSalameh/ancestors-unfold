import { Link, useParams, useSearch } from "@tanstack/react-router";
import { ArrowLeft, Edit, TriangleAlert, User } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  familyStore,
  getChildren,
  getGeneration,
  useFamily,
  useFamilyLoadState,
} from "@/features/trees";
import { ExpandableProfileImage, type FamilyMember } from "@/features/members";
import { displayName, useI18n } from "@/shared/i18n";
import { TreeLoadingIndicator } from "@/shared/ui/page-skeletons";
import {
  memberDetailsSearch,
  memberReturnDestination,
  type MemberNavigationContext,
} from "../domain/member-navigation";
import { ancestorConnector } from "../domain/member-display";

export function MemberPage() {
  const { id } = useParams({ from: "/member/$id" });
  const {
    treeId: requestedTreeId,
    returnMode,
    returnPreview,
  } = useSearch({
    from: "/member/$id",
  });
  if (requestedTreeId) familyStore.activateTree(requestedTreeId, returnMode);
  const loadState = useFamilyLoadState();
  const members = useFamily();
  const { t, lang, dir } = useI18n();

  const member = members.find((m) => m.id === id);
  const draftImageSrc = familyStore.getMemberImageSrc(id);
  const treeId = requestedTreeId ?? familyStore.getActiveTreeId();
  const navigationContext: MemberNavigationContext = { treeId, returnMode, returnPreview };
  const canEdit = familyStore.canEditActiveTree();
  if (requestedTreeId && (loadState === "loading" || loadState === "idle"))
    return <TreeLoadingIndicator label={t("loading_tree")} />;
  if (requestedTreeId && loadState === "error")
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-6 text-center">
        <div>
          <TriangleAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">{t("tree_unavailable")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("tree_unavailable_hint")}</p>
        </div>
      </div>
    );
  if (!member) return <div className="p-8 text-center text-muted-foreground">{t("not_found")}</div>;

  const father = member.father_id ? members.find((m) => m.id === member.father_id) : undefined;
  const mother = member.mother_id ? members.find((m) => m.id === member.mother_id) : undefined;

  // Collect spouse IDs from explicit links and also from children (mothers/fathers of children)
  const spouseIds = new Set<string>();
  if (member.spouse_id) spouseIds.add(member.spouse_id);
  if (member.spouse_ids) {
    for (const id of member.spouse_ids) spouseIds.add(id);
  }
  // For males: also add mothers of their children
  if (member.gender === "male") {
    for (const m of members) {
      if (m.father_id === member.id && m.mother_id) spouseIds.add(m.mother_id);
    }
  }
  // For females: also add fathers of their children
  if (member.gender === "female") {
    for (const m of members) {
      if (m.mother_id === member.id && m.father_id) spouseIds.add(m.father_id);
    }
  }

  const spouses = Array.from(spouseIds)
    .map((sid) => members.find((m) => m.id === sid))
    .filter((m): m is FamilyMember => !!m);
  const children = getChildren(members, member.id);
  const generation = getGeneration(members, member.id);

  const ancestors: FamilyMember[] = [];
  let cur = member;
  while (cur.father_id) {
    const next = members.find((m) => m.id === cur.father_id);
    if (!next) break;
    ancestors.push(next);
    cur = next;
  }

  const descendants = (() => {
    const out: { m: FamilyMember; depth: number }[] = [];
    const walk = (pid: string, d: number) => {
      for (const c of getChildren(members, pid)) {
        out.push({ m: c, depth: d });
        walk(c.id, d + 1);
      }
    };
    walk(member.id, 1);
    return out;
  })();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link {...memberReturnDestination(navigationContext)}>
            <ArrowLeft className="ltr:mr-2 rtl:ml-2 h-4 w-4" />
            {t("back")}
          </Link>
        </Button>
        {canEdit && (
          <Button asChild size="sm" variant="outline">
            <Link to="/edit/$id" params={{ id: member.id }} search={{ returnPreview }}>
              <Edit className="ltr:mr-2 rtl:ml-2 h-4 w-4" />
              {t("edit")}
            </Link>
          </Button>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-start gap-6 sm:flex-row">
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-muted">
            {draftImageSrc ? (
              <ExpandableProfileImage
                src={draftImageSrc}
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
              <Badge>
                {t(member.gender === "unspecified" ? "gender_unspecified" : member.gender)}
              </Badge>
              <Badge>{member.death_date ? t("deceased") : t("living")}</Badge>
              <Badge>
                {member.citizen_status === "non_resident" ? t("non_resident") : t("resident")}
              </Badge>
              <Badge>
                {t("generation")}: {generation}
              </Badge>
            </div>
          </div>
        </div>

        <Section title={t("basic_info")}>
          <Field label={t("birth_date")} value={member.birth_date ?? "—"} />
          <Field label={t("death_date")} value={member.death_date ?? "—"} />
          <Field
            label={t("citizen_status")}
            value={member.citizen_status === "non_resident" ? t("non_resident") : t("resident")}
          />
        </Section>

        {member.notes && (
          <Section title={t("notes")}>
            <p className="text-sm leading-relaxed text-card-foreground">{member.notes}</p>
          </Section>
        )}

        <Section title={t("father") + " / " + t("mother")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <RelCard label={t("father")} m={father} navigation={navigationContext} />
            <RelCard label={t("mother")} m={mother} navigation={navigationContext} />
          </div>
        </Section>

        <Section title={t("spouses") ?? t("spouse")}>
          {spouses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("none")}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {spouses.map((s) => {
                const divorced = (member.divorced_from ?? []).includes(s.id);
                return (
                  <div key={s.id} className="relative">
                    <RelCard label="" m={s} navigation={navigationContext} />
                    <div className="mt-1 flex gap-1 text-[10px]">
                      {s.is_unknown && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                          {t("unknown_wife") ?? "Unknown"}
                        </span>
                      )}
                      {divorced && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                          {t("divorced") ?? "Divorced"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title={t("children")}>
          {children.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("none")}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {children.map((c) => (
                <RelCard key={c.id} label="" m={c} navigation={navigationContext} />
              ))}
            </div>
          )}
        </Section>

        <Section title={t("ancestors")}>
          {ancestors.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("none")}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {ancestors.map((a, i) => (
                <span key={a.id} className="flex items-center gap-2">
                  <Link
                    to="/member/$id"
                    params={{ id: a.id }}
                    search={memberDetailsSearch(navigationContext)}
                    className="rounded-md border px-2 py-1 hover:bg-accent"
                  >
                    {displayName(a, lang)}
                  </Link>
                  {i < ancestors.length - 1 && (
                    <span className="text-muted-foreground">{ancestorConnector(dir)}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </Section>

        <Section title={t("descendants")}>
          {descendants.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("none")}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {descendants.map(({ m, depth }) => (
                <li key={m.id} style={{ paddingInlineStart: depth * 16 }}>
                  <Link
                    to="/member/$id"
                    params={{ id: m.id }}
                    search={memberDetailsSearch(navigationContext)}
                    className="hover:underline"
                  >
                    {"• "}
                    {displayName(m, lang)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border bg-muted px-2.5 py-0.5 text-muted-foreground">
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 border-t pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-card-foreground">{value}</div>
    </div>
  );
}

function RelCard({
  label,
  m,
  navigation,
}: {
  label: string;
  m?: FamilyMember;
  navigation: MemberNavigationContext;
}) {
  const { t, lang } = useI18n();
  if (!m) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        {label && <div className="text-xs text-muted-foreground">{label}</div>}
        {t("none")}
      </div>
    );
  }
  return (
    <Link
      to="/member/$id"
      params={{ id: m.id }}
      search={memberDetailsSearch(navigation)}
      className="block rounded-lg border bg-background p-3 text-sm hover:bg-accent"
    >
      {label && <div className="text-xs text-muted-foreground">{label}</div>}
      <div className="font-medium text-foreground">{displayName(m, lang)}</div>
      <div className="text-xs text-muted-foreground">{m.birth_date?.slice(0, 4) ?? "—"}</div>
    </Link>
  );
}
