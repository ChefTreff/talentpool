import { ZEITZONE } from "@/lib/side-event/zeit";

/**
 * Shuttle-Sperre (LEAD-065, K-64, Konrad 08.10.2026): ab dem Beginn der Shuttle-Periode gehen neue Fahrten und Änderungen nicht mehr über
 * das Portal — die finale Freigabe bleibt beim Speaker-Team (Paulina), und stattdessen steht im Portal ein Hinweis „Anfragen ab jetzt direkt
 * über <Name>“ mit dem Kontakt `speaker_lead`. Die Sperre entscheidet die Datenbank (`request_shuttle` und `cancel_shuttle` antworten mit
 * `shuttle_locked`); die Seiten lesen `shuttle_lock_status` nur, um das Formular und die Stornierung gar nicht erst anzubieten und den
 * Hinweis zu zeigen. Hier steht, was sich ausrechnen lässt — als reine Funktionen, die der Test ausführt.
 */

type Strings = Record<string, string>;

/** Die Zeile aus `shuttle_lock_status`: `locked` gilt **für den Aufrufer** (das Speaker-Team ist nie gesperrt). */
export type ShuttleSperre = {
  locked: boolean;
  /** Der Zeitpunkt der Frist `shuttle_lock_from`, auch vor dem Erreichen. */
  lock_from: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
};

/** Die erste Zeile der Antwort als Stand — `null`, wenn keine kam (Fehler oder noch keine Migration). */
export function sperreAusAntwort(daten: unknown): ShuttleSperre | null {
  const zeile = Array.isArray(daten) ? daten[0] : daten;
  if (!zeile || typeof zeile !== "object") return null;
  const z = zeile as Record<string, unknown>;
  if (typeof z.locked !== "boolean") return null;
  const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  return {
    locked: z.locked,
    lock_from: text(z.lock_from),
    contact_name: text(z.contact_name),
    contact_phone: text(z.contact_phone),
    contact_email: text(z.contact_email),
  };
}

/**
 * Datum und Uhrzeit des Sperrzeitpunkts in der Zeit der Veranstaltung: „01.04.2027, 09:00“. **Zwei Formatierer, nicht einer** —
 * `dateStyle` lässt sich nicht mit Einzeloptionen mischen (Lehre aus `lib/side-event/zeit.ts`). Ein unlesbares Datum ergibt einen leeren Text.
 */
export function sperrZeit(sprache: string, iso: string): string {
  const zeitpunkt = new Date(iso);
  if (Number.isNaN(zeitpunkt.getTime())) return "";
  const tag = new Intl.DateTimeFormat(sprache, { dateStyle: "medium", timeZone: ZEITZONE });
  const uhr = new Intl.DateTimeFormat(sprache, { hour: "2-digit", minute: "2-digit", timeZone: ZEITZONE });
  return `${tag.format(zeitpunkt)}, ${uhr.format(zeitpunkt)}`;
}

const ersetze = (vorlage: string, werte: Record<string, string>) =>
  Object.entries(werte).reduce((text, [k, v]) => text.replace(`{${k}}`, v), vorlage);

/** Der Hinweis, den eine gesperrte Seite zeigt: ein Satz zum Stand, wer jetzt zuständig ist, und die Wege zu ihm. */
export type SperrHinweis = { lead: string; kontakt: string; zeilen: string[] };

/**
 * Der Hinweistext. **Wer zuständig ist, kommt aus dem Kontakt** (`speaker_lead`), nie aus dem Quelltext — ohne Kontakt steht „das Speaker-Team“.
 * Telefon und E-Mail stehen nur, wenn der Kontakt sie führt (das Serviceversprechen: Ansprechpersonen mit Name, E-Mail und Telefon, AGENTS.md);
 * eine leere Nummer wird nie als Zeile gezeigt.
 */
export function sperrHinweis(sperre: ShuttleSperre, sprache: string, t: Strings): SperrHinweis {
  const datum = sperre.lock_from ? sperrZeit(sprache, sperre.lock_from) : "";
  const lead = datum ? ersetze(t.shuttleLockedLead, { datum }) : t.shuttleLockedLeadNoDate;
  if (!sperre.contact_name) return { lead, kontakt: t.shuttleLockedTeam, zeilen: [] };
  const zeilen: string[] = [];
  if (sperre.contact_phone) zeilen.push(ersetze(t.shuttleLockedPhone, { phone: sperre.contact_phone }));
  if (sperre.contact_email) zeilen.push(ersetze(t.shuttleLockedEmail, { email: sperre.contact_email }));
  return { lead, kontakt: ersetze(t.shuttleLockedContact, { name: sperre.contact_name }), zeilen };
}
