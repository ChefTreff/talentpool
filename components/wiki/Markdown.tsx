/**
 * Markdown, so viel wie ein Wiki-Artikel braucht: Überschriften, Absätze,
 * Listen, Links, fett und kursiv, Code.
 *
 * Bewusst **ohne** Bibliothek und ohne `dangerouslySetInnerHTML`: der Text
 * kommt aus dem Editor und damit von Menschen, aber er landet in Portalen
 * fremder Zielgruppen. Ein eigener, kleiner Parser, der nur React-Knoten
 * erzeugt, kann kein Skript einschleusen — es gibt keinen Weg von Text zu HTML.
 * Was er nicht kennt, bleibt Text. Tabellen und Bilder kommen, wenn sie
 * gebraucht werden.
 */
import type { ReactNode } from "react";

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Reihenfolge: Link, Code, fett, kursiv. `**` vor `*`, sonst frisst kursiv beides.
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[1]) {
      out.push(
        <a key={key} className="ct-link" href={m[3]} target="_blank" rel="noopener noreferrer">
          {m[2]}
        </a>,
      );
    } else if (m[4]) {
      out.push(
        <code key={key} className="rounded-ct-sm bg-surface-hover px-1">
          {m[5]}
        </code>,
      );
    } else if (m[6]) {
      out.push(<strong key={key}>{m[7]}</strong>);
    } else {
      out.push(<em key={key}>{m[9]}</em>);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let list: string[] = [];

  const flushList = (key: string) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key} className="ml-5 flex list-disc flex-col gap-1">
        {list.map((item, i) => (
          <li key={i}>{inline(item, `${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const key = `b-${i}`;
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]);
      return;
    }
    flushList(`l-${i}`);
    if (line.trim() === "") return;
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = inline(heading[2], key);
      blocks.push(
        level === 1 ? (
          <h2 key={key} className="ct-h2 mt-6">{text}</h2>
        ) : level === 2 ? (
          <h3 key={key} className="ct-h3 mt-5">{text}</h3>
        ) : (
          <h4 key={key} className="ct-label mt-4">{text}</h4>
        ),
      );
      return;
    }
    blocks.push(
      <p key={key} className="leading-6">
        {inline(line, key)}
      </p>,
    );
  });
  flushList("l-end");

  return <div className="flex flex-col gap-3">{blocks}</div>;
}
