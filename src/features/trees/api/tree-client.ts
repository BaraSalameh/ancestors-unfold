import type { FamilyMember, SubFamily } from "@/features/members/domain/types";
import { ApiClientError, apiRequest } from "@/shared/api/client";

export interface TreeSnapshot {
  version: number;
  members: FamilyMember[];
  subfamilies: SubFamily[];
}

export interface SaveTreeSnapshot extends Omit<TreeSnapshot, "version"> {
  batchId: string;
  expectedVersion: number;
}

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
  deleteTree(treeId: string): Promise<unknown> {
    return apiRequest(`/api/trees/${treeId}`, { method: "DELETE" });
  },
};
