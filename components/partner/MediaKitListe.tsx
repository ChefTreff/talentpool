import { ButtonDownload } from "@/components/ui/Button";
import { dateiGroesse, dateiTitel } from "./media-kit";

/** Eine Zeile aus `edition_files`, soweit die Liste sie braucht. */
export type MediaKitZeile = {
  id: string;
  filename: string;
  size_bytes: number | null;
  label_de: string | null;
  label_en: string | null;
};

/**
 * Die Download-Liste des Media Kits für die **Speaker** (SPK-090, `/speaker/media`): Titel in der Sprache der Person,
 * darunter Dateiname und Größe, rechts „Herunterladen“. Dieselbe Gestalt wie die Liste auf `/partner/media` (PART-041).
 *
 * Die Links sind signierte, kurzlebige Adressen und entstehen in der Seite, nicht hier (`links[i]` gehört zu
 * `dateien[i]`). Eine Datei, deren Adresse sich nicht signieren ließ, bleibt in der Liste — nur ohne Knopf.
 *
 * **Die Titelspalte hat eine Mindestbasis** (`basis-48`, wie in der Liste der Präsentationen): `flex-1` allein hat die
 * Basis 0, dann wickelt die Zeile nie um, und ein langer Titel bekäme am Handy nur, was neben dem Knopf übrig bleibt
 * (dieselbe Falle wie in der Checkliste, SPK-096). Mit ihr rutscht der Knopf unter den Titel, sobald der Platz fehlt.
 */
export function MediaKitListe({
  dateien,
  links,
  locale,
  dateLocale,
  downloadLabel,
}: {
  dateien: MediaKitZeile[];
  links: (string | null)[];
  locale: string;
  dateLocale: string;
  downloadLabel: string;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {dateien.map((d, i) => {
        const link = links[i];
        return (
          <li key={d.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className="ct-small min-w-0 flex-1 basis-48 text-ink">
              {dateiTitel(d, locale)}
              <span className="ct-help block">
                {[d.filename, dateiGroesse(d.size_bytes, dateLocale)].filter(Boolean).join(" · ")}
              </span>
            </span>
            {link && (
              <ButtonDownload href={link} variant="secondary" size="sm">
                {downloadLabel}
              </ButtonDownload>
            )}
          </li>
        );
      })}
    </ul>
  );
}
