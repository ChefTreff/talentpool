import type { ReactNode } from "react";
import { cn } from "./cn";
import { PortraitShape } from "./PortraitShape";

/**
 * Eine Person, wie die Marke sie zeigt: Porträt in einer Dreiecks-Maske mit
 * Akzentverlauf, darunter Rollen-Chip, Name in Versalien, Organisation.
 *
 * Die Form selbst steht in `PortraitShape` — sie ist seit dem 17.09.2026 für
 * **alle** Personen dieselbe (Konrad), auch für Ansprechpartner und Team.
 *
 * Wann diese Karte, wann `ContactCard`? Diese hier ist die **repräsentative**
 * Fassung: Speaker-Listen, Jury, Team — überall, wo die Person das Thema ist.
 * `ContactCard` ist die **dichte** Fassung mit Mail und Telefon als Links:
 * „wer ist für mich zuständig". Sie unterscheiden sich in der Dichte, nicht
 * in der Form. Beides nebeneinander auf einer Seite wäre ein Fehler.
 */
export function PersonCard({
  name,
  role,
  organization,
  photoUrl,
  action,
  className,
}: {
  name: string;
  /** Rollenbezeichnung im Chip. Im Portal Sharp Sans, nicht Laica. */
  role?: string | null;
  organization?: string | null;
  photoUrl?: string | null;
  /** Optional unter der Organisation: ein Link ins Detail. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <PortraitShape name={name} photoUrl={photoUrl} size="lg" />

      {role && (
        <span className="mt-4 inline-flex items-center rounded-ct-sm bg-accent px-2.5 py-1 ct-label text-white">
          {role}
        </span>
      )}
      <p className="ct-h2 mt-2 text-ink">{name}</p>
      {organization && <p className="ct-laica mt-0.5 text-muted">{organization}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
