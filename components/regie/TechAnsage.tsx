type Strings = Record<string, string>;

/**
 * Was der Speaker angemeldet hat, in einer Tabellenzelle.
 *
 * Kurz gehalten: die Regie überfliegt die Zeile, sie liest sie nicht. Leere
 * Felder fallen weg, damit die Spalte bei Cues ohne Ansage wirklich leer ist
 * und nicht nach einer Angabe aussieht.
 */
export function TechAnsage({ tech, t }: { tech: Record<string, string | boolean> | null; t: Strings }) {
  // Seit SPK-067 stehen hier auch Wahrheitswerte (eigener Laptop, Video mit
  // Ton). `.trim()` auf `true` würde die ganze Regieseite abstürzen lassen —
  // deshalb erst nach Art trennen: ein Ja wird „ja", Text bleibt Text, alles
  // andere fällt heraus.
  const eintraege = Object.entries(tech ?? {}).flatMap(([key, v]): [string, string][] => {
    if (v === true) return [[key, t.techYes ?? "ja"]];
    if (typeof v === "string" && v.trim() !== "") return [[key, v]];
    return [];
  });
  if (eintraege.length === 0) return <span className="ct-help text-muted">—</span>;
  return (
    <dl className="flex flex-col gap-0.5">
      {eintraege.map(([key, wert]) => (
        <div key={key} className="flex gap-1">
          <dt className="ct-help shrink-0 font-semibold">{t[`tech_${key}`] ?? key}:</dt>
          <dd className="ct-help">{wert}</dd>
        </div>
      ))}
    </dl>
  );
}
