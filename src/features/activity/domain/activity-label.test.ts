import { describe, expect, it } from "vitest";
import { translate } from "@/locales";
import { activityDescription, type ActivityItem } from "./activity-label";

const item: ActivityItem = {
  id: "activity-1",
  actionType: "invitation_sent",
  actor: { userId: "owner-1", nameEn: "Mariam", nameAr: "مريم" },
  subject: { userId: null, nameEn: "Yousef", nameAr: "يوسف" },
  target: { type: "invitation", id: "invitation-1", nameEn: null, nameAr: null },
  branchId: "branch-1",
  branch: { nameEn: "North", nameAr: "الشمال" },
  createdAt: "2026-07-28T10:00:00.000Z",
  editingSession: null,
};

describe("activityDescription", () => {
  it("uses the English actor and subject snapshots", () => {
    expect(activityDescription(item, "en", (key, values) => translate("en", key, values))).toBe(
      "Mariam invited Yousef as a contributor",
    );
  });

  it("uses the Arabic actor and subject snapshots", () => {
    expect(activityDescription(item, "ar", (key, values) => translate("ar", key, values))).toBe(
      "دعا مريم ‏يوسف للمساهمة",
    );
  });

  it("uses safe labels for legacy events without identity snapshots", () => {
    expect(
      activityDescription({ ...item, actor: null, subject: null }, "en", (key, values) =>
        translate("en", key, values),
      ),
    ).toBe("A former contributor invited someone as a contributor");
  });
});
