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
import { memberMatchesPaternalSearch, memberPaternalSearchLabel } from "../domain/member-display";
import type { FamilyMember } from "../domain/types";

export function MemberSearchPicker({
  value,
  options,
  members,
  onChange,
  disabled,
}: {
  value: string;
  options: FamilyMember[];
  members: FamilyMember[];
  onChange: (memberId: string) => void;
  disabled?: boolean;
}) {
  const { lang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find(({ id }) => id === value);
  const membersById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );
  const results = useMemo(
    () => options.filter((member) => memberMatchesPaternalSearch(member, membersById, query)),
    [membersById, options, query],
  );
  const labels = (member: FamilyMember) => ({
    primary: memberPaternalSearchLabel(member, membersById, lang),
    alternate: memberPaternalSearchLabel(member, membersById, lang === "ar" ? "en" : "ar"),
  });
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
            {selected ? labels(selected).primary : t("search_placeholder")}
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
                    <span className="min-w-0">
                      <span className="block truncate">{labels(member).primary}</span>
                      {labels(member).alternate !== labels(member).primary && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {labels(member).alternate}
                        </span>
                      )}
                    </span>
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
