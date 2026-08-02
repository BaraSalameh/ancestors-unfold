import { Search } from "lucide-react";
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
import { displayName, useI18n } from "@/shared/i18n";
import type { FamilyMember } from "../domain/types";

interface SpouseSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (query: string) => void;
  results: FamilyMember[];
  linkedIds: Set<string>;
  onSelect: (memberId: string) => void;
}

function SearchResult({
  member,
  alreadyLinked,
  onSelect,
}: {
  member: FamilyMember;
  alreadyLinked: boolean;
  onSelect: () => void;
}) {
  const { t, lang } = useI18n();
  return (
    <CommandItem
      value={member.id}
      disabled={alreadyLinked}
      onSelect={onSelect}
      className={alreadyLinked ? "opacity-50" : ""}
    >
      <div className="flex w-full items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{displayName(member, lang)}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {lang === "ar" ? member.name_en : member.name_ar}
          </div>
        </div>
        {alreadyLinked && (
          <span className="shrink-0 text-[10px] text-muted-foreground">{t("already_wife")}</span>
        )}
      </div>
    </CommandItem>
  );
}

export function SpouseSearch(props: SpouseSearchProps) {
  const { t } = useI18n();
  const hasQuery = Boolean(props.query.trim());
  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
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
            value={props.query}
            onValueChange={props.onQueryChange}
          />
          <CommandList>
            {!hasQuery && (
              <div className="p-3 text-center text-xs text-muted-foreground">
                {t("search_spouse")}
              </div>
            )}
            {hasQuery && props.results.length === 0 && (
              <CommandEmpty>{t("no_results")}</CommandEmpty>
            )}
            {hasQuery && props.results.length > 0 && (
              <CommandGroup>
                {props.results.map((member) => {
                  const linked = props.linkedIds.has(member.id);
                  return (
                    <SearchResult
                      key={member.id}
                      member={member}
                      alreadyLinked={linked}
                      onSelect={() => !linked && props.onSelect(member.id)}
                    />
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
