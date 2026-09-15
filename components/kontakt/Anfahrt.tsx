import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * Wo die Veranstaltung stattfindet.
 *
 * **Keine eingebettete Karte.** Google Maps setzt beim Laden Cookies und
 * überträgt die IP jedes Besuchers, bevor irgendjemand auf etwas geklickt hat
 * — für eine Adresse, die als Text danebensteht, ist das ein schlechter
 * Tausch (Entscheidung der Architektur-Session 14.09.). Stattdessen die
 * Adresse, ein Knopf, der Maps in einem neuen Tab öffnet, und der Verweis
 * ins Wiki für die Anfahrt.
 *
 * Das statische Anfahrtsbild je Edition kommt mit F10.4, sobald die
 * Dateiablage steht; der Platz dafür ist hier.
 */
export function Anfahrt({
  title,
  venue,
  address,
  mapsLabel,
  wikiHref,
  wikiLabel,
}: {
  title: string;
  venue: string;
  address: string;
  mapsLabel: string;
  wikiHref: string;
  wikiLabel: string;
}) {
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue}, ${address}`)}`;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="ct-h3">{title}</h2>
      <Card>
        <p className="ct-label text-ink">{venue}</p>
        <p className="ct-help mt-0.5">{address}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ButtonLink href={maps} variant="secondary" size="sm" target="_blank" rel="noreferrer noopener">
            {mapsLabel}
          </ButtonLink>
          <a className="ct-link ct-small" href={wikiHref}>
            {wikiLabel}
          </a>
        </div>
      </Card>
    </section>
  );
}
