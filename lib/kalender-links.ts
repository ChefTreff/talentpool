/**
 * „In den Kalender" für Google und Outlook (SPK-026).
 *
 * Apple braucht nichts davon: dort importiert man eine `.ics`, und die liefert
 * `/api/speaker/kalender` bereits (SPK-014). Google und Microsoft dagegen
 * kennen keine Datei, sondern eine vorausgefüllte Adresse — deshalb diese
 * beiden Funktionen und kein drittes Format.
 *
 * **Alles in UTC.** Die Portale rechnen selbst in die Zone der Nutzerin um;
 * eine Zeitzone mitzugeben hiesse, sie in zwei Systemen richtig zu halten.
 */

/** Ein Termin, wie ihn beide Anbieter brauchen. */
export type KalenderTermin = {
  titel: string;
  start: Date;
  /**
   * Ohne Ende setzen wir Ende = Start. Google verlangt eine Spanne, und ein
   * Null-Minuten-Termin ist ehrlicher als eine geratene Stunde — dieselbe
   * Entscheidung wie beim fehlenden `DTEND` in `lib/ics.ts`.
   */
  ende?: Date | null;
  /**
   * Ganztägig — für die Veranstaltungstage. Dann zählt nur das Datum, und das
   * Ende ist **exklusiv**: der 16. bis 17. April ist `20270416/20270418`.
   */
  ganztaegig?: boolean;
  ort?: string | null;
  beschreibung?: string | null;
};

/** `20270416T073000Z` */
function stempel(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** `20270416` */
function tag(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Der Tag danach — beide Anbieter erwarten ein exklusives Ende. */
function tagDanach(d: Date): Date {
  return new Date(d.getTime() + 24 * 60 * 60 * 1000);
}

function ende(t: KalenderTermin): Date {
  return t.ende ?? t.start;
}

/** Adresse, die Googles Kalender mit einem vorausgefüllten Termin öffnet. */
export function googleKalenderUrl(t: KalenderTermin): string {
  const spanne = t.ganztaegig
    ? `${tag(t.start)}/${tag(tagDanach(ende(t)))}`
    : `${stempel(t.start)}/${stempel(ende(t))}`;
  const p = new URLSearchParams({ action: "TEMPLATE", text: t.titel, dates: spanne });
  if (t.ort) p.set("location", t.ort);
  if (t.beschreibung) p.set("details", t.beschreibung);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/**
 * Adresse, die Outlook mit einem vorausgefüllten Termin öffnet.
 *
 * `outlook.office.com` ist der Weg für Geschäftskonten; unsere Speaker kommen
 * fast alle mit einem. Wer ein privates Outlook-Konto hat, wird von dort
 * weitergeleitet.
 */
export function outlookKalenderUrl(t: KalenderTermin): string {
  const p = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: t.titel,
  });
  if (t.ganztaegig) {
    p.set("allday", "true");
    p.set("startdt", t.start.toISOString().slice(0, 10));
    p.set("enddt", tagDanach(ende(t)).toISOString().slice(0, 10));
  } else {
    p.set("startdt", t.start.toISOString());
    p.set("enddt", ende(t).toISOString());
  }
  if (t.ort) p.set("location", t.ort);
  if (t.beschreibung) p.set("body", t.beschreibung);
  return `https://outlook.office.com/calendar/0/deeplink/compose?${p.toString()}`;
}
