/**
 * „Eure Bühne“ (PART-138, K-84): Standbühne und gebrandete Bühne teilen die Seite `/partner/buehne`, aber nicht jeden Reiter. Was davon die Art der Bühne
 * entscheidet, steht hier als reine Funktion — die Seiten fragen, was sie zeigen, und rechnen die Art nicht selbst. Die Art liefert die Datenbank
 * (`stage.kind`, 0274), nie die Oberfläche.
 *
 * - **Standbühne** (`booth`, 18 qm auf der Messe): Kalender, Tabelle (PART-078; dort geht „Veröffentlichen“ als Anfrage an die Programmleitung) und Gäste (PART-081).
 * - **Gebrandete Bühne** (`branded`, eine unserer Bühnen mit Partner): Kalender und Speaker. Ihre Speaker sind reguläre Speaker (PART-091, Konrad 25.09.) mit Zugang,
 *   Pipeline und Onboarding wie bei jedem Partner-Speaker — deshalb **keine Gäste** (`partner_assign_stage_guest` lässt sie dort ohnehin nicht zu). Die Tabelle bleibt
 *   der Standbühne: „Veröffentlichen anfragen“ (`partner_request_publish`) kennt nur sie; ob die gebrandete Bühne es bekommt, klärt PART-148.
 */

export const BUEHNE_STAND = "booth";
export const BUEHNE_GEBRANDET = "branded";

/** Welche Reiter hinter dem Kalender stehen. Der Kalender selbst gehört immer dazu. */
export type BuehnenReiter = { tabelle: boolean; gaeste: boolean; speaker: boolean };

/** Die Reiter für die Bühnen **einer Organisation** (ihre Arten, `null` = unbekannt). Eine Fläche anderer Art (Interview Table, Raum, Side-Event-Ort) bringt keinen Reiter. */
export function buehnenReiter(arten: readonly (string | null | undefined)[]): BuehnenReiter {
  const stand = arten.includes(BUEHNE_STAND);
  return { tabelle: stand, gaeste: stand, speaker: arten.includes(BUEHNE_GEBRANDET) };
}

/** Der Pfad der Seite „Eure Bühne“; die Reiter hängen als Unterseiten daran (eigene Pfade statt eines Parameters, damit jede Sicht ein Lesezeichen verträgt). */
export const BUEHNE_PFAD = "/partner/buehne";

/**
 * Die Reiter als Links, in fester Reihenfolge: Kalender, Tabelle, Gäste, Speaker. Der Kalender steht immer da; mit ihm allein gibt es nichts zu wählen
 * (`BuehnenTabs` zeichnet dann keine Leiste).
 */
export function buehnenReiterLinks(
  reiter: BuehnenReiter,
  t: { board: string; table: string; guests: string; speakers: string },
): { href: string; label: string; exact?: boolean }[] {
  return [
    { href: BUEHNE_PFAD, label: t.board, exact: true },
    ...(reiter.tabelle ? [{ href: `${BUEHNE_PFAD}/tabelle`, label: t.table }] : []),
    ...(reiter.gaeste ? [{ href: `${BUEHNE_PFAD}/gaeste`, label: t.guests }] : []),
    ...(reiter.speaker ? [{ href: `${BUEHNE_PFAD}/speaker`, label: t.speakers }] : []),
  ];
}

/**
 * Auf der Standbühne **und** auf der gebrandeten Bühne gilt das Öffnungsfenster (PART-090, K-84) — dieselbe Menge wie `partner_booth_window`
 * (`st.kind in ('booth', 'branded')`); `tests/part-138-eure-buehne-seite.test.ts` hält beide Seiten zusammen.
 */
export function hatOeffnungsfenster(kind: string | null | undefined): boolean {
  return kind === BUEHNE_STAND || kind === BUEHNE_GEBRANDET;
}

