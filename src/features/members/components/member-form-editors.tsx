import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Search,
  Plus,
  X,
  HelpCircle,
  UserPlus,
  Trash2,
  Heart,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { useI18n, displayName, ordinal, type Lang } from "@/lib/i18n";
import { familyStore } from "@/lib/family-store";
import type {
  CitizenStatus,
  ExternalChild,
  FamilyMember,
  Gender,
  MemberInput,
} from "@/lib/family-types";
import { wifeColorFor } from "@/lib/wife-colors";

export function RelationSearch({
  label,
  value,
  onChange,
  options,
  lang,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: FamilyMember[];
  lang: Lang;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((m) => m.id === value);
  const normalizedQuery = query.trim().toLowerCase();
  const results = normalizedQuery
    ? options.filter(
        (m) =>
          m.name_en.toLowerCase().includes(normalizedQuery) || m.name_ar.includes(query.trim()),
      )
    : options;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={selected ? "truncate" : "truncate text-muted-foreground"}>
              {selected ? displayName(selected, lang) : t("search_placeholder")}
            </span>
            <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t("search_placeholder")}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandGroup>
                <CommandItem
                  value="__none"
                  onSelect={() => {
                    onChange("");
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <Check className={`me-2 h-4 w-4 ${value ? "opacity-0" : "opacity-100"}`} />
                  {t("no_father")}
                </CommandItem>
              </CommandGroup>
              {results.length === 0 ? (
                <CommandEmpty>{t("no_results")}</CommandEmpty>
              ) : (
                <CommandGroup>
                  {results.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={m.id}
                      onSelect={() => {
                        onChange(m.id);
                        setQuery("");
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={`me-2 h-4 w-4 ${value === m.id ? "opacity-100" : "opacity-0"}`}
                      />
                      <span className="truncate">{displayName(m, lang)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Spouse ordering, unknown-spouse creation, and relationship selection share one transactional editor.
// eslint-disable-next-line max-lines-per-function
export function SpousesEditor({
  maleId,
  allMembers,
}: {
  maleId: string;
  allMembers: FamilyMember[];
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const male = allMembers.find((m) => m.id === maleId) ?? familyStore.get(maleId);
  const linkedIds = useMemo(() => {
    const s = new Set<string>();
    for (const id of male?.spouse_ids ?? []) s.add(id);
    if (male?.spouse_id) s.add(male.spouse_id);
    // Also anyone who is a mother of male's children.
    for (const m of allMembers) {
      if (m.father_id === maleId && m.mother_id) s.add(m.mother_id);
    }
    return s;
  }, [male, allMembers, maleId]);

  const wives = useMemo(
    () =>
      [...linkedIds]
        .map((id) => allMembers.find((m) => m.id === id) ?? familyStore.get(id))
        .filter((m): m is FamilyMember => !!m),
    [linkedIds, allMembers],
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allMembers
      .filter((m) => m.gender === "female" && !m.is_unknown)
      .filter((m) => m.name_en.toLowerCase().includes(q) || m.name_ar.includes(query.trim()))
      .slice(0, 10);
  }, [query, allMembers]);

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <Heart className="h-4 w-4 text-pink-500" />
        <Label className="text-sm font-semibold">{t("spouses")}</Label>
      </div>

      {wives.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {wives.map((w, i) => {
            const c = wifeColorFor(i);
            return (
              <div
                key={w.id}
                className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm"
                style={{ borderColor: `${c.stroke}55` }}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: c.stroke }}
                />
                <span className="text-xs opacity-70">{ordinal(i + 1, lang)}</span>
                {w.is_unknown ? (
                  <span className="inline-flex items-center gap-1 italic text-muted-foreground">
                    <HelpCircle className="h-3 w-3" />
                    {t("unknown_wife")}
                  </span>
                ) : (
                  <span className="truncate">{displayName(w, lang)}</span>
                )}
                {w.birth_date && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {w.birth_date.slice(0, 4)}
                    {w.death_date ? `â€“${w.death_date.slice(0, 4)}` : ""}
                  </span>
                )}
                <div className="ms-auto flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => familyStore.reorderSpouse(maleId, w.id, -1)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
                    title={t("move_spouse_up")}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={i === wives.length - 1}
                    onClick={() => familyStore.reorderSpouse(maleId, w.id, 1)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
                    title={t("move_spouse_down")}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => familyStore.removeSpouse(maleId, w.id)}
                  className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title={t("remove_wife")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="gap-1.5">
              <Search className="h-3.5 w-3.5" />
              {t("add_spouse_existing")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={t("search_spouse")}
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {query.trim() ? (
                  searchResults.length === 0 ? (
                    <CommandEmpty>{t("no_results")}</CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {searchResults.map((m) => {
                        const already = linkedIds.has(m.id);
                        return (
                          <CommandItem
                            key={m.id}
                            value={m.id}
                            disabled={already}
                            onSelect={() => {
                              if (already) return;
                              familyStore.addSpouse(maleId, m.id);
                              setQuery("");
                              setOpen(false);
                            }}
                            className={already ? "opacity-50" : ""}
                          >
                            <div className="flex w-full items-center gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm">{displayName(m, lang)}</div>
                                <div className="truncate text-[11px] text-muted-foreground">
                                  {lang === "ar" ? m.name_en : m.name_ar}
                                </div>
                              </div>
                              {already && (
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  {t("already_wife")}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )
                ) : (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    {t("search_spouse")}
                  </div>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="gap-1.5"
          onClick={() => familyStore.addUnknownSpouse(maleId)}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          {t("add_spouse_unknown")}
        </Button>
      </div>
    </div>
  );
}

export function ExternalChildrenEditor({
  value,
  onChange,
}: {
  value: ExternalChild[];
  onChange: (v: ExternalChild[]) => void;
}) {
  const { t } = useI18n();

  const add = () =>
    onChange([...value, { id: crypto.randomUUID(), name: "", other_parent_name: "" }]);
  const patch = (id: string, p: Partial<ExternalChild>) =>
    onChange(value.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const remove = (id: string) => onChange(value.filter((c) => c.id !== id));

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Label className="flex items-center gap-1.5 text-sm font-semibold">
            <UserPlus className="h-4 w-4 text-amber-600" />
            {t("external_children")}
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">{t("external_children_desc")}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={add} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {t("add_row")}
        </Button>
      </div>

      {value.length > 0 && (
        <div className="flex flex-col gap-2">
          {value.map((c) => (
            <div
              key={c.id}
              className="grid gap-2 rounded-md border bg-card p-2 sm:grid-cols-[1fr_1fr_auto]"
            >
              <Input
                value={c.name}
                onChange={(e) => patch(c.id, { name: e.target.value })}
                placeholder={t("child_name")}
              />
              <Input
                value={c.other_parent_name ?? ""}
                onChange={(e) => patch(c.id, { other_parent_name: e.target.value })}
                placeholder={t("other_parent")}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => remove(c.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
