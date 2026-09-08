export type MailVars = Record<string, string | number | null | undefined>;

/** `{{name}}` ersetzen. Unbekannte Platzhalter bleiben leer statt sichtbar. */
export function fillVars(text: string, vars: MailVars): string {
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => {
    const v = vars[key];
    return v === null || v === undefined ? "" : String(v);
  });
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Nur http(s) und mailto — verhindert `javascript:` in Vorlagen. */
function safeHref(url: string): string | null {
  const trimmed = url.trim();
  return /^(https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : null;
}

function inline(text: string): string {
  let out = escapeHtml(text);
  // [Label](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, url: string) => {
    const href = safeHref(url.replace(/&amp;/g, "&"));
    return href
      ? `<a href="${escapeHtml(href)}" style="color:#5B5BD9">${label}</a>`
      : label;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

/**
 * Sehr kleine Markdown-Teilmenge → HTML: `## Überschrift`, Absätze,
 * `- Liste`, `**fett**`, `[Label](url)`. Mehr braucht eine Transaktionsmail nicht,
 * und weniger Freiheit heißt weniger, was in Clients kaputtgeht.
 */
export function markdownToHtml(md: string): string {
  const blocks = md.trim().split(/\n{2,}/);
  const parts: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.every((l) => /^\s*-\s+/.test(l))) {
      const items = lines
        .map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ""))}</li>`)
        .join("");
      parts.push(`<ul style="margin:0 0 16px;padding-left:20px">${items}</ul>`);
      continue;
    }
    const heading = block.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4);
      parts.push(
        `<h${level} style="margin:24px 0 8px;font-size:18px">${inline(heading[2])}</h${level}>`,
      );
      continue;
    }
    parts.push(
      `<p style="margin:0 0 16px">${lines.map(inline).join("<br />")}</p>`,
    );
  }

  return parts.join("\n");
}

/** Plain-Text-Variante: Clients ohne HTML bekommen den Markdown-Text roh. */
export function markdownToText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1: $2")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,3}\s+/gm, "")
    .trim();
}

/** Rahmen um den Text — Off-White-Grund, weiße Karte, Navy-Ink wie im Portal. */
export function wrapHtml(subject: string, bodyHtml: string, locale: string): string {
  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
  <head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;padding:24px;background:#F5F4F2;font-family:-apple-system,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:24px;color:#081A35">
    <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #DCDFE5;border-radius:12px;padding:32px">
      ${bodyHtml}
    </div>
    <p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:18px;color:#5C6878">ChefTreff · chef-treff.de</p>
  </body>
</html>`;
}
