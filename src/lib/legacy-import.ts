const TREES_KEY = "ancestors-unfold:trees:v1";
const IMPORT_KEY = "ancestors-unfold:postgres-import:v1";

export async function importLegacyLocalStorage(): Promise<void> {
  if (typeof window === "undefined" || localStorage.getItem(IMPORT_KEY)) return;
  const rawTrees = localStorage.getItem(TREES_KEY);
  if (!rawTrees) { localStorage.setItem(IMPORT_KEY, JSON.stringify({ status: "nothing_to_import", at: new Date().toISOString() })); return; }
  let trees: any[]; try { trees = JSON.parse(rawTrees); } catch { return; }
  const imported: Array<{ sourceId: string; treeId: string; batchId: string }> = [];
  for (const tree of trees) {
    const membersRaw = localStorage.getItem(`family-tree-hub:tree:${tree.id}:members:v1`) ?? (tree.id === "al-rashid" ? localStorage.getItem("family-tree-hub:v1") : null);
    const subfamiliesRaw = localStorage.getItem(`family-tree-hub:tree:${tree.id}:subfamilies:v1`) ?? (tree.id === "al-rashid" ? localStorage.getItem("family-tree-hub:subfamilies:v1") : null);
    const created = await fetch("/api/trees", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ name_en: tree.name_en || tree.name, name_ar: tree.name_ar, description_en: tree.description_en || tree.description, description_ar: tree.description_ar, color: tree.color }) });
    if (!created.ok) throw new Error("Legacy tree import failed");
    const serverTree = await created.json(); const batchId = crypto.randomUUID();
    const snapshot = await fetch(`/api/trees/${serverTree.id}/snapshot`, { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ batchId, expectedVersion: serverTree.version ?? 1, members: membersRaw ? JSON.parse(membersRaw) : [], subfamilies: subfamiliesRaw ? JSON.parse(subfamiliesRaw) : [] }) });
    if (!snapshot.ok || !(await snapshot.json()).reconciled) throw new Error("Legacy snapshot reconciliation failed");
    imported.push({ sourceId: tree.id, treeId: serverTree.id, batchId });
  }
  // Preserve all original keys. This marker records successful reconciliation only.
  localStorage.setItem(IMPORT_KEY, JSON.stringify({ status: "complete", at: new Date().toISOString(), imported }));
}
