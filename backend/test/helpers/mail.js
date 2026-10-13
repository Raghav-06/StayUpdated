// Without SMTP the mailer prints emails to the console; capture them here instead.
export const mailbox = [];

const originalLog = console.log;
console.log = (...args) => {
  const text = args.join(" ");
  if (!text.includes("[mail:dev]")) return originalLog(...args);
  const to = /\[mail:dev\] To: (.*)/.exec(text)?.[1];
  const subject = /\[mail:dev\] Subject: (.*)/.exec(text)?.[1];
  const body = text.split("\n").filter((l) => !l.startsWith("[mail:dev]")).join("\n").trim();
  mailbox.push({ to, subject, text: body, raw: text });
};

/** The newest email sent to `to`. */
export function lastMailTo(to) {
  return mailbox.filter((m) => m.to === to).at(-1);
}

/** The 6-digit code in the newest email to `to`. */
export function lastCodeFor(to) {
  return /\b(\d{6})\b/.exec(lastMailTo(to)?.text ?? "")?.[1];
}
