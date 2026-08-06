import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { COUNTRY_CODES, countryName } from "@/shared/domain/countries";
import { useI18n } from "@/shared/i18n";
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

export function CountryCombobox({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const countries = useMemo(
    () =>
      COUNTRY_CODES.map((code) => ({
        code,
        en: countryName(code, "en"),
        ar: countryName(code, "ar"),
      })).sort((a, b) => a[lang].localeCompare(b[lang], lang)),
    [lang],
  );
  const selected = value ? countryName(value, lang) : t("country_not_selected");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={!value ? "text-muted-foreground" : undefined}>{selected}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder={t("search_countries")} />
          <CommandList>
            <CommandEmpty>{t("no_results")}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={t("country_not_selected")}
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={`h-4 w-4 ${value ? "opacity-0" : "opacity-100"}`} />
                {t("country_not_selected")}
              </CommandItem>
              {countries.map((country) => (
                <CommandItem
                  key={country.code}
                  value={`${country.code} ${country.en} ${country.ar}`}
                  onSelect={() => {
                    onChange(country.code);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`h-4 w-4 ${value === country.code ? "opacity-100" : "opacity-0"}`}
                  />
                  <span>{country[lang]}</span>
                  <span className="ms-auto text-xs text-muted-foreground">{country.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
