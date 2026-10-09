import { ZEITZONE } from "@/lib/side-event/zeit";

/**
 * Side Events je Speaker (ADM-087): was der Block „Side Events“ im Admin-Detail und im Personen-Fenster der Leads zeigt — wozu eine
 * Person eingeladen ist und wie sie geantwortet hat. Gelesen wird über `speaker_side_events(profil)`; die Funktion antwortet nur dem
 * Speaker-Team (Stage Leads, Partner und der Speaker selbst bekommen 42501) und liefert **weder den Hinweis (`note`) noch den Token**.
 * Eingeladen und der Stand gesetzt wird nur unter `/admin/side-events` — der Block liest und verlinkt dorthin.
 *
 * Alles, was sich ausrechnen lässt, steht hier als reine Funktion und wird in `tests/adm-087-speaker-side-events.test.ts` ausgeführt.
 */

type Strings = Record<string, string>;

/** Stand einer Einladung (`side_event_invite.status`). */
export type SideEventStand = "invited" | "yes" | "no";
/** Wie der Stand zustande kam (`side_event_invite.via`). */
export type SideEventWeg = "portal" | "email" | "team";

/** Eine Einladung eines Speakers zu einem Side Event, so wie `speaker_side_events` sie liefert. */
export type SpeakerSideEvent = {
  side_event_id: string;
  title_de: string;
  title_en: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  /** Falsch bei Entwurf oder zurückgezogenem Event: die Einladung steht noch, der Speaker sieht das Event im Portal nicht. */
  published: boolean;
  status: SideEventStand;
  /** Die Begleitung als Zahl (0 bis 3) — der Freitext dazu gehört nicht in diese Sicht. */
  guests: number;
  via: SideEventWeg;
  invited_at: string;
  /** Wann die Einladungsmail in die Warteschlange kam; leer, wenn keine verschickt wurde. */
  mailed_at: string | null;
  responded_at: string | null;
};

/** Die Verwaltung: Einladen und den Stand von Hand setzen gibt es nur dort. */
export const SIDE_EVENTS_PFAD = "/admin/side-events";

/**
 * Unbeantwortete Einladungen zu **veröffentlichten** Events — die Zahl hinter der Marke „Offen · n“. Zu einem Entwurf oder einem
 * zurückgezogenen Event kann niemand antworten; die Zeile zu zählen schickte das Team einer Antwort hinterher, die es nicht gibt.
 */
export function offeneEinladungen(rows: readonly SpeakerSideEvent[]): number {
  return rows.filter((r) => r.status === "invited" && r.published).length;
}

/** Einladungen mit Zusage. */
export function zusagen(rows: readonly SpeakerSideEvent[]): number {
  return rows.filter((r) => r.status === "yes").length;
}

/**
 * Datum und Uhrzeit des Events in Berlin: „16. Apr. 2027, 19:00“. **Zwei Formatierer, nicht einer** — `dateStyle`/`timeStyle` lassen sich
 * nicht mit Einzeloptionen mischen (Lehre aus `lib/side-event/zeit.ts`, die öffentliche Seite gab deswegen 500). Ein unlesbares Datum
 * ergibt einen leeren Text statt eines Fehlers.
 */
export function eventZeit(sprache: string, iso: string): string {
  const zeitpunkt = new Date(iso);
  if (Number.isNaN(zeitpunkt.getTime())) return "";
  const tag = new Intl.DateTimeFormat(sprache, { dateStyle: "medium", timeZone: ZEITZONE });
  const uhr = new Intl.DateTimeFormat(sprache, { hour: "2-digit", minute: "2-digit", timeZone: ZEITZONE });
  return `${tag.format(zeitpunkt)}, ${uhr.format(zeitpunkt)}`;
}

/** Nur das Datum („5. Okt. 2026“), in Berlin. */
export function tagText(sprache: string, iso: string): string {
  const zeitpunkt = new Date(iso);
  if (Number.isNaN(zeitpunkt.getTime())) return "";
  return new Intl.DateTimeFormat(sprache, { dateStyle: "medium", timeZone: ZEITZONE }).format(zeitpunkt);
}

const ersetze = (vorlage: string, werte: Record<string, string>) =>
  Object.entries(werte).reduce((text, [k, v]) => text.replace(`{${k}}`, v), vorlage);

/** Der Titel in der Sprache der Ansicht, mit dem anderen als Rückfall. */
export function eventTitel(r: Pick<SpeakerSideEvent, "title_de" | "title_en">, locale: "de" | "en"): string {
  return (locale === "en" ? r.title_en || r.title_de : r.title_de || r.title_en) || "—";
}

/**
 * Die Zeile unter dem Event als einzelne Angaben (die Oberfläche verbindet sie mit „ · “): wann eingeladen, ob und wann die Mail
 * ging, die Antwort mit Weg, die Begleitung nach einer Zusage; bei einem nicht veröffentlichten Event der Hinweis, dass der Speaker
 * es im Portal nicht sieht.
 */
export function einladungsTeile(r: SpeakerSideEvent, sprache: string, t: Strings): string[] {
  const teile: string[] = [ersetze(t.sideEventInvitedOn, { datum: tagText(sprache, r.invited_at) })];
  teile.push(r.mailed_at ? ersetze(t.sideEventMailedOn, { datum: tagText(sprache, r.mailed_at) }) : t.sideEventNoMail);
  if (r.responded_at) {
    teile.push(ersetze(t.sideEventAnsweredOn, { datum: tagText(sprache, r.responded_at), weg: t[`sideEventVia_${r.via}`] ?? r.via }));
  }
  if (r.status === "yes" && r.guests > 0) teile.push(ersetze(t.sideEventGuests, { n: String(r.guests) }));
  if (!r.published) teile.push(t.sideEventNotVisible);
  return teile;
}

/** Die Marke des Blocks: „Offen“ bzw. „Offen · n“ bei unbeantworteten Einladungen, sonst keine. */
export function sideEventsMarke(rows: readonly SpeakerSideEvent[], t: Strings): { text: string; ton: "warning" } | undefined {
  const offen = offeneEinladungen(rows);
  if (offen === 0) return undefined;
  return { text: offen > 1 ? ersetze(t.markOpenN, { n: String(offen) }) : t.markOpen, ton: "warning" };
}

/** Die Zeile für den zugeklappten Block: „2 Einladungen · 1 zugesagt“ bzw. „Zu keinem Side Event eingeladen“. */
export function sideEventsKurz(rows: readonly SpeakerSideEvent[], t: Strings): string {
  if (rows.length === 0) return t.sideEventsShortNone;
  const einladungen = rows.length === 1 ? t.sideEventsShortOne : ersetze(t.sideEventsShortN, { n: String(rows.length) });
  const zugesagt = zusagen(rows);
  return [einladungen, zugesagt > 0 ? ersetze(t.sideEventsShortYes, { n: String(zugesagt) }) : null].filter(Boolean).join(" · ");
}
