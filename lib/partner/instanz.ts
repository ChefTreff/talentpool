/**
 * Mehrere Instanzen auf einer Seite (QS-079, Konrad 09.10.2026: „bitte global immer so handhaben“) — die reinen Regeln hinter dem Umschalter.
 *
 * Zeigt eine Seite mehrere Instanzen desselben Dings (zwei Masterclasses, mehrere Tische, Stopps), steht **ein Umschalter** oben, die gewählte Instanz
 * in der Adresse als `?instanz=<id>`, und darunter genau **eine** Instanz mit ihren Formularen (Skill `portal-design`, Regel 12; `referenzen/muster.md` →
 * „Mehrere Instanzen“). Hier steht, was ohne Bildschirm prüfbar ist: welche Instanz gewählt ist, wie ihre Adresse lautet und wie der Reiter heißt.
 * Gezeichnet wird der Umschalter von `components/layout/InstanzWahl.tsx` (eine dünne Hülle um `SectionTabs` mit `aktiv`).
 */
import { rueckgabeOffen } from "@/lib/partner/rueckgabe";

/** Was eine Session mitbringen muss, damit „von der Programmleitung zurückgegeben“ erkennbar ist (`partner_format_sessions`). */
type Rueckgabefaehig = { return_note: string | null; returned_at: string | null; publish_status: string | null };

/** Name der Abfrage; auf allen Mehrfach-Seiten derselbe (Plan 09.10.2026), damit Mails und Aufgaben mit `?instanz=` direkt in die Instanz verlinken. */
export const INSTANZ_PARAM = "instanz";

/** Die Kennung aus `searchParams.instanz`: bei Wiederholung (`?instanz=a&instanz=b`) die erste, ohne Leerraum; leer heißt „keine“. */
export function instanzKennung(wert: string | string[] | undefined): string | undefined {
  const erste = (Array.isArray(wert) ? wert[0] : wert)?.trim();
  return erste ? erste : undefined;
}

/**
 * Die gewählte Instanz: die gewünschte, sonst die Vorgabe der Seite (die Instanz, die etwas von der Person will), sonst die erste.
 * Eine unbekannte Kennung ist kein 404 und keine Fehlermeldung — es kommt immer dieselbe Instanz. Ohne Instanzen `null`.
 */
export function waehleInstanz<T extends { id: string }>(
  liste: readonly T[],
  kennung: string | undefined,
  vorgabe?: (liste: readonly T[]) => T | undefined,
): T | null {
  if (liste.length === 0) return null;
  return liste.find((x) => x.id === kennung) ?? vorgabe?.(liste) ?? liste[0];
}

/** Die Adresse einer Instanz: nur die Abfrage, der Pfad bleibt der der Seite (`<Link href="?instanz=…">`). */
export function instanzHref(id: string): string {
  return `?${INSTANZ_PARAM}=${encodeURIComponent(id)}`;
}

/**
 * Reiterbeschriftung je Instanz: der Titel. Fehlt er oder kommt er mehrfach vor (zwei „TEST — Masterclass“), steht an seiner Stelle Nummer und Slot —
 * „Masterclass 1 · Fr 10:00“; ohne Slot nur die Nummer. Die Nummer zählt in der Reihenfolge der Liste; `nummer(n)` liefert das Wort dazu aus dem Wörterbuch.
 */
export function instanzTitel(
  liste: readonly { titel: string | null; slot: string | null }[],
  nummer: (n: number) => string,
): string[] {
  const vorkommen = new Map<string, number>();
  for (const x of liste) {
    const k = (x.titel ?? "").trim().toLowerCase();
    if (k) vorkommen.set(k, (vorkommen.get(k) ?? 0) + 1);
  }
  return liste.map((x, i) => {
    const titel = (x.titel ?? "").trim();
    if (titel && vorkommen.get(titel.toLowerCase()) === 1) return titel;
    return [nummer(i + 1), x.slot].filter(Boolean).join(" · ");
  });
}

/** Was der Umschalter zeichnet: die Reiter (Kennung und Beschriftung) und welcher gewählt ist. */
export type InstanzLeiste = { items: { id: string; label: string }[]; gewaehlt: string };

