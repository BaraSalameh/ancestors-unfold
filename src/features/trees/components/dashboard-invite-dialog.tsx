import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { LoadingStatus } from "@/shared/ui/page-skeletons";
import { Skeleton } from "@/shared/ui/skeleton";
import { useI18n } from "@/shared/i18n";
import { memberSearchLabel } from "@/features/members";
import type { SearchOption } from "../pages/dashboard-types";

function optionLabel(option: SearchOption, lang: "en" | "ar") {
  return memberSearchLabel(
    { name_en: option.name_en ?? "", name_ar: option.name_ar ?? "", birth_year: option.birth_year },
    lang,
  );
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
      void fetch(`/api/trees/${treeId}/invitable-members?q=${encodeURIComponent(query.trim())}`, {
        credentials: "include",
        signal: controller.signal,
      })
        .then(async (response) => (response.ok ? ((await response.json()) as SearchOption[]) : []))
        .then(setResults)
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, treeId]);
  const display = (option: SearchOption) => optionLabel(option, lang);
  return (
    <div className="relative">
      <Label>{t("select_family_member")}</Label>
      <Input
        className="mt-2"
        value={value ? display(value) : query}
        placeholder={t("search_family_member")}
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
        <div className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
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
              className="block w-full rounded-sm px-3 py-2 text-start text-sm hover:bg-accent"
              onClick={() => {
                onSelect(option);
                setQuery("");
                setResults([]);
              }}
            >
              {display(option)}
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
  const [branch, setBranch] = useState<SearchOption>();
  const [member, setMember] = useState<SearchOption>();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (open && initialBranch) setBranch(initialBranch);
  }, [initialBranch, open]);
  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/trees/${treeId}/invitations`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, branchId: branch?.id, existingFamilyMemberId: member?.id }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { code?: string };
        setError(
          body.code === "INVITEE_ALREADY_REGISTERED"
            ? t("existing_user_invitation_error")
            : body.code === "BRANCH_ALREADY_ASSIGNED"
              ? t("branch_already_has_contributor")
              : t("auth_error"),
        );
        return;
      }
      await onSent();
    } catch {
      setError(t("auth_error"));
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
            <Label>{t("email")}</Label>
            <Input
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
