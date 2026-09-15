/**
 * Markdown, so viel wie ein Wiki-Artikel braucht: Überschriften, Absätze,
 * Listen (auch nummeriert), Hinweiskästen, Trennlinien, **Tabellen**, Links,
 * fett und kursiv, Code.
 *
 * Bewusst **ohne** Bibliothek und ohne `dangerouslySetInnerHTML`: der Text
 * kommt aus dem Editor und damit von Menschen, aber er landet in Portalen
 * fremder Zielgruppen. Zerlegt wird in `markdown-parse.ts` zu Objekten, hier
 * werden daraus React-Knoten — es gibt keinen Weg von Text zu HTML.
 *
 * Tabellen kamen mit den Notion-Inhalten dazu (F9.6): Öffnungszeiten,
 * Druckformate und Standausstattung sind ohne sie nicht lesbar. Bilder gibt es
 * weiterhin nicht — die Dateien einer Edition liegen in `edition_file`, und
 * eine freie Bild-URL im Artikel wäre ein Weg, fremde Server anzufragen.
 */
import type { ReactNode } from "react";
import { parseMarkdown, type Inline } from "./markdown-parse";

function render(parts: Inline[], keyPrefix: string): ReactNode[] {
  return parts.map((p, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (p.kind) {
      case "link":
        return (
          <a key={key} className="ct-link" href={p.href} target="_blank" rel="noopener noreferrer">
            {p.text}
          </a>
        );
      case "code":
        return (
          <code key={key} className="rounded-ct-sm bg-surface-hover px-1">
            {p.text}
          </code>
        );
      case "bold":
        return <strong key={key}>{p.text}</strong>;
      case "italic":
        return <em key={key}>{p.text}</em>;
      default:
        return p.text;
    }
  });
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => {
        const key = `b-${i}`;
        switch (b.kind) {
          case "heading":
            return b.level === 1 ? (
              <h2 key={key} className="ct-h2 mt-6">{render(b.content, key)}</h2>
            ) : b.level === 2 ? (
              <h3 key={key} className="ct-h3 mt-5">{render(b.content, key)}</h3>
            ) : (
              <h4 key={key} className="ct-label mt-4">{render(b.content, key)}</h4>
            );
          case "list":
            return b.ordered ? (
              <ol key={key} className="ml-5 flex list-decimal flex-col gap-1">
                {b.items.map((item, n) => (
                  <li key={n}>{render(item, `${key}-${n}`)}</li>
                ))}
              </ol>
            ) : (
              <ul key={key} className="ml-5 flex list-disc flex-col gap-1">
                {b.items.map((item, n) => (
                  <li key={n}>{render(item, `${key}-${n}`)}</li>
                ))}
              </ul>
            );
          case "quote":
            // Ein Zitat ist im Wiki fast immer ein Hinweiskasten („Worum geht
            // es hier?"). Deshalb Akzentbalken statt grauer Linie.
            return (
              <blockquote
                key={key}
                className="border-l-2 border-l-accent bg-accent-soft/40 py-2 pl-4"
              >
                {b.rows.map((row, n) => (
                  <p key={n} className="leading-6">
                    {render(row, `${key}-${n}`)}
                  </p>
                ))}
              </blockquote>
            );
          case "rule":
            return <hr key={key} className="border-t" />;
          case "table":
            return (
              // Breite Tabellen scrollen in ihrem eigenen Kasten; die Seite nie.
              <div key={key} className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b">
                      {b.head.map((c, n) => (
                        <th key={n} scope="col" className="ct-label px-3 py-2 text-muted">
                          {render(c, `${key}-h-${n}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r} className="border-b align-top last:border-b-0">
                        {row.map((c, n) => (
                          <td key={n} className="px-3 py-2">
                            {render(c, `${key}-${r}-${n}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return (
              <p key={key} className="leading-6">
                {render(b.content, key)}
              </p>
            );
        }
      })}
    </div>
  );
}
