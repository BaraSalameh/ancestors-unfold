import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import type { FamilyMember } from "@/features/members";
import { displayName, ordinal, useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { familyStore } from "../client/family-store";
import { wifeColorFor } from "../domain/wife-colors";
import { DIVORCED_COLOR } from "./family-tree-layout";
import type { MotherPickerState } from "./use-tree-edge-interactions";

type Translator = ReturnType<typeof useI18n>["t"];
type Language = ReturnType<typeof useI18n>["lang"];

export interface CreationChoice {
  kind: "parent" | "child-role";
  memberId: string;
}

export interface ChildMotherChoice {
  fatherId: string;
  wives: FamilyMember[];
}

export interface RemoveParentChoice {
  childId: string;
  fatherId: string;
  motherId: string;
}

export interface AddRelativeTarget {
  fatherId?: string;
  motherId?: string;
  childId?: string;
  parentRole?: "father" | "mother";
}

export interface FamilyTreeDialogsProps {
  canEdit: boolean;
  childMotherChoice: ChildMotherChoice | null;
  creationChoice: CreationChoice | null;
  lang: Language;
  motherPicker: MotherPickerState | null;
  navigateToAdd: (target: AddRelativeTarget) => void;
  pickMother: (wifeId: string | null) => void;
  preserveDetachedSubtree: (childId: string, role: "father_id" | "mother_id") => void;
  removeParentChoice: RemoveParentChoice | null;
  setChildMotherChoice: Dispatch<SetStateAction<ChildMotherChoice | null>>;
  setCreationChoice: Dispatch<SetStateAction<CreationChoice | null>>;
  setMotherPicker: Dispatch<SetStateAction<MotherPickerState | null>>;
  setRemoveParentChoice: Dispatch<SetStateAction<RemoveParentChoice | null>>;
  t: Translator;
}

export function FamilyTreeDialogs(props: FamilyTreeDialogsProps) {
  if (!props.canEdit) return null;
  return (
    <>
      <RemoveParentDialog {...props} />
      <CreationChoiceDialog {...props} />
      <ChildMotherDialog {...props} />
      <MotherPickerDialog {...props} />
    </>
  );
}

function RemoveParentDialog(props: FamilyTreeDialogsProps) {
  const remove = (role: "father_id" | "mother_id") => {
    if (!props.removeParentChoice) return;
    props.preserveDetachedSubtree(props.removeParentChoice.childId, role);
    familyStore.detachParent(props.removeParentChoice.childId, role);
    props.setRemoveParentChoice(null);
    toast.success(props.t("link_removed"));
  };
  return (
    <Dialog
      open={!!props.removeParentChoice}
      onOpenChange={(open) => !open && props.setRemoveParentChoice(null)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.t("remove_connection")}</DialogTitle>
          <DialogDescription>{props.t("choose_parent_to_remove")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="destructive" onClick={() => remove("father_id")}>
            {props.t("father")}
          </Button>
          <Button variant="destructive" onClick={() => remove("mother_id")}>
            {props.t("mother")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreationChoiceDialog(props: FamilyTreeDialogsProps) {
  const choose = (role: "father" | "mother") => {
    const choice = props.creationChoice;
    if (!choice) return;
    if (choice.kind === "parent")
      props.navigateToAdd({ childId: choice.memberId, parentRole: role });
    else
      props.navigateToAdd(
        role === "father" ? { fatherId: choice.memberId } : { motherId: choice.memberId },
      );
    props.setCreationChoice(null);
  };
  return (
    <Dialog
      open={!!props.creationChoice}
      onOpenChange={(open) => !open && props.setCreationChoice(null)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {props.creationChoice?.kind === "parent" ? props.t("add_parent") : props.t("add_child")}
          </DialogTitle>
          <DialogDescription>{props.t("choose_relative_to_add")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={() => choose("father")}>
            {props.t("father")}
          </Button>
          <Button variant="outline" onClick={() => choose("mother")}>
            {props.t("mother")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChildMotherDialog(props: FamilyTreeDialogsProps) {
  const choose = (motherId?: string) => {
    if (!props.childMotherChoice) return;
    props.navigateToAdd({ fatherId: props.childMotherChoice.fatherId, motherId });
    props.setChildMotherChoice(null);
  };
  return (
    <Dialog
      open={!!props.childMotherChoice}
      onOpenChange={(open) => !open && props.setChildMotherChoice(null)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.t("select_mother")}</DialogTitle>
          <DialogDescription>{props.t("select_mother_desc")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {props.childMotherChoice?.wives.map((wife) => (
            <Button key={wife.id} variant="outline" onClick={() => choose(wife.id)}>
              {displayName(wife, props.lang)}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => choose()}>
            {props.t("unknown_mother")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MotherPickerDialog(props: FamilyTreeDialogsProps) {
  return (
    <Dialog
      open={!!props.motherPicker}
      onOpenChange={(open) => !open && props.setMotherPicker(null)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.t("select_mother")}</DialogTitle>
          <DialogDescription>{props.t("select_mother_desc")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {props.motherPicker?.wives.map((wife, index) => (
            <MotherOption
              key={wife.id}
              wife={wife}
              index={index}
              lang={props.lang}
              picker={props.motherPicker!}
              pickMother={props.pickMother}
              t={props.t}
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.pickMother(null)}>
            {props.t("unknown_mother")}
          </Button>
          <Button variant="outline" onClick={() => props.setMotherPicker(null)}>
            {props.t("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MotherOption({
  wife,
  index,
  lang,
  picker,
  pickMother,
  t,
}: {
  wife: FamilyMember;
  index: number;
  lang: Language;
  picker: MotherPickerState;
  pickMother: (wifeId: string | null) => void;
  t: Translator;
}) {
  const father = familyStore.get(picker.fatherId);
  const divorced = father?.divorced_from?.includes(wife.id);
  const color = wifeColorFor(index);
  return (
    <button
      onClick={() => pickMother(wife.id)}
      className="flex items-center gap-3 rounded-md border p-3 text-start hover:bg-accent"
    >
      <span
        className="h-3 w-3 shrink-0 rounded-full ring-2 ring-background"
        style={{ backgroundColor: divorced ? DIVORCED_COLOR : color.stroke }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          <span className="opacity-60 me-1">{ordinal(index + 1, lang)}</span>
          {displayName(wife, lang)}
        </div>
        <div className="text-xs text-muted-foreground">
          {wife.birth_date?.slice(0, 4)}
          {wife.death_date ? `–${wife.death_date.slice(0, 4)}` : ""}
          {divorced ? ` · ${t("divorced")}` : ""}
        </div>
      </div>
    </button>
  );
}
