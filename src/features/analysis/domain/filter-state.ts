import type { AnalysisFilters, AnalysisQueryDefinition } from "./types";

export function hasActiveAnalysisFilters(filters: AnalysisFilters): boolean {
  return Object.values(filters).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined && value !== "",
  );
}

export function clearAnalysisFilters(definition: AnalysisQueryDefinition): AnalysisQueryDefinition {
  return { ...definition, filters: {} };
}

export function withExcludeWives(
  definition: AnalysisQueryDefinition,
  checked: boolean,
): AnalysisQueryDefinition {
  const filters = { ...definition.filters };
  if (checked) filters.excludeWives = true;
  else delete filters.excludeWives;
  return {
    ...definition,
    filters,
  };
}
