import { z } from "zod";
import type { FamilyMember, SubFamily } from "@/features/members/domain";
import { ApiClientError, validatedApiRequest } from "@/shared/api/client";
import {
  treeSnapshotPayloadSchema,
  treeSnapshotSchema,
  type TreeSnapshot,
} from "../domain/tree-snapshot";

interface SaveTreeSnapshot extends Omit<
  TreeSnapshot,
  "version" | "access_scope" | "assigned_branch_id" | "capabilities"
> {
  batchId: string;
  expectedVersion: number;
}

type SaveTreeDelta = {
  batchId: string;
  expectedVersion: number;
  upsertMembers: FamilyMember[];
  deleteMemberIds: string[];
  upsertSubfamilies: SubFamily[];
  deleteSubfamilyIds: string[];
};

const versionResponseSchema = z.object({ version: z.number().int().positive() });
const successResponseSchema = z.object({ ok: z.literal(true) });
const sourceMappingSchema = z.object({ sourceId: z.string(), targetId: z.string() }).strict();
const familyCsvPreviewResponseSchema = treeSnapshotPayloadSchema.extend({
  expectedVersion: z.number().int().positive(),
  sourceMemberIds: z.array(sourceMappingSchema).max(10_000),
  sourceBranchIds: z.array(sourceMappingSchema).max(2_000),
  summary: z
    .object({
      members: z.number().int().nonnegative(),
      parentLinks: z.number().int().nonnegative(),
      spouseLinks: z.number().int().nonnegative(),
      branches: z.number().int().nonnegative(),
    })
    .strict(),
  warnings: z.array(
    z
      .object({
        code: z.string(),
        message: z.string(),
        row: z.number().int().positive().optional(),
        column: z.string().optional(),
        severity: z.literal("warning"),
      })
      .strict(),
  ),
  mappingRequirements: z
    .object({
      linkedMembers: z.array(
        z
          .object({
            target_member_id: z.string(),
            name_en: z.string().nullable(),
            name_ar: z.string().nullable(),
            gender: z.enum(["male", "female"]),
            role: z.string(),
          })
          .strict(),
      ),
      grantedBranches: z.array(
        z
          .object({
            target_branch_id: z.string(),
            name_en: z.string(),
            name_ar: z.string().nullable(),
          })
          .strict(),
      ),
    })
    .strict(),
});

export type FamilyCsvPreviewResponse = z.infer<typeof familyCsvPreviewResponseSchema>;

type FamilyCsvApplyRequest = SaveTreeSnapshot & {
  sourceMemberIds: Array<{ sourceId: string; targetId: string }>;
  sourceBranchIds: Array<{ sourceId: string; targetId: string }>;
};

export const treeClient = {
  async readSnapshot(treeId: string): Promise<TreeSnapshot> {
    return validatedApiRequest(treeSnapshotSchema, `/api/trees/${treeId}/snapshot`);
  },
  async readPublicSnapshot(treeId: string): Promise<TreeSnapshot> {
    return validatedApiRequest(treeSnapshotSchema, `/api/trees/${treeId}/preview`);
  },
  async saveSnapshot(treeId: string, snapshot: SaveTreeSnapshot): Promise<{ version: number }> {
    try {
      return await validatedApiRequest(versionResponseSchema, `/api/trees/${treeId}/snapshot`, {
        method: "PUT",
        body: snapshot,
      });
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "REQUEST_FAILED") {
        throw new ApiClientError("SAVE_FAILED", error.status);
      }
      throw error;
    }
  },
  async patchSnapshot(treeId: string, delta: SaveTreeDelta): Promise<{ version: number }> {
    try {
      return await validatedApiRequest(versionResponseSchema, `/api/trees/${treeId}/snapshot`, {
        method: "PATCH",
        body: delta,
      });
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "REQUEST_FAILED")
        throw new ApiClientError("SAVE_FAILED", error.status);
      throw error;
    }
  },
  previewFamilyCsv(treeId: string, csv: string): Promise<FamilyCsvPreviewResponse> {
    return validatedApiRequest(
      familyCsvPreviewResponseSchema,
      `/api/trees/${treeId}/imports/csv/preview`,
      {
        method: "POST",
        body: { csv },
      },
    );
  },
  applyFamilyCsv(treeId: string, snapshot: FamilyCsvApplyRequest): Promise<{ version: number }> {
    return validatedApiRequest(versionResponseSchema, `/api/trees/${treeId}/imports/csv`, {
      method: "POST",
      body: snapshot,
    });
  },
  deleteTree(treeId: string): Promise<{ ok: true }> {
    return validatedApiRequest(successResponseSchema, `/api/trees/${treeId}`, {
      method: "DELETE",
    });
  },
};
