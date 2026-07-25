export function canUpdateTreeMetadata(role: string | undefined): boolean {
  return role === "owner";
}

export function descriptionPatchValue(value: string | undefined): {
  value: string | null;
  supplied: boolean;
} {
  return {
    value: value || null,
    supplied: value !== undefined,
  };
}