/** Der Umschalter gibt es **ab zwei Instanzen**; bei einer ist die Seite wie vorher, bei keiner gibt es nichts zu wählen — dann `null`. */
export function instanzLeiste(items: { id: string; label: string }[], gewaehlt: string | undefined): InstanzLeiste | null {
  return items.length > 1 && gewaehlt !== undefined ? { items, gewaehlt } : null;
}

/** Der Slot als Kurzform für den Reiter („Fr 10:00“), in Berliner Zeit; `null` ohne Slot oder bei einem Wert, den es nicht gibt. */
export function kurzSlot(startsAt: string | null, dateLocale: string): string | null {
  if (!startsAt) return null;
  const zeitpunkt = new Date(startsAt);
  if (Number.isNaN(zeitpunkt.getTime())) return null;
  // Zwei Formate statt einem: ein gemeinsames gäbe „Fr., 10:00“ (mit Komma und Punkt), der Reiter soll „Fr 10:00“ heißen.
  const tag = new Intl.DateTimeFormat(dateLocale, { weekday: "short", timeZone: "Europe/Berlin" }).format(zeitpunkt);
  const uhr = new Intl.DateTimeFormat(dateLocale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(zeitpunkt);
  return `${tag} ${uhr}`;
}

/** Fehlt der Instanz noch Inhalt, den nur die Person liefern kann? Titel und Beschreibung (deutsch) sind Pflicht, bevor die Programmleitung etwas sieht. */
export function brauchtInhalt(x: { title_de: string | null; description_de: string | null }): boolean {
  return !(x.title_de ?? "").trim() || !(x.description_de ?? "").trim();
}

/** Der Adressanhang, den jede Sicht der Seite mitnimmt (`?instanz=<id>`), damit der Wechsel zwischen den Sichten in derselben Instanz bleibt; ohne Umschalter leer. */
export function instanzSuffix(leiste: InstanzLeiste | null): string {
  return leiste ? instanzHref(leiste.gewaehlt) : "";
}

/**
 * Welche Masterclass öffnet ohne Wunsch? Die, die etwas von der Person will: von der Programmleitung zurückgegeben (der Grund steht dort und wartet),
 * sonst eine ohne Titel oder Beschreibung. Findet sich keine, gilt die erste (`waehleInstanz`).
 */
export function vorgabeMasterclass<T extends Rueckgabefaehig & { title_de: string | null; description_de: string | null }>(liste: readonly T[]): T | undefined {
  return liste.find((x) => rueckgabeOffen(x)) ?? liste.find(brauchtInhalt);
}

/**
 * Welcher Tisch (Interview Tables) öffnet ohne Wunsch? Der mit einem von der Programmleitung zurückgegebenen Gespräch, sonst einer **ohne jedes Gespräch** —
 * dort ist das Anlegen der Zeitfenster der nächste Schritt. Sonst gilt der erste. Die Gespräche hängen über `stage_id` am Tisch, nicht über den Namen
 * (zwei Tische dürfen gleich heißen).
 */
export function vorgabeTisch<S extends { id: string }>(
  tische: readonly S[],
  gespraeche: readonly (Rueckgabefaehig & { stage_id: string | null })[],
): S | undefined {
  return (
    tische.find((t) => gespraeche.some((g) => g.stage_id === t.id && rueckgabeOffen(g))) ??
    tische.find((t) => !gespraeche.some((g) => g.stage_id === t.id))
  );
}

/**
 * Die Tischwahl der Interview Tables — für die Formatseite und für ihre Sichten (Bewerbungen, Teilnehmende, Fragen) dieselbe Regel: der gewählte Tisch
 * und der Umschalter (ab zwei Tischen). Der Reiter trägt den Namen des Tisches; heißen zwei gleich, „Tisch 1“ und „Tisch 2“.
 */
export function tischWahl<T extends { id: string; name: string }>(
  tische: readonly T[],
  gespraeche: readonly (Rueckgabefaehig & { stage_id: string | null })[],
  kennung: string | undefined,
  nummer: (n: number) => string,
): { gewaehlt: T | null; instanzen: InstanzLeiste | null } {
  const gewaehlt = waehleInstanz(tische, kennung, (liste) => vorgabeTisch(liste, gespraeche));
  const titel = instanzTitel(tische.map((x) => ({ titel: x.name, slot: null })), nummer);
  return { gewaehlt, instanzen: instanzLeiste(tische.map((x, i) => ({ id: x.id, label: titel[i] })), gewaehlt?.id) };
}
