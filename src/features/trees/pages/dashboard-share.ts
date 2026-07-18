export function treePreviewUrl(treeId: string, origin: string): string {
  const url = new URL(`/tree/${encodeURIComponent(treeId)}`, origin);
  url.searchParams.set("mode", "preview");
  return url.toString();
}

export async function copyTreePreviewUrl(
  treeId: string,
  origin: string,
  clipboard: Pick<Clipboard, "writeText">,
): Promise<string> {
  const url = treePreviewUrl(treeId, origin);
  await clipboard.writeText(url);
  return url;
}
