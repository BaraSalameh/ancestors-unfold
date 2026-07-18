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

import {
  ExternalChildrenEditor,
  RelationSearch,
  SpousesEditor,
} from "@/features/members/components/member-form-editors";
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
  const [citizen_status, setCitizenStatus] = useState<CitizenStatus>(
    initial?.citizen_status ?? "resident",
  );
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
    const payload: MemberInput = {
      name_en: name_en.trim(),
      name_ar: name_ar.trim(),
      gender,
      citizen_status,
      birth_date: birth_date || undefined,
      death_date: death_date || undefined,
      image_url: image_url.trim() || undefined,
      notes: notes.trim() || undefined,
      father_id: father_id || undefined,
      mother_id: mother_id || undefined,
      external_children: external_children.length ? external_children : undefined,
    };

    if (!showSpouseEditor) {
      payload.spouse_id = spouse_id || undefined;
    }

    onSubmit(payload);
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

      <div className="grid gap-4 sm:grid-cols-4">
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
          <Label>{t("citizen_status")}</Label>
          <Select
            value={citizen_status}
            onValueChange={(v) => setCitizenStatus(v as CitizenStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="resident">{t("resident")}</SelectItem>
              <SelectItem value="non_resident">{t("non_resident")}</SelectItem>
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
        <RelationSearch
          label={t("father")}
          value={father_id}
          onChange={setFather}
          options={males}
          lang={lang}
        />
        <RelationSearch
          label={t("mother")}
          value={mother_id}
          onChange={setMother}
          options={females}
          lang={lang}
        />
        {!showSpouseEditor && (
          <RelationSearch
            label={t("spouse")}
            value={spouse_id}
            onChange={setSpouse}
            options={gender === "male" ? females : males}
            lang={lang}
          />
        )}
      </div>

      {showSpouseEditor && memberId && <SpousesEditor maleId={memberId} allMembers={members} />}

      {gender === "female" && (
        <ExternalChildrenEditor value={external_children} onChange={setExternalChildren} />
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Textarea id="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
