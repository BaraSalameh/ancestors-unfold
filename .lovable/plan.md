# Plan

Four changes across the tree and the member form.

## 1. Cousin marriage — keep the wife's card

Rule: hide a wife's standalone card only when she is an **outsider** (no father in the tree). If she has a `father_id` that exists in the tree, keep her card visible **but** show only the parent→daughter edge from her father; suppress her own spouse and child edges (those are already visualized through the husband's card / children pointing at the husband).

Implementation in `layout()` inside `FamilyTree.tsx`:
- Build `asWife` as today, then subtract wives whose `father_id` resolves to a rendered member. Only outsider wives get hidden.
- When rendering edges, for a member `m` that is a wife-with-family:
  - Draw her father → her edge (already covered by the parent-edge loop).
  - Skip her spouse edge and skip child→her mother-only edge (the child edge stays from father only; wives' chips still communicate motherhood via color).

## 2. Male edit form — multi-spouse UX

Add a **Spouses** section (male only), replacing the single Spouse dropdown for males.

- Data: extend `FamilyMember` with `spouse_ids?: string[]`. Legacy `spouse_id` is kept for female members and back-compat; on male save we merge `spouse_id` into `spouse_ids`.
- Store: add `familyStore.addSpouse(maleId, femaleId)`, `familyStore.removeSpouse(maleId, femaleId)`, `familyStore.addUnknownSpouse(maleId)` (creates a female "Unknown wife #N" record with `is_unknown: true`).
- `computeWivesByHusband()` also unions `spouse_ids` so wives appear in the husband card even with no children yet.
- Type: add `is_unknown?: boolean` to `FamilyMember` — chips render it as "Unknown" placeholder without a real name and no independent card in the tree.

New Combobox for adding an existing woman:
- Uses shadcn `Command` + `Popover`. Only shows results after the user types (≥1 char). Filters females not already in this husband's wives list; women already linked appear grayed and are not selectable.
- Below the combobox: **"Add unknown spouse"** button → appends a placeholder wife.
- Existing wives render as removable chips (× removes the link; the female record remains unless it was `is_unknown`, in which case it's deleted).

## 3. Female edit form — external children (other family)

Add an **External children** section (female only): a repeatable list stored on the mother.

- Data: `external_children?: { id: string; name: string; other_parent_name?: string; birth_year?: string; notes?: string }[]`.
- Form: add/remove rows with name + outside father name (+ optional year).
- Node card marker: if `external_children?.length > 0`, show a small badge (icon + count) on the female's card and inside her wife-chip. Tooltip lists the names.

## 4. i18n keys

Add: `spouses`, `add_spouse_existing`, `add_spouse_unknown`, `search_spouse`, `unknown_wife`, `already_wife`, `remove_wife`, `external_children`, `external_children_desc`, `child_name`, `other_parent`, `has_external_children`, `add_row`, `remove` — in EN + AR.

## Files touched

- `src/lib/family-types.ts` — `spouse_ids`, `is_unknown`, `external_children`.
- `src/lib/family-store.ts` — `addSpouse`, `removeSpouse`, `addUnknownSpouse`; update `remove()` cleanup for `spouse_ids`.
- `src/lib/wife-colors.ts` — include `spouse_ids` in wife union.
- `src/lib/i18n.tsx` — new keys.
- `src/components/MemberForm.tsx` — SpousesEditor (male) + ExternalChildrenEditor (female); replace single spouse field for males.
- `src/components/MemberNode.tsx` — mark `is_unknown` wife chips; external-children badge (both on female card and wife chip).
- `src/components/FamilyTree.tsx` — cousin-wife handling in `layout()` (do not hide females with a resolvable `father_id`; suppress redundant edges for them).

## Non-goals

No backend changes (local store only). No layout algorithm overhaul beyond letting cousin wives participate in generation/gap passes normally.