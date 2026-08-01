import { useState } from "react";
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
import { Label } from "@/shared/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { displayName, type Lang, useI18n } from "@/shared/i18n";
import { parentDisplayName, searchParentCandidates } from "../domain/parent-selection";
import type { FamilyMember } from "../domain/types";

interface RelationSearchProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FamilyMember[];
  lang: Lang;
  searchFirst?: boolean;
  showBirthYear?: boolean;
  selectedOption?: FamilyMember;
}

export function RelationSearch({
  label,
  value,
  onChange,
  options,
  lang,
  searchFirst = false,
  showBirthYear = false,
  selectedOption,
}: RelationSearchProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((member) => member.id === value) ?? selectedOption;
  const results = searchFirst || query.trim() ? searchParentCandidates(options, query) : options;
  const optionName = (member: FamilyMember) => {
    const name = displayName(member, lang);
    return showBirthYear ? parentDisplayName(member, name) : name;
  };
  const select = (id: string) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };

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
              {selected ? optionName(selected) : t("search_placeholder")}
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
              <CommandGroup>
                <CommandItem value="__none" onSelect={() => select("")}>
                  <Check className={`me-2 h-4 w-4 ${value ? "opacity-0" : "opacity-100"}`} />
                  {t("no_father")}
                </CommandItem>
              </CommandGroup>
              {results.length === 0 ? (
                <CommandEmpty>{t("no_results")}</CommandEmpty>
              ) : (
                <CommandGroup>
                  {results.map((member) => (
                    <CommandItem
                      key={member.id}
                      value={member.id}
                      onSelect={() => select(member.id)}
                    >
                      <Check
                        className={`me-2 h-4 w-4 ${value === member.id ? "opacity-100" : "opacity-0"}`}
                      />
                      <span className="truncate">{optionName(member)}</span>
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
