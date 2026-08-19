import Papa from "papaparse";
import {
  FAMILY_CSV_HEADER_ALIASES,
  FAMILY_CSV_HEADERS,
  FAMILY_CSV_MAX_BYTES,
  FAMILY_CSV_MAX_MEMBERS,
  MAX_REPORTED_ISSUES,
  csvError,
  type CsvRow,
  type FamilyCsvHeader,
  type FamilyCsvIssue,
} from "./family-csv-contract";

const allowedHeaders = new Set<string>([
  ...FAMILY_CSV_HEADERS,
  ...Object.keys(FAMILY_CSV_HEADER_ALIASES),
]);

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function normalizeHeader(value: string, index: number) {
  return (index === 0 ? value.replace(/^\uFEFF/, "") : value).trim().toLowerCase();
}

function canonicalHeader(value: string): FamilyCsvHeader | undefined {
  if ((FAMILY_CSV_HEADERS as readonly string[]).includes(value)) return value as FamilyCsvHeader;
  return FAMILY_CSV_HEADER_ALIASES[value as keyof typeof FAMILY_CSV_HEADER_ALIASES];
}

function validateHeaders(headers: string[]) {
  const issues: FamilyCsvIssue[] = [];
  const seen = new Set<string>();
  const seenCanonical = new Map<FamilyCsvHeader, string>();
  headers.forEach((header, index) => {
    if (!header)
      issues.push(csvError("EMPTY_HEADER", "CSV headers may not be empty.", 1, String(index + 1)));
    if (seen.has(header))
      issues.push(csvError("DUPLICATE_HEADER", `Duplicate header: ${header}.`, 1, header));
    seen.add(header);
    if (!allowedHeaders.has(header))
      issues.push(csvError("UNKNOWN_HEADER", `Unknown header: ${header}.`, 1, header));
    const canonical = canonicalHeader(header);
    const prior = canonical ? seenCanonical.get(canonical) : undefined;
    if (canonical && prior && prior !== header)
      issues.push(
        csvError(
          "AMBIGUOUS_HEADER",
          `Headers ${prior} and ${header} represent the same field; use only one.`,
          1,
          header,
        ),
      );
    else if (canonical) seenCanonical.set(canonical, header);
  });
  for (const required of ["member_ref", "gender"] as const)
    if (!seenCanonical.has(required))
      issues.push(csvError("MISSING_HEADER", `Missing required header: ${required}.`, 1, required));
  if (!seenCanonical.has("name_en") && !seenCanonical.has("name_ar"))
    issues.push(
      csvError("MISSING_NAME_HEADER", "The CSV must include name_en or name_ar.", 1, "name_en"),
    );
  return issues;
}

function emptyRow(): CsvRow {
  return Object.fromEntries(FAMILY_CSV_HEADERS.map((header) => [header, ""])) as CsvRow;
}

function mapRows(data: string[][], headers: string[], issues: FamilyCsvIssue[]) {
  return data.map((cells, rowIndex) => {
    const value = emptyRow();
    headers.forEach((header, columnIndex) => {
      const canonical = canonicalHeader(header);
      if (canonical) value[canonical] = (cells[columnIndex] ?? "").trim();
    });
    if (cells.length > headers.length && cells.slice(headers.length).some((cell) => cell.trim()))
      issues.push(
        csvError("EXTRA_COLUMNS", "This row has more values than the header row.", rowIndex + 2),
      );
    return { row: rowIndex + 2, value };
  });
}

export function readFamilyCsvRows(
  csv: string,
):
  | { ok: true; rows: Array<{ row: number; value: CsvRow }> }
  | { ok: false; issues: FamilyCsvIssue[] } {
  if (byteLength(csv) > FAMILY_CSV_MAX_BYTES)
    return { ok: false, issues: [csvError("FILE_TOO_LARGE", "CSV files may not exceed 10 MiB.")] };
  if (!csv.trim()) return { ok: false, issues: [csvError("EMPTY_FILE", "The CSV file is empty.")] };
  const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: "greedy" });
  const parseIssues = parsed.errors.map((item) =>
    csvError("MALFORMED_CSV", item.message, item.row == null ? undefined : item.row + 1),
  );
  if (parseIssues.length) return { ok: false, issues: parseIssues.slice(0, MAX_REPORTED_ISSUES) };
  if (!parsed.data.length)
    return { ok: false, issues: [csvError("EMPTY_FILE", "The CSV file is empty.")] };
  const headers = parsed.data[0].map(normalizeHeader);
  const issues = validateHeaders(headers);
  if (issues.length) return { ok: false, issues: issues.slice(0, MAX_REPORTED_ISSUES) };
  const dataRows = parsed.data.slice(1);
  if (dataRows.length > FAMILY_CSV_MAX_MEMBERS)
    return {
      ok: false,
      issues: [csvError("TOO_MANY_MEMBERS", "A CSV may contain at most 10,000 members.")],
    };
  if (!dataRows.length)
    return { ok: false, issues: [csvError("NO_MEMBERS", "The CSV contains no member rows.")] };
  const rows = mapRows(dataRows, headers, issues);
  return issues.length
    ? { ok: false, issues: issues.slice(0, MAX_REPORTED_ISSUES) }
    : { ok: true, rows };
}
