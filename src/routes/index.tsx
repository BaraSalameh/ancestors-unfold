import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity, ArrowUpRight, CalendarDays, Eye, GitBranch, MoreHorizontal, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useI18n } from "@/lib/i18n";
import { familyStore } from "@/lib/family-store";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard | Ancestors Unfold" }, { name: "description", content: "Manage and explore your family trees." }] }),
  component: Dashboard,
});

type TreeRecord = { id: string; name: string; description: string; members: number; generations: number; updatedAt: string; color: string };
const initialTrees: TreeRecord[] = [
  { id: "al-rashid", name: "Al-Rashid Family", description: "Our main family lineage, beginning in 1920.", members: 11, generations: 4, updatedAt: "Today", color: "from-emerald-500 to-teal-700" },
  { id: "al-mansour", name: "Al-Mansour Family", description: "Maternal ancestry and connected relatives.", members: 27, generations: 5, updatedAt: "2 days ago", color: "from-amber-400 to-orange-600" },
  { id: "hassan", name: "Hassan Family", description: "The Hassan branch and its descendants.", members: 18, generations: 3, updatedAt: "May 24, 2026", color: "from-sky-500 to-indigo-700" },
];
const KEY = "ancestors-unfold:trees:v1";

function Dashboard() {
  const { t, dir } = useI18n();
  const [trees, setTrees] = useState<TreeRecord[]>(() => {
    if (typeof window === "undefined") return initialTrees;
    try { return JSON.parse(localStorage.getItem(KEY) || "null") || initialTrees; } catch { return initialTrees; }
  });
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TreeRecord | null>(null);
  const [deleting, setDeleting] = useState<TreeRecord | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const saveTrees = (next: TreeRecord[]) => { setTrees(next); localStorage.setItem(KEY, JSON.stringify(next)); };
  const filtered = useMemo(() => trees.filter((t) => `${t.name} ${t.description}`.toLowerCase().includes(query.toLowerCase())), [trees, query]);
  const members = trees.reduce((sum, t) => sum + t.members, 0);
  const openCreate = () => { setName(""); setDescription(""); setCreateOpen(true); };
  const openEdit = (tree: TreeRecord) => { setName(tree.name); setDescription(tree.description); setEditing(tree); };
  const submit = () => {
    if (!name.trim()) return;
    if (editing) saveTrees(trees.map((tree) => tree.id === editing.id ? { ...tree, name: name.trim(), description: description.trim(), updatedAt: t("just_now") } : tree));
    else {
      const id = crypto.randomUUID();
      familyStore.initializeTree(id);
      saveTrees([{ id, name: name.trim(), description: description.trim() || t("new_family_story"), members: 0, generations: 0, updatedAt: t("just_now"), color: "from-violet-500 to-fuchsia-700" }, ...trees]);
    }
    setEditing(null); setCreateOpen(false);
  };

  return <main className="min-h-[calc(100vh-3.5rem)] bg-muted/25">
    <section className="border-b bg-card">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div><p className="mb-2 text-sm font-medium text-primary">{t("family_archive")}</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("welcome_back_adam")}</h1><p className="mt-2 max-w-xl text-muted-foreground">{t("dashboard_intro")}</p></div>
          <Button size="lg" onClick={openCreate} className="gap-2 self-start"><Plus className="h-4 w-4" />{t("create_family_tree")}</Button>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Stat icon={GitBranch} label={t("family_trees")} value={trees.length} detail={t("across_account")} />
          <Stat icon={Users} label={t("people_recorded")} value={members} detail={t("in_all_trees")} />
          <Stat icon={Activity} label={t("latest_activity")} value={t("today")} detail={t("family_updated")} />
        </div>
      </div>
    </section>
    <section className="mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-xl font-semibold">{t("your_family_trees")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("manage_family_history")}</p></div><div className="relative w-full sm:w-72"><Search className={`absolute top-2.5 h-4 w-4 text-muted-foreground ${dir === "rtl" ? "right-3" : "left-3"}`} /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search_family_trees")} className={dir === "rtl" ? "pr-9" : "pl-9"} /></div></div>
      {filtered.length ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{filtered.map((tree) => <article key={tree.id} className="group overflow-hidden rounded-xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div className={`relative h-32 bg-gradient-to-br ${tree.color}`}><div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, white 0 2px, transparent 3px), radial-gradient(circle at 65% 55%, white 0 3px, transparent 4px)", backgroundSize: "52px 52px" }} /><GitBranch className="absolute bottom-4 start-5 h-9 w-9 text-white/90" /><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="secondary" className="absolute end-3 top-3 h-8 w-8 bg-white/90"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openEdit(tree)}><Pencil className="me-2 h-4 w-4" />{t("rename_update")}</DropdownMenuItem><DropdownMenuItem onClick={() => setDeleting(tree)} className="text-destructive"><Trash2 className="me-2 h-4 w-4" />{t("delete")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
        <div className="p-5"><h3 className="text-lg font-semibold">{tree.name}</h3><p className="mt-1 line-clamp-2 h-10 text-sm text-muted-foreground">{tree.description}</p><div className="mt-4 flex gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{tree.members} {t("members_count")}</span><span className="flex items-center gap-1"><GitBranch className="h-3.5 w-3.5" />{tree.generations} {t("generations_count")}</span></div><div className="mt-4 flex items-center justify-between border-t pt-4"><span className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{tree.updatedAt}</span><div className="flex gap-1"><Button asChild size="sm" variant="ghost"><Link to="/tree/$id" params={{ id: tree.id }} search={{ mode: "preview" }}><Eye className="me-1 h-4 w-4" />{t("preview")}</Link></Button><Button asChild size="sm"><Link to="/tree/$id" params={{ id: tree.id }} search={{ mode: "edit" }}>{t("edit")}<ArrowUpRight className="ms-1 h-3.5 w-3.5" /></Link></Button></div></div></div>
      </article>)}</div> : <div className="rounded-xl border border-dashed bg-card py-16 text-center"><Search className="mx-auto h-8 w-8 text-muted-foreground" /><h3 className="mt-3 font-medium">{t("no_trees_found")}</h3><p className="mt-1 text-sm text-muted-foreground">{t("no_trees_hint")}</p></div>}
    </section>
    <Dialog open={createOpen || !!editing} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditing(null); } }}><DialogContent><DialogHeader><DialogTitle>{editing ? t("update_family_tree") : t("create_tree_title")}</DialogTitle><DialogDescription>{editing ? t("update_tree_desc") : t("create_tree_desc")}</DialogDescription></DialogHeader><div className="space-y-4"><div><label className="mb-1.5 block text-sm font-medium">{t("family_name")}</label><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("family_name_example")} /></div><div><label className="mb-1.5 block text-sm font-medium">{t("description")} <span className="font-normal text-muted-foreground">{t("optional")}</span></label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("tree_note_placeholder")} /></div></div><DialogFooter><Button variant="outline" onClick={() => { setCreateOpen(false); setEditing(null); }}>{t("cancel")}</Button><Button onClick={submit} disabled={!name.trim()}>{editing ? t("save_changes") : t("create_tree")}</Button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("delete_tree_title")} {deleting?.name}</AlertDialogTitle><AlertDialogDescription>{t("delete_tree_desc")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("cancel")}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { if (deleting) { familyStore.deleteTreeData(deleting.id); saveTrees(trees.filter((tree) => tree.id !== deleting.id)); } setDeleting(null); }}>{t("delete_family_tree")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}

function Stat({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: string | number; detail: string }) {
  return <div className="flex items-center gap-4 rounded-xl border bg-background p-4"><div className="rounded-lg bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div><div><p className="text-2xl font-semibold leading-none">{value}</p><p className="mt-1 text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{detail}</p></div></div>;
}
