import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";

export type RueckgabeTexte = {
  /** Kennzeichen statt „Entwurf“, solange ein Grund offen ist: „Zurückgegeben“. */
  badge: string;
  /** „Rückmeldung der Programmleitung vom {date}“ */
  title: string;
  /** Was jetzt zu tun ist. */
  next: string;
};

/**
 * Die Rückmeldung der Programmleitung zu einer zurückgegebenen Session
 * (PART-083). Vorher stand der Grund nur im Audit — der Partner sah „Entwurf“
 * und wusste nicht, was er ändern soll. Gelb wie „offen, Frist“: etwas ist zu
 * tun, aber nichts ist kaputt.
 */
export function RueckgabeHinweis({
  note,
  returnedAt,
  dateLocale,
  t,
  className,
}: {
  note: string;
  returnedAt: string;
  dateLocale: string;
  t: RueckgabeTexte;
  className?: string;
}) {
  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" }).format(new Date(returnedAt));
  return (
    <div role="note" className={cn("rounded-ct-md border border-warning-soft bg-warning-soft px-4 py-3", className)}>
      <p className="ct-label text-warning-ink">{t.title.replace("{date}", datum)}</p>
      <p className="ct-small mt-1 whitespace-pre-line leading-6 text-warning-ink">{note}</p>
      <p className="ct-help mt-1 text-warning-ink">{t.next}</p>
    </div>
  );
}

/** Das Stand-Kennzeichen einer Partner-Session: „Zurückgegeben“ schlägt „Entwurf“. */
export function SessionStatusBadge({
  publishStatus,
  returnNote,
  statusLabel,
  t,
}: {
  publishStatus: string;
  returnNote: string | null;
  statusLabel: Record<string, string>;
  t: RueckgabeTexte;
}) {
  if (returnNote && publishStatus !== "published") return <Badge tone="warning">{t.badge}</Badge>;
  return (
    <Badge tone={publishStatus === "published" ? "success" : "neutral"}>
      {statusLabel[publishStatus] ?? publishStatus}
    </Badge>
  );
}
