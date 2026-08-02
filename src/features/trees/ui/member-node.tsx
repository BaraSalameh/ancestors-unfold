import { memo } from "react";
import type { NodeProps } from "reactflow";
import type { FamilyMember } from "@/features/members";
import { familyStore } from "../client/family-store";
import { MemberNodeCard } from "./member-node-card";
import { MemberNodeConnectors } from "./member-node-connectors";
import { memberNodeTheme } from "./member-node-theme";

export interface MemberNodeData {
  member: FamilyMember;
  highlighted?: boolean;
  onOpen: (id: string) => void;
  onAddParent?: (id: string) => void;
  onAddChild?: (id: string) => void;
  wives?: FamilyMember[];
  hasDescendants?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: (id: string) => void;
  editable: boolean;
}

function MemberNodeImpl({ data, selected }: NodeProps<MemberNodeData>) {
  const theme = memberNodeTheme(data.member.gender);
  return (
    <div className="group/node relative">
      <MemberNodeConnectors
        memberId={data.member.id}
        hasDescendants={data.hasDescendants}
        collapsed={data.collapsed}
        toggleCollapsed={data.onToggleCollapsed}
        addParent={data.onAddParent}
        addChild={data.onAddChild}
        editable={data.editable}
        selected={selected}
        handleClass={theme.handle}
      />
      <MemberNodeCard
        member={data.member}
        wives={data.wives}
        imageSrc={familyStore.getMemberImageSrc(data.member.id)}
        theme={theme}
        highlighted={data.highlighted}
        selected={selected}
        open={() => data.onOpen(data.member.id)}
      />
    </div>
  );
}

export const MemberNode = memo(MemberNodeImpl);
