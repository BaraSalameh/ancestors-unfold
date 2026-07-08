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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
} from "lucide-react";
import { useI18n, displayName, ordinal, type Lang } from "@/lib/i18n";
import { familyStore } from "@/lib/family-store";
import type {
  ExternalChild,
  FamilyMember,
  Gender,
  MemberInput,
} from "@/lib/family-types";
import { wifeColorFor } from "@/lib/wife-colors";

export function MemberForm({
  initial,
  memberId,
  members,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: Partial<MemberInput>;
  /** When editing, id of the member being edited. Enables spouse editor. */
  memberId?: string;
  members: FamilyMember[];
  onSubmit: (data: MemberInput) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const { t, lang } = useI18n();
  const [name_en, setNameEn] = useState(initial?.name_en ?? "");
  const [name_ar, setNameAr] = useState(initial?.name_ar ?? "");
  const [gender, setGender] = useState<Gender>(initial?.gender ?? "male");
  const [birth_date, setBirth] = useState(initial?.birth_date ?? "");
  const [death_date, setDeath] = useState(initial?.death_date ?? "");
  const [image_url, setImage] = useState(initial?.image_url ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [father_id, setFather] = useState(initial?.father_id ?? "");
  const [mother_id, setMother] = useState(initial?.mother_id ?? "");
  const [spouse_id, setSpouse] = useState(initial?.spouse_id ?? "");
  const [external_children, setExternalChildren] = useState<ExternalChild[]>(
    initial?.external_children ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  const males = members.filter((m) => m.gender === "male" && !m.is_unknown);
  const females = members.filter((m) => m.gender === "female" && !m.is_unknown);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name_en.trim() && !name_ar.trim()) {
      setError(t("name_required"));
      return;
    }
    onSubmit({
      name_en: name_en.trim(),
      name_ar: name_ar.trim(),
      gender,
      birth_date: birth_date || undefined,
      death_date: death_date || undefined,
      image_url: image_url.trim() || undefined,
      notes: notes.trim() || undefined,
      father_id: father_id || undefined,
      mother_id: mother_id || undefined,
      spouse_id: spouse_id || undefined,
      external_children: external_children.length ? external_children : undefined,
    });
  };

  const showSpouseEditor = gender === "male" && !!memberId;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name_en">{t("name_en")}</Label>
          <Input
            id="name_en"
            value={name_en}
            onChange={(e) => setNameEn(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name_ar">{t("name_ar")}</Label>
          <Input
            id="name_ar"
            value={name_ar}
            onChange={(e) => setNameAr(e.target.value)}
            dir="rtl"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>{t("gender")}</Label>
          <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">{t("male")}</SelectItem>
              <SelectItem value="female">{t("female")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="birth">{t("birth_date")}</Label>
          <Input
            id="birth"
            type="date"
            value={birth_date}
            onChange={(e) => setBirth(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="death">{t("death_date")}</Label>
          <Input
            id="death"
            type="date"
            value={death_date}
            onChange={(e) => setDeath(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="img">{t("image_url")}</Label>
        <Input
          id="img"
          value={image_url}
          onChange={(e) => setImage(e.target.value)}
          placeholder="https://…"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <RelationSelect
          label={t("father")}
          value={father_id}
          onChange={setFather}
          options={males}
          lang={lang}
        />
        <RelationSelect
          label={t("mother")}
          value={mother_id}
          onChange={setMother}
          options={females}
          lang={lang}
        />
        {!showSpouseEditor && (
          <RelationSelect
            label={t("spouse")}
            value={spouse_id}
            onChange={setSpouse}
            options={gender === "male" ? females : males}
            lang={lang}
          />
        )}
      </div>

      {showSpouseEditor && memberId && (
        <SpousesEditor maleId={memberId} allMembers={members} />
      )}

      {gender === "female" && (
        <ExternalChildrenEditor
          value={external_children}
          onChange={setExternalChildren}
        />
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Textarea
          id="notes"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}

function RelationSelect({
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
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value || "__none"}
        onValueChange={(v) => onChange(v === "__none" ? "" : v)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">{t("no_father")}</SelectItem>
          {options.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {displayName(m, lang)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SpousesEditor({
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
    if (male?.spouse_id) s.add(male.spouse_id);
    for (const id of male?.spouse_ids ?? []) s.add(id);
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
      .filter(
        (m) =>
          m.name_en.toLowerCase().includes(q) ||
          m.name_ar.includes(query.trim()),
      )
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
                    {w.death_date ? `–${w.death_date.slice(0, 4)}` : ""}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => familyStore.removeSpouse(maleId, w.id)}
                  className="ms-auto rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
                                <div className="truncate text-sm">
                                  {displayName(m, lang)}
                                </div>
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

function ExternalChildrenEditor({
  value,
  onChange,
}: {
  value: ExternalChild[];
  onChange: (v: ExternalChild[]) => void;
}) {
  const { t } = useI18n();

  const add = () =>
    onChange([
      ...value,
      { id: crypto.randomUUID(), name: "", other_parent_name: "" },
    ]);
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
          <p className="mt-1 text-xs text-muted-foreground">
            {t("external_children_desc")}
          </p>
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
