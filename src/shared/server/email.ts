type Mail = { to: string; subject: string; text: string; html: string };

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const layout = (heading: string, body: string) =>
  `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.6"><div style="max-width:560px;margin:32px auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px"><h1 style="font-size:22px">${heading}</h1>${body}<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0"><p dir="rtl">أنسابنا — ابنِ تاريخ عائلتك واحفظه.</p></div></body></html>`;

export function verificationMail(
  to: string,
  code: string,
  purpose: "registration" | "email_change",
): Mail {
  const action =
    purpose === "registration" ? "confirm your account" : "confirm your new email address";
  const arAction =
    purpose === "registration" ? "تأكيد حسابك" : "تأكيد عنوان بريدك الإلكتروني الجديد";
  const safeCode = escapeHtml(code);
  return {
    to,
    subject:
      purpose === "registration"
        ? "Confirm your Ancestors Unfold account"
        : "Confirm your new email address",
    text: `Use code ${code} to ${action}. It expires in 15 minutes.\n\nاستخدم الرمز ${code} من أجل ${arAction}. تنتهي صلاحيته خلال 15 دقيقة.`,
    html: layout(
      "Email verification | التحقق من البريد الإلكتروني",
      `<p>Use this code to ${action}:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${safeCode}</p><p>It expires in 15 minutes.</p><div dir="rtl"><p>استخدم هذا الرمز من أجل ${arAction}:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${safeCode}</p><p>تنتهي صلاحيته خلال 15 دقيقة.</p></div>`,
    ),
  };
}

export function passwordResetMail(to: string, token: string): Mail {
  const origin = process.env.PUBLIC_ORIGIN;
  if (!origin) throw new Error("MAIL_NOT_CONFIGURED");
  const link = `${origin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
  const safeLink = escapeHtml(link);
  return {
    to,
    subject: "Reset your Ancestors Unfold password",
    text: `Reset your password using this link (valid for 30 minutes): ${link}\n\nأعد تعيين كلمة المرور باستخدام هذا الرابط (صالح لمدة 30 دقيقة): ${link}`,
    html: layout(
      "Password reset | إعادة تعيين كلمة المرور",
      `<p>Use the link below to choose a new password. It expires in 30 minutes.</p><p><a href="${safeLink}">Reset password</a></p><div dir="rtl"><p>استخدم الرابط أدناه لاختيار كلمة مرور جديدة. تنتهي صلاحيته خلال 30 دقيقة.</p><p><a href="${safeLink}">إعادة تعيين كلمة المرور</a></p></div>`,
    ),
  };
}

export function contributorInvitationMail(
  to: string,
  token: string,
  treeName: string,
  branchName: string,
): Mail {
  const origin = process.env.PUBLIC_ORIGIN;
  if (!origin) throw new Error("MAIL_NOT_CONFIGURED");
  const link = `${origin.replace(/\/$/, "")}/invitation/${encodeURIComponent(token)}`;
  const safeLink = escapeHtml(link);
  return {
    to,
    subject: `Invitation to contribute to ${treeName}`,
    text: `You were invited to manage the ${branchName} branch of ${treeName}. This invitation is for an unregistered account and can be used once: ${link}`,
    html: layout(
      "Family tree contributor invitation",
      `<p>You were invited to manage the <strong>${escapeHtml(branchName)}</strong> branch of <strong>${escapeHtml(treeName)}</strong>.</p><p><a href="${safeLink}">Accept invitation</a></p>`,
    ),
  };
}

export function ownershipTransferCodeMail(to: string, code: string): Mail {
  return {
    to,
    subject: "Confirm family tree ownership transfer",
    text: `Use code ${code} to confirm the ownership transfer request. It expires in 15 minutes.`,
    html: layout(
      "Confirm ownership transfer",
      `<p>Use this code to confirm the ownership transfer request:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${escapeHtml(code)}</p><p>It expires in 15 minutes.</p>`,
    ),
  };
}

// Delivery backends intentionally share one boundary so callers receive identical errors.
// eslint-disable-next-line complexity
export async function sendMail(mail: Mail): Promise<void> {
  const delivery = process.env.AUTH_TOKEN_DELIVERY ?? "console";
  if (delivery === "console") {
    console.info(`[development email] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return;
  }
  if (delivery === "smtp") {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.EMAIL_FROM;
    if (!host || !Number.isInteger(port) || !user || !pass || !from)
      throw new Error("MAIL_NOT_CONFIGURED");
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: process.env.SMTP_SECURE === "true",
        auth: { user, pass },
        connectionTimeout: 10_000,
        socketTimeout: 15_000,
      });
      await transporter.sendMail({
        from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      return;
    } catch {
      throw new Error("MAIL_DELIVERY_FAILED");
    }
  }
  if (delivery !== "resend" || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
    throw new Error("MAIL_NOT_CONFIGURED");
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    });
  } catch {
    throw new Error("MAIL_DELIVERY_FAILED");
  }
  if (!response.ok) throw new Error("MAIL_DELIVERY_FAILED");
}
import nodemailer from "nodemailer";
