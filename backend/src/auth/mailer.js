import nodemailer from "nodemailer";
import { httpError } from "../utils/httpError.js";

let transport;

function getTransport() {
  if (!transport && process.env.SMTP_HOST) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : Number(process.env.SMTP_PORT) === 465,
      connectionTimeout: 20_000,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

async function send({ to, subject, text, html, headers }) {
  const t = getTransport();
  if (!t) {
    // Development fallback so the flow can be tested without an SMTP account.
    // Only the plain-text body is printed; the HTML version would flood the console.
    if (process.env.NODE_ENV === "production") throw httpError(500, "SMTP is not configured");
    console.log(`\n[mail:dev] To: ${to}\n[mail:dev] Subject: ${subject}\n${text}\n`);
    return;
  }
  await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html, headers });
}

export function sendVerificationCode(to, code) {
  return send({
    to,
    subject: `${code} is your StayUpdated verification code`,
    text:
      `Your StayUpdated verification code is: ${code}\n\n` +
      "It expires in 15 minutes. If you didn't request this, you can ignore this email.",
  });
}

// Sent instead of a code when someone tries to register an email that already has a password,
// so the API response never reveals whether an account exists.
export function sendAlreadyRegistered(to) {
  return send({
    to,
    subject: "You already have a StayUpdated account",
    text:
      "Someone (hopefully you) tried to sign up with this email, but it already has an account.\n\n" +
      "Log in with your password, or use 'Forgot password' to reset it. If this wasn't you, ignore this email.",
  });
}

// The daily digest, with an HTML and a plain-text body. `unsubscribeUrl` also goes in the
// List-Unsubscribe header so mail apps can show their own unsubscribe button.
export function sendDigest(to, html, text, { subject = "Your StayUpdated digest", unsubscribeUrl } = {}) {
  return send({
    to,
    subject,
    text,
    html,
    // List-Unsubscribe-Post lets mail apps unsubscribe with one POST (RFC 8058), without opening the page.
    headers: unsubscribeUrl
      ? { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : undefined,
  });
}
