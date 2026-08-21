import { ApiClientError } from "@/shared/api/client";

function exportFilename(treeName: string | null | undefined) {
  const printableName = [...(treeName ?? "")]
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("");
  const safeName = printableName
    .trim()
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return safeName ? `family-tree-${safeName}.csv` : "family-tree.csv";
}

export async function downloadFamilyCsv(treeId: string, treeName: string | null | undefined) {
  const response = await fetch(`/api/trees/${treeId}/exports/csv`, { credentials: "include" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as unknown;
    const code =
      payload &&
      typeof payload === "object" &&
      "code" in payload &&
      typeof payload.code === "string"
        ? payload.code
        : "REQUEST_FAILED";
    throw new ApiClientError(code, response.status, payload);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFilename(treeName);
  link.click();
  URL.revokeObjectURL(url);
}
