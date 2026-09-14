import { cn } from "./cn";

/**
 * Wer für mich zuständig ist — Foto, Name, Rolle, Erreichbarkeit.
 *
 * Muster „Personen-Karte" aus dem Skill: rundes Foto mit Akzent-Ring, Name in
 * Versalien, Rolle als Akzent-Chip. Im Portal steht die Rolle in Sharp Sans,
 * nicht in Laica — Laica bleibt Marketing.
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
  const initiale = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <div className={cn("flex items-start gap-3 rounded-ct-md border bg-surface p-4", className)}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Bilder liegen in Supabase Storage, ohne feste Größe.
        <img
          src={photoUrl}
          alt=""
          className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-accent-soft"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-soft ct-h3 text-accent-deep"
        >
          {initiale}
        </span>
      )}
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
