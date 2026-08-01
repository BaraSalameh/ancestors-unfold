import { z } from "zod";

export const addMemberSearchSchema = z
  .object({
    fatherId: z.string().optional(),
    motherId: z.string().optional(),
    childId: z.string().optional(),
    spouseId: z.string().optional(),
    parentRole: z.enum(["father", "mother"]).optional(),
    returnPreview: z.enum(["lineage", "chronological"]).optional(),
  })
  .strict();
