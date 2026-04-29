import { env } from "../env.js";
import { logger } from "./logger.js";

const BREVO_SMTP_URL = "https://api.brevo.com/v3/smtp/email";
const APP_LOGO = "https://i.imgur.com/i7QnEPi.png";

function domainOnly(email: string): string {
  const i = email.indexOf("@");
  return i === -1 ? "(invalid)" : email.slice(i + 1);
}

/** Brevo requires a non-empty `to[].name`; empty string is rejected. */
function recipientName(email: string, explicit?: string): string {
  const n = explicit?.trim();
  if (n) return n;
  const local = email.split("@")[0]?.trim();
  if (local) return local;
  return "Recipient";
}

export type EmailPayload = {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent: string;
};

/** Sends any transactional email via Brevo (`BREVO_API_KEY`, `MAIL_FROM_EMAIL`). */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!env.brevoApiKey) {
    logger.warn(
      { mail: "skipped", reason: "BREVO_API_KEY_empty" },
      "Email not sent: set BREVO_API_KEY in .env (see env.ts)",
    );
    return;
  }
  if (!env.mailFromEmail) {
    logger.warn(
      { mail: "skipped", reason: "MAIL_FROM_EMAIL_empty" },
      "Email not sent: set MAIL_FROM_EMAIL in .env",
    );
    return;
  }

  const res = await fetch(BREVO_SMTP_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": env.brevoApiKey,
    },
    body: JSON.stringify({
      sender: {
        email: env.mailFromEmail,
        name: env.mailFromName,
      },
      to: [
        {
          email: payload.toEmail,
          name: recipientName(payload.toEmail, payload.toName),
        },
      ],
      subject: payload.subject,
      htmlContent: payload.htmlContent,
      textContent: payload.textContent,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error(
      {
        mail: "brevo_rejected",
        status: res.status,
        toDomain: domainOnly(payload.toEmail),
        bodyPreview: body.slice(0, 800),
      },
      "Brevo API rejected the send — fix sender/domain in Brevo or check API key",
    );
    throw new Error(`Brevo email failed: ${res.status} ${body}`);
  }

  logger.info(
    {
      mail: "sent",
      brevoStatus: res.status,
      toDomain: domainOnly(payload.toEmail),
    },
    "Brevo accepted the send request (check inbox/spam if not received)",
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderEmailShell(input: {
  appName: string;
  title: string;
  subtitle?: string;
  bodyHtml: string;
  footerNote?: string;
}): string {
  const appName = escapeHtml(input.appName);
  const title = escapeHtml(input.title);
  const subtitle = input.subtitle ? escapeHtml(input.subtitle) : "";
  const footerNote =
    input.footerNote ??
    "This is an automated message from a no-reply email address. Please do not reply to this email.";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:24px;background:#f4f7fb;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
    <tr>
      <td style="padding:24px 24px 16px;background:linear-gradient(135deg,#0f172a,#1e293b);text-align:center;">
        <img src="${APP_LOGO}" alt="${appName} logo" style="height:56px;max-width:220px;object-fit:contain;display:block;margin:0 auto 10px;" />
        <div style="color:#e2e8f0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">${appName}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <h1 style="margin:0 0 8px;font-size:24px;line-height:1.3;color:#0f172a;">${title}</h1>
        ${subtitle ? `<p style="margin:0 0 18px;color:#475569;font-size:14px;">${subtitle}</p>` : ""}
        ${input.bodyHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px 24px;border-top:1px solid #e2e8f0;">
        <p style="margin:0;color:#64748b;font-size:12px;line-height:1.5;">${escapeHtml(footerNote)}</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** OTP message — implemented on top of `sendEmail`. */
export async function sendOtpEmail(
  toEmail: string,
  code: string,
  expiresAt: Date,
  options?: { toName?: string; appName?: string },
): Promise<void> {
  const app = options?.appName ?? "Verification";
  const when = expiresAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const subject = `${app}: your code is ${code}`;
  const textContent = [
    `Your verification code is: ${code}`,
    "",
    `This code expires around ${when}.`,
    "If you did not request this, you can ignore this email.",
  ].join("\n");
  const htmlContent = renderEmailShell({
    appName: app,
    title: "Verify your email",
    subtitle: "Use this one-time code to complete your request.",
    bodyHtml: `
      <p style="margin:0 0 8px;font-size:14px;color:#334155;">Your verification code is:</p>
      <div style="margin:10px 0 14px;padding:14px 16px;border-radius:10px;background:#0f172a;color:#f8fafc;font-size:28px;font-weight:700;letter-spacing:0.28em;text-align:center;">
        ${escapeHtml(code)}
      </div>
      <p style="margin:0 0 6px;font-size:14px;color:#334155;">This code expires around <strong>${escapeHtml(when)}</strong>.</p>
      <p style="margin:0;font-size:13px;color:#64748b;">If you did not request this, you can ignore this email.</p>
    `,
  });

  const emailPayload: EmailPayload = {
    toEmail: toEmail.trim().toLowerCase(),
    subject,
    htmlContent,
    textContent,
  };
  if (options?.toName !== undefined) {
    emailPayload.toName = options.toName;
  }

  await sendEmail(emailPayload);
}

export async function sendWelcomeAfterRegisterEmail(
  toEmail: string,
  options?: { toName?: string; appName?: string },
): Promise<void> {
  const app = options?.appName ?? "INATRA";
  const recipient = options?.toName?.trim() || toEmail.split("@")[0] || "there";
  const subject = `Welcome to ${app}`;
  const textContent = [
    `Hello ${recipient},`,
    "",
    `Welcome to ${app}. Your account has been created successfully.`,
    "You can now sign in and start using the app.",
    "",
    "This message was sent from a no-reply mailbox.",
  ].join("\n");
  const htmlContent = renderEmailShell({
    appName: app,
    title: `Hello ${recipient}, welcome aboard`,
    subtitle: "Your account is ready.",
    bodyHtml: `
      <p style="margin:0 0 10px;font-size:14px;color:#334155;">Thanks for registering. Your account has been created successfully.</p>
      <p style="margin:0 0 10px;font-size:14px;color:#334155;">You can now sign in and start using <strong>${escapeHtml(app)}</strong>.</p>
      <div style="margin-top:14px;padding:10px 12px;border-left:4px solid #0f172a;background:#f8fafc;color:#475569;font-size:13px;">
        This email was sent from a no-reply mailbox.
      </div>
    `,
  });
  const emailPayload: EmailPayload = {
    toEmail: toEmail.trim().toLowerCase(),
    subject,
    htmlContent,
    textContent,
  };
  if (options?.toName !== undefined) {
    emailPayload.toName = options.toName;
  }
  await sendEmail(emailPayload);
}
