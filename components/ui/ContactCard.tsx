import { cn } from "./cn";
import { PortraitShape } from "./PortraitShape";

/**
 * Wer für mich zuständig ist — Foto, Name, Rolle, Erreichbarkeit.
 *
 * Die dichte Fassung der Personen-Karte: dieselbe Dreiecks-Form wie
 * `PersonCard` (`PortraitShape`, seit 17.09.2026 für alle Personen), nur
 * klein und in einer Zeile. Die Rolle steht in Sharp Sans, nicht in Laica —
 * Laica bleibt Marketing.
 *
 * Mail und Telefon sind **Links**, kein Fließtext: am Veranstaltungstag steht
 * jemand mit dem Telefon in der Hand und will tippen, nicht abschreiben.
 */
export function ContactCard({
  name,
  role,
  email,
  phone,
  photoUrl,
  className,
}: {
  name: string;
  /** Rollenbezeichnung, z. B. „Partner-Lead". */
  role: string | null;
  email: string;
  phone: string;
  photoUrl: string | null;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-ct-md border bg-surface p-4", className)}>
      <PortraitShape name={name} photoUrl={photoUrl} size="sm" />
      <div className="min-w-0">
        <p className="ct-label text-ink">{name}</p>
        {role && <p className="ct-help mt-0.5">{role}</p>}
        <p className="mt-2 flex flex-col gap-0.5">
          <a className="ct-link ct-small break-all" href={`mailto:${email}`}>
            {email}
          </a>
          <a className="ct-link ct-small" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
            {phone}
          </a>
        </p>
      </div>
    </div>
  );
}
