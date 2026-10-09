import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import {
  SIDE_EVENTS_PFAD,
  einladungsTeile,
  eventTitel,
  eventZeit,
  type SideEventStand,
  type SpeakerSideEvent,
} from "@/lib/speaker/side-events";

type Strings = Record<string, string>;

/** Offene Einladung gelb, Zusage grün, Absage neutral — dieselben Töne wie in der Einladungsliste unter /admin/side-events. */
const TON: Record<SideEventStand, BadgeTone> = { invited: "warning", yes: "success", no: "neutral" };

/**
 * Der Inhalt des Blocks „Side Events“ eines Speakers (ADM-087) — für das Admin-Detail und das Personen-Fenster der Leads, nur
 * lesend: eine Zeile je Einladung mit Event, Zeit, Ort, Stand und den Angaben dazu, darunter der Weg zur Verwaltung, wo eingeladen
 * und der Stand gesetzt wird. Den Rahmen (Titel, Marke „Offen · n“, Kurzfassung) trägt der `Block` des Aufrufers.
 *
 * `rows`: die Einladungen, **`undefined` solange sie laden** und **`null`, wenn sie nicht zu lesen waren** (Fehler oder fehlendes Recht)
 * — ein leerer Block sagte dann „nicht eingeladen“, und das wäre falsch.
 */
export function SideEventsBlock({
  rows,
  gast,
  statusLabels,
  sprache,
  locale,
  t,
}: {
  rows: SpeakerSideEvent[] | null | undefined;
  /** Gäste von Partnern werden nicht eingeladen — die Leerzeile sagt es. */
  gast: boolean;
  /** Bezeichnungen aus `side_event_status` (Vokabular). */
  statusLabels: Record<string, string>;
  /** Formatsprache für Daten („de-DE“). */
  sprache: string;
  /** Sprache der Titel. */
  locale: "de" | "en";
  /** `leads`-Texte. */
  t: Strings;
}) {
  return (
    <div className="flex flex-col gap-3">
      {rows === undefined ? (
        <p className="ct-help" role="status">
          {t.sideEventsLoading}
        </p>
      ) : rows === null ? (
        <p className="ct-help" role="alert">
          {t.sideEventsError}
        </p>
      ) : rows.length === 0 ? (
        <p className="ct-help">{gast ? t.sideEventsEmptyGuest : t.sideEventsEmpty}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li key={r.side_event_id} className="flex flex-col gap-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="ct-label text-ink">{eventTitel(r, locale)}</p>
                  <p className="ct-help tabular-nums">{[eventZeit(sprache, r.starts_at), r.location].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!r.published && <Badge>{t.sideEventsUnpublished}</Badge>}
                  <Badge tone={TON[r.status]}>{statusLabels[r.status] ?? r.status}</Badge>
                </div>
              </div>
              <p className="ct-help tabular-nums">{einladungsTeile(r, sprache, t).join(" · ")}</p>
            </li>
          ))}
        </ul>
      )}
      <div>
        <ButtonLink href={SIDE_EVENTS_PFAD} variant="secondary" size="sm">
          {t.sideEventsManage}
        </ButtonLink>
      </div>
    </div>
  );
}
