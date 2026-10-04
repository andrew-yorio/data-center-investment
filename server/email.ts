import { BRAND_NAME, CONTACT_EMAIL, disclaimer } from "../shared/brand";
import type { Env } from "./env";

export async function sendConfirmationEmail(env: Env, to: string, name: string, confirmUrl: string): Promise<void> {
  const subject = `Confirm your place on the ${BRAND_NAME} interest list`;
  const text = [
    `Hi ${name},`,
    "",
    `Thanks for registering interest in ${BRAND_NAME}. Please confirm your email address so we can keep you updated:`,
    "",
    confirmUrl,
    "",
    "This link expires in 48 hours. If you didn't sign up, ignore this email and nothing further will happen.",
    "",
    "Nothing has been paid and nothing is binding. You'll get first notice if an official round opens through a registered funding portal, and you can decide then.",
    "",
    `Questions or want your information removed? Email ${CONTACT_EMAIL}.`,
    "",
    "--",
    disclaimer(),
  ].join("\n");

  if (!env.EMAIL_API_KEY) {
    if (env.DEV_LOG_EMAILS === "1") {
      console.log(`[dev email] to=${to} confirm=${confirmUrl}`);
      return;
    }
    throw new Error("EMAIL_API_KEY is not configured");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.EMAIL_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? `${BRAND_NAME} <${CONTACT_EMAIL}>`,
      to: [to],
      subject,
      text,
      html: renderHtml(name, confirmUrl),
    }),
  });
  if (!res.ok) throw new Error(`Email send failed: ${res.status} ${await res.text()}`);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderHtml(name: string, confirmUrl: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F3F5F7;font-family:Helvetica,Arial,sans-serif;color:#0D1626">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-top:4px solid #0D1626">
<tr><td style="padding:32px">
<p style="font-size:20px;font-weight:700;margin:0 0 24px">${esc(BRAND_NAME)}</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 16px">Hi ${esc(name)},</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 24px">Thanks for registering interest. Please confirm your email address so we can keep you updated.</p>
<p style="margin:0 0 24px"><a href="${esc(confirmUrl)}" style="display:inline-block;background:#0D1626;color:#FFFFFF;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:3px">Confirm my email</a></p>
<p style="font-size:14px;line-height:1.6;color:#46526A;margin:0 0 16px">This link expires in 48 hours. If you didn't sign up, ignore this email and nothing further will happen.</p>
<p style="font-size:14px;line-height:1.6;color:#46526A;margin:0 0 24px">Nothing has been paid and nothing is binding. Questions, or want your information removed? Email ${esc(CONTACT_EMAIL)}.</p>
<p style="font-size:12px;line-height:1.5;color:#46526A;margin:0;border-top:1px solid #C9D1DC;padding-top:16px">${esc(disclaimer())}</p>
</td></tr></table></td></tr></table></body></html>`;
}
