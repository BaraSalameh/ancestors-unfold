import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { familyStore, useFamily } from "@/lib/family-store";
import { displayName, useI18n } from "@/lib/i18n";
import type { SubFamily } from "@/lib/family-types";

// This controller preserves the intertwined home/manage modes while its data operations are extracted.
// eslint-disable-next-line max-lines-per-function, complexity
export function SubfamilyPanel({
  selectedSubfamilyId,
  onSelectSubfamily,
  filterEnabled,
  onToggleFilter,
  mode = "manage",
  hideHeading = false,
}: {
  selectedSubfamilyId: string | null;
  onSelectSubfamily: (id: string | null) => void;
  filterEnabled: boolean;
  onToggleFilter: (enabled: boolean) => void;
  mode?: "home" | "manage";
  hideHeading?: boolean;
}) {
  const { t, lang } = useI18n();
  const members = useFamily();
  const [newName, setNewName] = useState("");
  const [maleSearch, setMaleSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNameEn, setDraftNameEn] = useState("");
  const [draftNameAr, setDraftNameAr] = useState("");
  const [draftMaleId, setDraftMaleId] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentType, setAttachmentType] = useState("Document");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const subfamilies = familyStore.getSubfamilies();
  const maleMembers = members.filter((member) => member.gender === "male");

  const selected = selectedSubfamilyId
    ? subfamilies.find((sf) => sf.id === selectedSubfamilyId)
    : null;
  const selectedMembers = selectedSubfamilyId
    ? familyStore.getSubfamilyMembers(selectedSubfamilyId)
    : [];
  const livingMembers = selectedMembers.filter((member) => !member.death_date);
  const maleCount = selectedMembers.filter((member) => member.gender === "male").length;
  const femaleCount = selectedMembers.filter((member) => member.gender === "female").length;
  const livingMaleCount = livingMembers.filter((member) => member.gender === "male").length;
  const livingFemaleCount = livingMembers.filter((member) => member.gender === "female").length;
  const linkedMale = selected?.linked_male_id
    ? (maleMembers.find((member) => member.id === selected.linked_male_id) ?? null)
    : null;
  const isHomeMode = mode === "home";

  const handleAddSubfamily = () => {
    const name = newName.trim();
    if (!name) return;

    const created = familyStore.addSubfamily(name, name);
    setNewName("");
    setMaleSearch("");
    onSelectSubfamily(created.id);
    setEditingId(null);
  };

  const startEdit = (subfamily: SubFamily) => {
    setEditingId(subfamily.id);
    setDraftNameEn(subfamily.name_en);
    setDraftNameAr(subfamily.name_ar);
    setDraftMaleId(subfamily.linked_male_id ?? "");
    const linked = maleMembers.find((member) => member.id === subfamily.linked_male_id);
    setMaleSearch(linked ? displayName(linked, lang) : "");
  };

  const handleSaveEdit = () => {
    if (!selected) return;

    const nextNameEn = draftNameEn.trim();
    const nextNameAr = draftNameAr.trim();
    if (!nextNameEn && !nextNameAr) return;

    const matchedMale = maleMembers.find((member) => {
      const candidate = displayName(member, lang).toLowerCase();
      return (
        candidate === maleSearch.trim().toLowerCase() ||
        member.name_en.toLowerCase() === maleSearch.trim().toLowerCase() ||
        member.name_ar === maleSearch.trim()
      );
    });

    familyStore.updateSubfamily(selected.id, {
      name_en: nextNameEn || selected.name_en,
      name_ar: nextNameAr || selected.name_ar,
      linked_male_id: matchedMale?.id ?? (draftMaleId || undefined),
    });
    setEditingId(null);
  };

  const handleDeleteSubfamily = () => {
    if (!selected) return;
    familyStore.deleteSubfamily(selected.id);
    onSelectSubfamily(null);
    setEditingId(null);
  };

  const handleAddAttachment = () => {
    if (!selected || !attachmentName.trim() || !attachmentUrl.trim()) return;
    const nextAttachments = [
      ...(selected.attachments ?? []),
      {
        id: crypto.randomUUID(),
        name: attachmentName.trim(),
        type: attachmentType.trim() || "Document",
        url: attachmentUrl.trim(),
        created_at: new Date().toISOString(),
      },
    ];
    familyStore.updateSubfamily(selected.id, { attachments: nextAttachments });
    setAttachmentName("");
    setAttachmentType("Document");
    setAttachmentUrl("");
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    if (!selected) return;
    const nextAttachments = (selected.attachments ?? []).filter(
      (attachment) => attachment.id !== attachmentId,
    );
    familyStore.updateSubfamily(selected.id, { attachments: nextAttachments });
  };

  const toggleSelection = (subfamilyId: string) => {
    if (selectedSubfamilyId === subfamilyId) {
      onSelectSubfamily(null);
      onToggleFilter(false);
      return;
    }
    onSelectSubfamily(subfamilyId);
    onToggleFilter(true);
  };

  if (selectedSubfamilyId && selected && isHomeMode) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => {
            onSelectSubfamily(null);
            onToggleFilter(false);
          }}
          className="text-xs hover:underline"
        >
          â† {t("back")}
        </button>
        <h3 className="font-semibold text-card-foreground">{displayName(selected, lang)}</h3>
        <div className="space-y-1 text-[10px] text-muted-foreground">
          <div className="flex justify-between">
            <span>{t("subfamily_total")}:</span>
            <span className="font-medium">{selectedMembers.length}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("subfamily_living")}:</span>
            <span className="font-medium">{livingMembers.length}</span>
          </div>
        </div>
      </div>
    );
  }

  if (selectedSubfamilyId && selected && !isHomeMode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => onSelectSubfamily(null)} className="text-xs hover:underline">
            â† {t("back")}
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => startEdit(selected)}
              className="rounded border p-1 text-muted-foreground hover:bg-accent"
              title={t("edit")}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleDeleteSubfamily}
              className="rounded border p-1 text-muted-foreground hover:bg-accent"
              title={t("delete")}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {editingId === selected.id ? (
          <div className="space-y-2 rounded border bg-background/50 p-2">
            <input
              type="text"
              value={draftNameEn}
              onChange={(event) => setDraftNameEn(event.target.value)}
              placeholder={t("name_en")}
              className="w-full rounded border bg-background px-2 py-1 text-[10px]"
            />
            <input
              type="text"
              value={draftNameAr}
              onChange={(event) => setDraftNameAr(event.target.value)}
              placeholder={t("name_ar")}
              className="w-full rounded border bg-background px-2 py-1 text-[10px]"
            />
            <input
              type="text"
              value={maleSearch}
              onChange={(event) => {
                setMaleSearch(event.target.value);
                const matched = maleMembers.find((member) => {
                  const candidate = displayName(member, lang).toLowerCase();
                  return (
                    candidate === event.target.value.trim().toLowerCase() ||
                    member.name_en.toLowerCase() === event.target.value.trim().toLowerCase() ||
                    member.name_ar === event.target.value.trim()
                  );
                });
                setDraftMaleId(matched?.id ?? "");
              }}
              placeholder={t("search_male")}
              className="w-full rounded border bg-background px-2 py-1 text-[10px]"
              list="subfamily-male-list"
            />
            <datalist id="subfamily-male-list">
              {maleMembers.map((member) => (
                <option key={member.id} value={displayName(member, lang)} />
              ))}
            </datalist>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handleSaveEdit}
                className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground"
              >
                {t("save")}
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="rounded border px-2 py-1 text-[10px]"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="font-semibold text-card-foreground">{displayName(selected, lang)}</h3>
            {linkedMale ? (
              <div className="text-[10px] text-muted-foreground">
                {t("linked_male")}:{" "}
                <span className="font-medium text-foreground">{displayName(linkedMale, lang)}</span>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {[
                ["subfamily_total", selectedMembers.length],
                ["subfamily_living", livingMembers.length],
                ["subfamily_living_males", livingMaleCount],
                ["subfamily_living_females", livingFemaleCount],
                ["subfamily_males", maleCount],
                ["subfamily_females", femaleCount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border bg-card p-2 shadow-sm">
                  <div className="text-lg font-bold leading-none text-foreground">{value}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {t(label as Parameters<typeof t>[0])}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 rounded border bg-background/50 p-2">
              <div className="text-[10px] font-semibold text-card-foreground">
                {t("add_attachment")}
              </div>
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  value={attachmentName}
                  onChange={(event) => setAttachmentName(event.target.value)}
                  placeholder={t("attachment_name")}
                  className="w-full rounded border bg-background px-2 py-1 text-[10px]"
                />
                <input
                  type="text"
                  value={attachmentType}
                  onChange={(event) => setAttachmentType(event.target.value)}
                  placeholder={t("attachment_type")}
                  className="w-full rounded border bg-background px-2 py-1 text-[10px]"
                />
                <input
                  type="text"
                  value={attachmentUrl}
                  onChange={(event) => setAttachmentUrl(event.target.value)}
                  placeholder={t("attachment_url")}
                  className="w-full rounded border bg-background px-2 py-1 text-[10px]"
                />
                <button
                  type="button"
                  onClick={handleAddAttachment}
                  disabled={!attachmentName.trim() || !attachmentUrl.trim()}
                  className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground disabled:opacity-50"
                >
                  {t("add_attachment")}
                </button>
              </div>
              {(selected.attachments?.length ?? 0) === 0 ? (
                <p className="text-[10px] text-muted-foreground">{t("no_attachments")}</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {(selected.attachments ?? []).map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1"
                    >
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-primary underline-offset-2 hover:underline"
                      >
                        {attachment.name} ({attachment.type})
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(attachment.id)}
                        className="text-[10px] text-muted-foreground hover:text-destructive"
                        title={t("delete")}
                      >
                        Ã—
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!hideHeading && <div className="font-semibold text-card-foreground">{t("subfamilies")}</div>}
      {subfamilies.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">{t("none")}</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {subfamilies.map((sf) => {
            const count = familyStore.getSubfamilyMembers(sf.id).length;
            return (
              <button
                key={sf.id}
                onClick={() => (isHomeMode ? toggleSelection(sf.id) : onSelectSubfamily(sf.id))}
                className={`h-6 rounded-md border bg-background px-2 py-0.5 text-[10px] hover:bg-accent ${selectedSubfamilyId === sf.id ? "border-primary bg-primary/10 text-primary" : ""}`}
              >
                {displayName(sf, lang)} ({count})
              </button>
            );
          })}
        </div>
      )}
      {!isHomeMode ? (
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyPress={(event) => event.key === "Enter" && handleAddSubfamily()}
              placeholder={t("add_subfamily")}
              className="flex-1 rounded border bg-background px-2 py-1 text-[10px]"
            />
            <button
              type="button"
              onClick={handleAddSubfamily}
              disabled={!newName.trim()}
              className="rounded border bg-primary px-2 py-1 text-[10px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              +
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">{t("select_linked_male")}</p>
        </div>
      ) : null}
    </div>
  );
}
