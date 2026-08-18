import { z } from "zod";
import { schemas } from "./schemas";

export const snapshotDeltaSchema = z
  .object({
    batchId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    upsertMembers: schemas.snapshot.shape.members,
    deleteMemberIds: z.array(z.string().uuid()).max(10_000),
    upsertSubfamilies: schemas.snapshot.shape.subfamilies,
    deleteSubfamilyIds: z.array(z.string().uuid()).max(2_000),
  })
  .strict()
  .superRefine((value, context) => {
    const uuid = z.string().uuid();
    const memberIds = new Set(value.upsertMembers.map(({ id }) => id));
    const branchIds = new Set(value.upsertSubfamilies.map(({ id }) => id));
    value.upsertMembers.forEach((member, index) => {
      for (const [field, candidate] of [
        ["id", member.id],
        ["father_id", member.father_id],
        ["mother_id", member.mother_id],
        ["spouse_id", member.spouse_id],
        ["subfamily_id", member.subfamily_id],
      ] as const)
        if (candidate && !uuid.safeParse(candidate).success)
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Expected UUID",
            path: ["upsertMembers", index, field],
          });
      for (const [field, values] of [
        ["spouse_ids", member.spouse_ids],
        ["divorced_from", member.divorced_from],
      ] as const)
        values?.forEach((candidate, valueIndex) => {
          if (!uuid.safeParse(candidate).success)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Expected UUID",
              path: ["upsertMembers", index, field, valueIndex],
            });
        });
    });
    value.upsertSubfamilies.forEach((branch, index) => {
      for (const [field, candidate] of [
        ["id", branch.id],
        ["linked_male_id", branch.linked_male_id],
        ["parent_subfamily_id", branch.parent_subfamily_id],
      ] as const)
        if (candidate && !uuid.safeParse(candidate).success)
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Expected UUID",
            path: ["upsertSubfamilies", index, field],
          });
    });
    if (value.deleteMemberIds.some((id) => memberIds.has(id)))
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Conflicting member changes" });
    if (value.deleteSubfamilyIds.some((id) => branchIds.has(id)))
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Conflicting branch changes" });
  });

export type SnapshotDeltaInput = z.infer<typeof snapshotDeltaSchema>;
