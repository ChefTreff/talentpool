import { ContactCard } from "@/components/ui/ContactCard";
import { contactPhotoUrl, type MeinKontakt } from "./load";

/**
 * Die Ansprechpartner eines Bereichs, Lead und Buddy nebeneinander.
 *
 * Ist beides dieselbe Person oder gibt es nur eine Zuordnung, steht **eine**
 * Karte da (Konrads Vorgabe). Deshalb wird über die Kontakt-Id entdoppelt und
 * nicht über den Typ: zwei Karten mit demselben Gesicht sind keine Auskunft,
 * sondern ein Fehler, den man dem Team ansieht.
 */
export function Ansprechpartner({
  kontakte,
  locale,
  title,
  lead,
  buddy,
}: {
  kontakte: MeinKontakt[];
  locale: string;
  title: string;
  /** Beschriftung, wenn der Kontakt keine eigene Rollenbezeichnung trägt. */
  lead: string;
  buddy: string;
}) {
  if (kontakte.length === 0) return null;
  const gesehen = new Set<string>();
  const sichtbar = kontakte.filter((k) => !gesehen.has(k.id) && gesehen.add(k.id));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="ct-h3">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {sichtbar.map((k) => (
          <ContactCard
            key={k.id}
            name={k.display_name}
            role={
              (locale === "en" ? k.role_label_en : k.role_label_de) ??
              (k.type.endsWith("buddy") ? buddy : lead)
            }
            email={k.email}
            phone={k.phone}
            photoUrl={contactPhotoUrl(k.photo_path)}
          />
        ))}
      </div>
    </section>
  );
}
