import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { useI18n } from "@/shared/i18n";
import { memberSearchLabel } from "../domain/member-display";
import type { FamilyMember } from "../domain/types";

export function MemberSearchPicker({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: FamilyMember[];
  onChange: (memberId: string) => void;
  disabled?: boolean;
}) {
  const { lang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find(({ id }) => id === value);
  const normalized = query.trim().toLocaleLowerCase(lang);
  const results = useMemo(
    () =>
      options.filter((member) => {
        if (!normalized) return true;
        const birthYear = member.birth_date?.slice(0, 4) ?? "";
        return `${member.name_en} ${member.name_ar} ${birthYear}`
          .toLocaleLowerCase(lang)
          .includes(normalized);
      }),
    [lang, normalized, options],
  );
  const select = (memberId: string) => {
    onChange(memberId);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={disabled ? false : open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={selected ? "truncate" : "truncate text-muted-foreground"}>
            {selected ? memberSearchLabel(selected, lang) : t("search_placeholder")}
          </span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("search_placeholder")}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {results.length === 0 ? (
              <CommandEmpty>{t("no_results")}</CommandEmpty>
            ) : (
              <CommandGroup>
                {results.map((member) => (
                  <CommandItem key={member.id} value={member.id} onSelect={() => select(member.id)}>
                    <Check
                      className={`me-2 h-4 w-4 ${value === member.id ? "opacity-100" : "opacity-0"}`}
                    />
                    <span className="truncate">{memberSearchLabel(member, lang)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
