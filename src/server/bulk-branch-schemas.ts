import { z } from "zod";

const branchIds = z
  .array(z.string().uuid())
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length);

export const branchBulkDeleteSchema = z
  .object({
    batchId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    branchIds,
  })
  .strict();

export const branchBulkDeactivationRequestSchema = z
  .object({ confirmation: z.literal("DELETE"), branchIds })
  .strict();
