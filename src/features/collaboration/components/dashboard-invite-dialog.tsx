import { useEffect, useId, useState } from "react";
import { z } from "zod";
import { ApiClientError, validatedApiRequest } from "@/shared/api/client";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { LoadingStatus } from "@/shared/ui/page-skeletons";
import { Skeleton } from "@/shared/ui/skeleton";
import { useI18n } from "@/shared/i18n";
import { memberPaternalSearchLabel } from "@/features/members/domain";
import type { FamilyMember } from "@/features/members/domain";
import type { SearchOption } from "../pages/dashboard-types";
import { invitationErrorKey, isValidInvitationEmail } from "../domain/invitation-email";
import { invitationCreatedResponseSchema, searchOptionSchema } from "../client/response-schemas";

function optionLabel(option: SearchOption, lang: "en" | "ar") {
  const member = inviteSearchMember(option);
  return memberPaternalSearchLabel(member, inviteSearchMembers(option, member), lang);
}

function inviteSearchMember(option: SearchOption): FamilyMember {
  return {
    id: option.id,
    name_en: option.name_en ?? "",
    name_ar: option.name_ar ?? "",
    gender: "male",
    citizen_status: "resident",
    birth_date: option.birth_year ? `${option.birth_year}-01-01` : undefined,
    father_id: option.father_id ?? undefined,
    created_at: "",
    updated_at: "",
  };
}

function inviteSearchMembers(option: SearchOption, member: FamilyMember) {
  const relatives: FamilyMember[] = [member];
  const add = (
    id: string | null | undefined,
    nameEn: string | null | undefined,
    nameAr: string | null | undefined,
    fatherId?: string | null,
  ) => {
    if (!id) return;
    relatives.push({
      id,
      name_en: nameEn ?? "",
      name_ar: nameAr ?? "",
      gender: "male",
      citizen_status: "resident",
      father_id: fatherId ?? undefined,
      created_at: "",
      updated_at: "",
    });
  };
  add(option.father_id, option.father_name_en, option.father_name_ar, option.grandfather_id);
  add(
    option.grandfather_id,
    option.grandfather_name_en,
    option.grandfather_name_ar,
    option.great_grandfather_id,
  );
  add(
    option.great_grandfather_id,
    option.great_grandfather_name_en,
    option.great_grandfather_name_ar,
  );
  return new Map(relatives.map((relative) => [relative.id, relative]));
}

function SearchPicker({
  treeId,
  value,
  onSelect,
}: {
  treeId: string;
  value?: SearchOption;
  onSelect: (value: SearchOption | undefined) => void;
}) {
  const { t, lang } = useI18n();
  const inputId = useId();
  const resultsId = `${inputId}-results`;
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
      void validatedApiRequest(
        z.array(searchOptionSchema),
        `/api/trees/${treeId}/invitable-members?q=${encodeURIComponent(query.trim())}`,
        { signal: controller.signal },
      )
        .then((options) => {
          if (!controller.signal.aborted) setResults(options);
        })
        .catch(() => {
          if (!controller.signal.aborted) setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, treeId]);
  const display = (option: SearchOption) => optionLabel(option, lang);
  const alternate = (option: SearchOption) => optionLabel(option, lang === "ar" ? "en" : "ar");
  return (
    <div className="relative">
      <Label htmlFor={inputId}>{t("select_family_member")}</Label>
      <Input
        id={inputId}
        className="mt-2"
        value={value ? display(value) : query}
        placeholder={t("search_family_member")}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={resultsId}
        aria-expanded={!value && query.trim().length >= 2}
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
        <div
          id={resultsId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {loading && (
            <div className="space-y-2 px-3 py-2">
              <LoadingStatus label={t("loading")} />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">{t("no_search_results")}</p>
          )}
          {results.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={false}
              className="block w-full rounded-sm px-3 py-2 text-start text-sm hover:bg-accent"
              onClick={() => {
                onSelect(option);
                setQuery("");
                setResults([]);
              }}
            >
              <span className="block font-medium">{display(option)}</span>
              {alternate(option) !== display(option) && (
                <span className="block text-xs text-muted-foreground">{alternate(option)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function InviteDialog({
  open,
  onOpenChange,
  treeId,
  onSent,
  initialBranch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treeId: string;
  onSent: () => Promise<void>;
  initialBranch?: SearchOption;
}) {
  const { t } = useI18n();
  const emailInputId = useId();
  const [branch, setBranch] = useState<SearchOption>();
  const [member, setMember] = useState<SearchOption>();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (open) {
      if (initialBranch) setBranch(initialBranch);
      return;
    }
    setMember(undefined);
    setEmail("");
    setError("");
  }, [initialBranch, open]);
  const submit = async () => {
    if (submitting) return;
    if (!isValidInvitationEmail(email)) {
      setError(t("invalid_email_address"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await validatedApiRequest(
        invitationCreatedResponseSchema,
        `/api/trees/${treeId}/invitations`,
        {
          method: "POST",
          body: { email, branchId: branch?.id, existingFamilyMemberId: member?.id },
        },
      );
      await onSent();
    } catch (requestError) {
      setError(
        t(
          invitationErrorKey(
            requestError instanceof ApiClientError ? requestError.code : undefined,
          ),
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("invite_contributor")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor={emailInputId}>{t("email")}</Label>
            <Input
              id={emailInputId}
              className="mt-2"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <SearchPicker treeId={treeId} value={member} onSelect={setMember} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            loading={submitting}
            onClick={() => void submit()}
            disabled={!branch || !member || !email.trim()}
          >
            {t("send_invitation")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
