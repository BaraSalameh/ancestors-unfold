import { afterEach, describe, expect, it } from "vitest";
import { contributorInvitationMail } from "./email";

const originalOrigin = process.env.PUBLIC_ORIGIN;

afterEach(() => {
  if (originalOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = originalOrigin;
});

describe("contributor invitation email", () => {
  it("uses the shared bilingual body structure and escapes dynamic HTML", () => {
    process.env.PUBLIC_ORIGIN = "https://ancestors.example";
    const mail = contributorInvitationMail(
      "invitee@example.test",
      "secure-token",
      "Family <Tree>",
      'Branch "One"',
    );

    const link = "https://ancestors.example/invitation/secure-token";
    expect(mail.subject).toBe("Invitation to contribute to Family <Tree>");
    expect(mail.text).toContain("You were invited to manage");
    expect(mail.text).toContain("تمت دعوتك لإدارة فرع");
    expect(mail.text.split(link)).toHaveLength(3);
    expect(mail.html).toContain("Family tree contributor invitation | دعوة للمساهمة");
    expect(mail.html).toContain('<div dir="rtl">');
    expect(mail.html).toContain(">Accept invitation</a>");
    expect(mail.html).toContain(">قبول الدعوة</a>");
    expect(mail.html.split(`href="${link}"`)).toHaveLength(3);
    expect(mail.html).toContain("Family &lt;Tree&gt;");
    expect(mail.html).toContain("Branch &quot;One&quot;");
    expect(mail.html).not.toContain("Family <Tree>");
  });
});
