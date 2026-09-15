/**
 * Markdown → Blockliste. **Nur Zerlegung, kein Markup.**
 *
 * Getrennt von der Darstellung, weil das die Stelle ist, an der Fehler
 * entstehen — und weil ein Parser, der Daten zurückgibt, sich prüfen lässt,
 * ohne React zu starten.
 *
 * Es gibt bewusst keinen Weg von Text zu HTML: hier entstehen Objekte, dort
 * React-Knoten. Was der Parser nicht kennt, bleibt Text.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "code"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; content: Inline[] }
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "quote"; rows: Inline[][] }
  | { kind: "rule" }
  | { kind: "table"; head: Inline[][]; rows: Inline[][][] };

/** Reihenfolge: Link, Code, fett, kursiv. `**` vor `*`, sonst frisst kursiv beides. */
const INLINE =
  /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1]) out.push({ kind: "link", text: m[2], href: m[3] });
    else if (m[4]) out.push({ kind: "code", text: m[5] });
    else if (m[6]) out.push({ kind: "bold", text: m[7] });
    else out.push({ kind: "italic", text: m[9] });
    last = INLINE.lastIndex;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** `| a | b |` in Zellen zerlegen; führende und schliessende Pipe fallen weg. */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Die Trennzeile einer Tabelle: `|---|:--:|`. Sie entscheidet, ob es eine ist. */
function isDivider(line: string): boolean {
  const t = line.trim();
  if (!t.includes("|") || !t.includes("-")) return false;
  return cells(t).every((c) => /^:?-{2,}:?$/.test(c));
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");

  let list: { items: Inline[][]; ordered: boolean } | null = null;
  let quote: Inline[][] = [];

  const flushList = () => {
    if (list && list.items.length > 0) {
      blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
    }
    list = null;
  };
  const flushQuote = () => {
    if (quote.length > 0) blocks.push({ kind: "quote", rows: quote });
    quote = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    // Tabelle: Kopfzeile + Trennzeile + Rumpf. Erkannt wird sie an der
    // Trennzeile — eine einzelne Zeile mit Pipes bleibt Text.
    if (line.includes("|") && i + 1 < lines.length && isDivider(lines[i + 1])) {
      flushList();
      flushQuote();
      const head = cells(line).map(parseInline);
      const rows: Inline[][][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes("|") && lines[j].trim() !== "") {
        rows.push(cells(lines[j]).map(parseInline));
        j++;
      }
      blocks.push({ kind: "table", head, rows });
      i = j - 1;
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushQuote();
      const ordered = numbered !== null;
      // Wechselt die Art, beginnt eine neue Liste.
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { items: [], ordered };
      list.items.push(parseInline((bullet ?? numbered)![1]));
      continue;
    }
    flushList();

    const zitat = /^\s*>\s?(.*)$/.exec(line);
    if (zitat) {
      quote.push(parseInline(zitat[1]));
      continue;
    }
    flushQuote();

    if (line.trim() === "") continue;

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4,
        content: parseInline(heading[2]),
      });
      continue;
    }

    blocks.push({ kind: "paragraph", content: parseInline(line) });
  }
  flushList();
  flushQuote();
  return blocks;
}