/** „Science Stage (Gebrandete Bühne)“ — der Name mit der Art, soweit es eine der beiden gibt; sonst nur der Name. */
export function buehnenName(
  name: string | null | undefined,
  kind: string | null | undefined,
  t: { kindBooth: string; kindBranded: string },
): string {
  const art = kind === BUEHNE_STAND ? t.kindBooth : kind === BUEHNE_GEBRANDET ? t.kindBranded : null;
  const n = name?.trim() ?? "";
  if (n === "") return art ?? "";
  return art ? `${n} (${art})` : n;
}

// ---------------------------------------------------------------- Speaker der gebrandeten Bühne

/**
 * Die Formate, für die `partner_add_speaker` einen Speaker annimmt — dieselbe Liste wie in der Funktion
 * (`invalid_format`); der Test liest sie aus dem Snapshot und hält beide zusammen.
 */
export const SPEAKER_FORMATE: readonly string[] = ["keynote", "panel", "talk", "impulse", "fireside_chat", "masterclass"];

/** Die Spalten der Programmzeile (`programme_board`), die der Reiter „Speaker“ braucht — strukturell, damit die Datei ohne das Board auskommt. */
export type BuehnenZeile = {
  stage_id: string;
  stage_name: string;
  start_at: string;
  end_at: string;
  session_id: string | null;
  title_de: string | null;
  title_en: string | null;
  format: string | null;
  publish_status: string | null;
  speakers: { person_id: string; role: string | null; first_name: string | null; last_name: string | null }[] | null;
};

/** Ein Programmpunkt auf einer gebrandeten Bühne, wie ihn der Reiter „Speaker“ zeichnet. */
export type BuehnenSession = {
  sessionId: string;
  titleDe: string | null;
  titleEn: string | null;
  format: string;
  publishStatus: string | null;
  startAt: string;
  endAt: string;
  stageName: string;
  /** Wer nach dem Programm spricht — ohne Moderation, nur Person und Name. */
  speakers: { personId: string; name: string }[];
};

function personName(sp: { first_name: string | null; last_name: string | null }): string {
  return [sp.first_name, sp.last_name].filter(Boolean).join(" ") || "—";
}

/**
 * Die Programmpunkte auf den **gegebenen** Bühnen, in der Reihenfolge des Programms: nur mit Session, nur in einem Format, für das ein Speaker eingetragen werden
 * kann, und nicht abgesagt. Gelesen wird die Programmzeile, nicht `partner_format_sessions` — die Liste gilt nur für Sessions mit eigener Organisation, und das Team
 * legt Sessions auf einer gebrandeten Bühne ohne sie an (PART-148).
 */
export function buehnenSessions(rows: readonly BuehnenZeile[], buehnenIds: ReadonlySet<string>): BuehnenSession[] {
  const sessions: BuehnenSession[] = [];
  for (const r of rows) {
    if (!r.session_id || !r.format) continue;
    if (!buehnenIds.has(r.stage_id)) continue;
    if (!SPEAKER_FORMATE.includes(r.format)) continue;
    if (r.publish_status === "cancelled") continue;
    sessions.push({
      sessionId: r.session_id,
      titleDe: r.title_de,
      titleEn: r.title_en,
      format: r.format,
      publishStatus: r.publish_status,
      startAt: r.start_at,
      endAt: r.end_at,
      stageName: r.stage_name,
      speakers: (r.speakers ?? [])
        .filter((sp) => sp.role !== "moderator")
        .map((sp) => ({ personId: sp.person_id, name: personName(sp) })),
    });
  }
  return sessions.sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime() || a.sessionId.localeCompare(b.sessionId),
  );
}

/**
 * Die Namen der Speaker eines Programmpunkts, die der Partner **nicht** selbst eingetragen hat (das Team, oder die Person war schon da) — nur zur Anzeige,
 * ohne Knopf. Ohne diese Zeile stünde „Noch niemand eingetragen“ über einem Programmpunkt, auf dem das Team längst jemanden hat, und der Partner trüge sie doppelt ein.
 */
export function vomTeamEingetragen(
  speakers: readonly { personId: string; name: string }[],
  eigenePersonen: ReadonlySet<string>,
): string[] {
  return speakers.filter((sp) => !eigenePersonen.has(sp.personId)).map((sp) => sp.name);
}
