/**
 * Kalendereinträge nach RFC 5545 (SPK-014).
 *
 * Bewusst klein: ein `VCALENDAR` mit `VEVENT`s, keine Wiederholungen, keine
 * Teilnehmerverwaltung. Was ein Speaker braucht, ist „steht der Termin in
 * meinem Kalender" — und genau das leistet eine `.ics`-Datei, die man
 * herunterlädt und doppelklickt.
 *
 * **Alle Zeiten in UTC.** Damit entfällt der `VTIMEZONE`-Block, den man sonst
 * für jede Zone mitliefern und bei jeder Sommerzeitregel pflegen müsste. Der
 * Kalender des Empfängers rechnet in seine eigene Zone um — das ist sogar das
 * gewünschte Verhalten für jemanden, der aus einer anderen Zeitzone anreist.
 *
 * **`METHOD:PUBLISH`, nicht `REQUEST`.** `REQUEST` ist eine Einladung mit
 * Zusage und Absage; sie gehört an eine Mail mit `ATTENDEE`-Zeilen. Was hier
 * entsteht, ist ein Termin zum Mitnehmen, kein Antwortformular.
 */

/** Was in genau einem `VEVENT` landet. */
export type IcsEvent = {
  /**
   * Eindeutig und **stabil**: dieselbe Sache ergibt beim nächsten Download
   * dieselbe UID, sonst liegt der Termin hinterher doppelt im Kalender.
   */
  uid: string;
  start: Date;
  /**
   * Ohne Ende wird `DTEND` weggelassen. Nach RFC 5545 ist der Termin dann
   * null Minuten lang. Das sieht knapp aus, ist aber ehrlicher als eine
   * erfundene Dauer — und die Uhrzeit, um die es geht, steht trotzdem richtig
   * im Kalender.
   */
  end?: Date | null;
  /**
   * Ganztägig — für die Veranstaltungstage. Dann stehen `DTSTART` und `DTEND`
   * als reines Datum, und das Ende ist **exklusiv**: der 16. bis 17. April
   * endet am 18. Ohne das fiele der letzte Tag aus dem Kalender.
   */
  allDay?: boolean;
  summary: string;
  location?: string | null;
  description?: string | null;
  /** Link zurück ins Portal, wo die Angaben aktuell stehen. */
  url?: string | null;
};

/** Womit sich das Portal in fremden Kalendern meldet. */
const PRODID = "-//ChefTreff//FLS27 Portal//DE";

/**
 * Sonderzeichen in einem TEXT-Wert maskieren (RFC 5545 §3.3.11).
 *
 * Ohne das zerlegt ein Komma im Titel — „Führung, Vertrauen, Tempo" — den
 * Wert in drei, und der Kalender zeigt nur das erste Drittel.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** `20270416T093000Z` — Basisformat, wie die Spezifikation es verlangt. */
function stamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
}

/** `20270416` — Datum ohne Zeit, für ganztägige Termine. */
function tag(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Eine Zeile auf 75 Oktette umbrechen (RFC 5545 §3.1).
 *
 * Gezählt werden **Bytes, nicht Zeichen** — ein „ü" belegt zwei. Wer nach
 * Zeichen umbricht, liefert bei langen deutschen Titeln zu lange Zeilen, und
 * strenge Parser weisen die Datei ab. Die Folgezeile beginnt mit einem
 * Leerzeichen, das selbst mitzählt.
 */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;

  const teile: string[] = [];
  let aktuell = "";
  let bytes = 0;
  for (const zeichen of line) {
    const n = enc.encode(zeichen).length;
    if (bytes + n > 75) {
      teile.push(aktuell);
      aktuell = "";
      bytes = 1; // das führende Leerzeichen der Folgezeile
    }
    aktuell += zeichen;
    bytes += n;
  }
  teile.push(aktuell);
  return teile.join("\r\n ");
}

function zeile(name: string, value: string): string {
  return fold(`${name}:${escapeText(value)}`);
}

/**
 * Eine vollständige `.ics`-Datei bauen.
 *
 * `now` ist nur für den Test da — im Betrieb ist es der Zeitpunkt des Abrufs.
 */
export function icsCalendar(events: IcsEvent[], options?: { now?: Date }): string {
  const dtstamp = stamp(options?.now ?? new Date());
  const zeilen: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const e of events) {
    zeilen.push("BEGIN:VEVENT");
    zeilen.push(zeile("UID", e.uid));
    zeilen.push(`DTSTAMP:${dtstamp}`);
    if (e.allDay) {
      const ende = new Date((e.end ?? e.start).getTime() + 24 * 60 * 60 * 1000);
      zeilen.push(`DTSTART;VALUE=DATE:${tag(e.start)}`);
      zeilen.push(`DTEND;VALUE=DATE:${tag(ende)}`);
    } else {
      zeilen.push(`DTSTART:${stamp(e.start)}`);
      if (e.end) zeilen.push(`DTEND:${stamp(e.end)}`);
    }
    zeilen.push(zeile("SUMMARY", e.summary));
    if (e.location) zeilen.push(zeile("LOCATION", e.location));
    if (e.description) zeilen.push(zeile("DESCRIPTION", e.description));
    // URL ist kein TEXT-Wert, sondern URI — hier wird nicht maskiert, sonst
    // stünde ein Backslash vor jedem Komma in der Adresse.
    if (e.url) zeilen.push(fold(`URL:${e.url}`));
    zeilen.push("END:VEVENT");
  }

  zeilen.push("END:VCALENDAR");
  // CRLF ist Pflicht, auch am Ende der letzten Zeile.
  return `${zeilen.join("\r\n")}\r\n`;
}

/**
 * Ein Dateiname, der im Download-Ordner noch etwas sagt und keinen Parser
 * stört: nur Kleinbuchstaben, Ziffern und Bindestriche.
 */
export function icsFileName(basis: string): string {
  const sauber = basis
    .normalize("NFKD")
    // Die Zerlegung trennt „ü" in „u" und ein kombinierendes Trema. Bliebe das
    // Trema stehen, machte der nächste Schritt einen Bindestrich daraus und aus
    // „Führung" würde „fu-hrung".
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${sauber || "termine"}.ics`;
}
