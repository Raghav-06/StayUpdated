// Builds the digest email (HTML + plain text) from the topics that have new sources.

const REGION_NAMES = { IN: "India", US: "United States", GB: "United Kingdom", global: "Global" };
const MAX_BULLETS = 3;
const MAX_SOURCES = 3;

const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+/;

function clean(text) {
  return text
    .replace(/\[\d+\]/g, "") // no citation markers: the email has no numbered source list
    .replace(/\*\*/g, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** 2-3 short points from a summary: its bullet points, else its first sentences. */
export function summaryBullets(summary) {
  const lines = String(summary ?? "").split("\n");
  const bullets = lines.filter((l) => BULLET_RE.test(l)).map((l) => clean(l.replace(BULLET_RE, ""))).filter(Boolean);
  if (bullets.length >= 2) return bullets.slice(0, MAX_BULLETS);

  const prose = clean(lines.filter((l) => l.trim() && !BULLET_RE.test(l) && !/:\s*$/.test(l)).join(" "));
  const sentences = prose.match(/[^.!?]+[.!?]+(?=\s|$)/g)?.map((s) => s.trim()) ?? (prose ? [prose] : []);
  return [...bullets, ...sentences].slice(0, MAX_BULLETS);
}

export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function regionName(region) {
  return REGION_NAMES[region] ?? region;
}

/**
 * `items`: [{ follow: { topic, region }, result: { id, summary }, fresh: [source, ...] }]
 * Returns { subject, html, text }.
 */
export function buildDigestEmail({ user, items, frontendUrl, unsubscribeUrl }) {
  const newCount = items.reduce((n, item) => n + item.fresh.length, 0);
  const subject =
    items.length === 1
      ? `New on ${items[0].follow.topic}: ${newCount} new ${newCount === 1 ? "source" : "sources"}`
      : `Your StayUpdated digest: ${newCount} new sources on ${items.length} topics`;
  const greeting = user.name ? `Hi ${user.name.split(" ")[0]},` : "Hi,";
  const manageUrl = `${frontendUrl}/following`;

  const sections = items.map(({ follow, result, fresh }) => ({
    topic: follow.topic,
    region: regionName(follow.region),
    bullets: summaryBullets(result.summary),
    sources: fresh.slice(0, MAX_SOURCES),
    more: Math.max(0, fresh.length - MAX_SOURCES),
    url: `${frontendUrl}/history/${result.id}`,
  }));

  const text = [
    greeting,
    "",
    "Here's what's new on the topics you follow.",
    ...sections.flatMap((s) => [
      "",
      `== ${s.topic} (${s.region}) ==`,
      ...s.bullets.map((b) => `- ${b}`),
      "",
      "New sources:",
      ...s.sources.map((src) => `* ${src.title || src.url}${src.source ? ` (${src.source})` : ""}\n  ${src.url}`),
      ...(s.more ? [`  ...and ${s.more} more`] : []),
      "",
      `Read the full summary: ${s.url}`,
    ]),
    "",
    "--",
    `Manage the topics you follow: ${manageUrl}`,
    `Unsubscribe from these emails: ${unsubscribeUrl}`,
  ].join("\n");

  const font = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;${font}color:#1f2330;">
<tr><td style="padding:24px 28px 8px;">
  <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#7c3aed;">StayUpdated</div>
  <p style="margin:16px 0 4px;font-size:15px;">${escapeHtml(greeting)}</p>
  <p style="margin:0;font-size:15px;color:#555b6e;">Here's what's new on the topics you follow.</p>
</td></tr>
${sections
  .map(
    (s) => `<tr><td style="padding:20px 28px 4px;">
  <h2 style="margin:0 0 2px;font-size:19px;color:#111322;">${escapeHtml(s.topic)}</h2>
  <div style="font-size:12px;color:#8a8fa3;">${escapeHtml(s.region)}</div>
  <ul style="margin:12px 0;padding-left:20px;font-size:15px;line-height:1.55;">
    ${s.bullets.map((b) => `<li style="margin:0 0 6px;">${escapeHtml(b)}</li>`).join("\n    ")}
  </ul>
  <div style="font-size:13px;font-weight:600;color:#555b6e;margin:14px 0 6px;">New sources</div>
  ${s.sources
    .map(
      (src) => `<div style="margin:0 0 8px;font-size:14px;line-height:1.4;">
    <a href="${escapeHtml(src.url)}" style="color:#5b21b6;text-decoration:none;font-weight:600;">${escapeHtml(src.title || src.url)}</a>
    ${src.source ? `<span style="color:#8a8fa3;"> · ${escapeHtml(src.source)}</span>` : ""}
  </div>`
    )
    .join("\n  ")}
  ${s.more ? `<div style="font-size:13px;color:#8a8fa3;">and ${s.more} more</div>` : ""}
  <p style="margin:14px 0 6px;"><a href="${escapeHtml(s.url)}" style="display:inline-block;padding:9px 16px;border-radius:8px;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Read the full summary</a></p>
</td></tr>
<tr><td style="padding:12px 28px 0;"><div style="border-top:1px solid #ececf2;"></div></td></tr>`
  )
  .join("\n")}
<tr><td style="padding:16px 28px 24px;font-size:12px;line-height:1.6;color:#8a8fa3;">
  You're receiving this because you follow topics on StayUpdated.<br>
  <a href="${escapeHtml(manageUrl)}" style="color:#8a8fa3;">Manage followed topics</a> · <a href="${escapeHtml(unsubscribeUrl)}" style="color:#8a8fa3;">Unsubscribe</a>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  return { subject, html, text };
}
