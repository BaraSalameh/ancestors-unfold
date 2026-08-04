import type { FamilyMember, SubFamily } from "@/features/members/domain";
import { ApiClientError, apiRequest } from "@/shared/api/client";

interface TreeSnapshot {
  version: number;
  access_scope: "tree" | "branch" | "preview";
  assigned_branch_id?: string;
  capabilities: { can_import_csv: boolean };
  members: FamilyMember[];
  subfamilies: SubFamily[];
}

interface SaveTreeSnapshot extends Omit<
  TreeSnapshot,
  "version" | "access_scope" | "assigned_branch_id" | "capabilities"
> {
  batchId: string;
  expectedVersion: number;
}

export type FamilyCsvPreviewResponse = {
  expectedVersion: number;
  members: FamilyMember[];
  subfamilies: SubFamily[];
  summary: { members: number; parentLinks: number; spouseLinks: number; branches: number };
  warnings: Array<{
    code: string;
    message: string;
    row?: number;
    column?: string;
    severity: "warning";
  }>;
  mappingRequirements: {
    linkedMembers: Array<{
      target_member_id: string;
      name_en: string | null;
      name_ar: string | null;
      gender: "male" | "female";
      role: string;
    }>;
    grantedBranches: Array<{
      target_branch_id: string;
      name_en: string;
      name_ar: string | null;
    }>;
  };
};

type FamilyCsvApplyRequest = SaveTreeSnapshot & {
  sourceMemberIds: Array<{ sourceId: string; targetId: string }>;
  sourceBranchIds: Array<{ sourceId: string; targetId: string }>;
};

export const treeClient = {
  readSnapshot(treeId: string): Promise<TreeSnapshot> {
    return apiRequest(`/api/trees/${treeId}/snapshot`);
  },
  readPublicSnapshot(treeId: string): Promise<TreeSnapshot> {
    return apiRequest(`/api/trees/${treeId}/preview`);
  },
  async saveSnapshot(treeId: string, snapshot: SaveTreeSnapshot): Promise<{ version: number }> {
    try {
      return await apiRequest(`/api/trees/${treeId}/snapshot`, { method: "PUT", body: snapshot });
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "REQUEST_FAILED") {
        throw new ApiClientError("SAVE_FAILED", error.status);
      }
      throw error;
    }
  },
  previewFamilyCsv(treeId: string, csv: string): Promise<FamilyCsvPreviewResponse> {
    return apiRequest(`/api/trees/${treeId}/imports/csv/preview`, {
      method: "POST",
      body: { csv },
    });
  },
  applyFamilyCsv(treeId: string, snapshot: FamilyCsvApplyRequest): Promise<{ version: number }> {
    return apiRequest(`/api/trees/${treeId}/imports/csv`, {
      method: "POST",
      body: snapshot,
    });
  },
  deleteTree(treeId: string): Promise<unknown> {
    return apiRequest(`/api/trees/${treeId}`, { method: "DELETE" });
  },
};
