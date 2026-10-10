/**
 * Berichte und Export im Speaker-Admin (ADM-078) — reine Zusammensetzung ohne Netz und ohne `server-only`, damit `npm test` sie ausführt. Die Seite
 * (`/admin/speaker/export`) und der Download (`/admin/speaker/export/datei`) bauen **dieselbe** Tabelle aus denselben Spalten: was die Vorschau zeigt, steht in
 * der Datei.
 *
 * Konrad am 05.10. (To-do aus der Feedbackrunde): „eine Exportsektion im Speaker-Admin hinzufügen, wo man sich verschiedene Berichte zusammenstellen und sehen
 * kann“; Paulina: „eine riesige Excel, wo alle Daten auf einen Blick drin sind … ein Final Check“. Drei Berichte aus vorhandenen Quellen — keine neue Datenbankfunktion:
 *
 * - **Speaker-Gesamtliste**: eine Zeile je Speaker der Edition (`manager_speakers`, dieselbe Quelle wie die Liste unter `/admin/speaker`),
 * - **Hotelliste**: eine Zeile je Hotelbuchung (`hospitality_admin_overview`, Kontingente der Art `hotel`),
 * - **Programm je Bühne**: eine Zeile je Session mit Slot (`programme_board`).
 *
 * Die Shuttle- und die Lounge-Liste haben eigene Quellen und Rechte und bleiben, wo sie sind; die Seite verweist darauf.
 *
 * Jede Zelle läuft in der Datei durch `lib/csv.ts` (Formelschutz): Namen, Notizen und Titel sind Freitext, und das Team öffnet die Datei in Excel.
 */
import { csvCell } from "@/lib/csv";
import type { ManagedSpeaker } from "@/app/(speaker-leads)/speaker-leads/types";

export const BERICHTE = ["speaker", "hotel", "programm"] as const;
export type BerichtId = (typeof BERICHTE)[number];

/** So viele Zeilen zeigt die Vorschau; die Datei enthält alle. */
export const VORSCHAU_ZEILEN = 100;

/** Der Bericht aus der Adresszeile; alles Unbekannte ist die Speaker-Gesamtliste. */
export function waehleBericht(param: string | string[] | undefined): BerichtId {
  const roh = Array.isArray(param) ? param[0] : param;
  return (BERICHTE as readonly string[]).includes(roh ?? "") ? (roh as BerichtId) : "speaker";
}

export type Zelle = string | number;

/**
 * Was die Spalten zum Beschriften brauchen. Die Wörter kommen aus den Wörterbüchern und dem Vokabular, nie von Hand (Skill-Regel 8): `vokabular` ist, was `vgroup`
 * je Gruppe liefert, `woerter` ein flaches Wörterbuch (`ja`, `nein`, `moderation`, `booking_<stand>`).
 */
export type ExportKontext = {
  vokabular: Record<string, Record<string, string>>;
  woerter: Record<string, string>;
  /** Sprache der Titel in den Listen. */
  sprache: "de" | "en";
};

export type Spalte<Z> = {
  key: string;
  /** Die Gruppe, unter der die Spalte in der Auswahl steht (Wörterbuch `group_<gruppe>`). */
  gruppe: string;
  /** Breite der Spalte in der Excel-Datei. */
  breite: number;
  /** Ist ohne Auswahl dabei. */
  standard: boolean;
  wert: (zeile: Z, k: ExportKontext) => Zelle;
};

const spalte = <Z>(key: string, gruppe: string, breite: number, standard: boolean, wert: Spalte<Z>["wert"]): Spalte<Z> => ({ key, gruppe, breite, standard, wert });

/** Trenner zwischen mehreren Werten in einer Zelle (zwei Sessions, zwei Bühnen). Gleiche Reihenfolge in allen Spalten, damit sie nebeneinander passen. */
export const TRENNER = " | ";

// ─── Formate ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const ZEITZONE = "Europe/Berlin";
const DATUM_ZEIT = new Intl.DateTimeFormat("de-DE", {
  timeZone: ZEITZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function teile(iso: string): Record<string, string> | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Object.fromEntries(DATUM_ZEIT.formatToParts(d).map((t) => [t.type, t.value]));
}

const NUR_DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `TT.MM.JJJJ` — ein Kalendertag (`2027-04-16`) bleibt, wie er ist; ein Zeitpunkt zählt in Berliner Zeit. Leer und unlesbar kommen leer bzw. unverändert zurück. */
export function datum(wert: string | null | undefined): string {
  if (!wert) return "";
  const tag = NUR_DATUM.exec(wert);
  if (tag) return `${tag[3]}.${tag[2]}.${tag[1]}`;
  const t = teile(wert);
  return t ? `${t.day}.${t.month}.${t.year}` : wert;
}

/** `TT.MM.JJJJ HH:MM` in Berliner Zeit — so steht ein Slot im Programm, nicht in der Zone des Servers. */
export function datumZeit(wert: string | null | undefined): string {
  if (!wert) return "";
  const t = teile(wert);
  return t ? `${t.day}.${t.month}.${t.year} ${t.hour}:${t.minute}` : wert;
}

/** `HH:MM` in Berliner Zeit. */
export function uhrzeit(wert: string | null | undefined): string {
  if (!wert) return "";
  const t = teile(wert);
  return t ? `${t.hour}:${t.minute}` : wert;
}

/** Ein Wert, der ein Tag, ein Zeitpunkt oder Freitext sein kann (die Angaben einer Hotelbuchung): Tag und Zeitpunkt werden gelesen, alles andere bleibt. */
function datumOderText(wert: string | null | undefined): string {
  if (!wert) return "";
  if (NUR_DATUM.test(wert)) return datum(wert);
  return /^\d{4}-\d{2}-\d{2}T/.test(wert) ? datumZeit(wert) : wert;
}

const vok = (k: ExportKontext, gruppe: string, wert: string | null | undefined): string => (wert ? (k.vokabular[gruppe]?.[wert] ?? wert) : "");
const jaNein = (k: ExportKontext, wert: boolean | null | undefined): string => (wert ? (k.woerter.ja ?? "ja") : (k.woerter.nein ?? "nein"));
const titelVon = (t: { title_de: string | null; title_en: string | null }, sprache: "de" | "en"): string =>
  (sprache === "en" ? (t.title_en ?? t.title_de) : (t.title_de ?? t.title_en)) ?? "";

// ─── Speaker-Gesamtliste ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

type S = ManagedSpeaker;
const sessionsVon = (z: S) => z.sessions ?? [];

/**
 * Alle Felder, die `manager_speakers` liefert, in Gruppen. Vorgewählt ist, was Paulinas Final-Check braucht: wer, wo, wie weit, wer betreut, was gebucht ist;
 * die interne Notiz und die Einordnung bleiben ausgewählt-bar, aber aus.
 */
export const SPEAKER_SPALTEN: Spalte<S>[] = [
  spalte<S>("last_name", "person", 18, true, (z) => z.last_name ?? ""),
  spalte<S>("first_name", "person", 16, true, (z) => z.first_name ?? ""),
  spalte<S>("title", "person", 10, false, (z) => z.title ?? ""),
  spalte<S>("email", "person", 30, true, (z) => z.email ?? ""),
  spalte<S>("job_title", "person", 26, true, (z) => z.job_title ?? ""),
  spalte<S>("organization", "person", 26, true, (z) => z.organization_name ?? ""),
  spalte<S>("speaker_type", "stand", 16, true, (z, k) => vok(k, "speaker_type", z.speaker_type)),
  spalte<S>("pipeline_status", "stand", 16, true, (z, k) => vok(k, "speaker_pipeline", z.pipeline_status)),
  spalte<S>("owner_name", "stand", 20, true, (z) => z.owner_name ?? ""),
  spalte<S>("invited_at", "stand", 14, false, (z) => datum(z.invited_at)),
  spalte<S>("confirmed_at", "stand", 14, true, (z) => datum(z.confirmed_at)),
  spalte<S>("declined_at", "stand", 14, false, (z) => datum(z.declined_at)),
  spalte<S>("decline_reason", "stand", 22, false, (z, k) => vok(k, "speaker_decline_reason", z.decline_reason)),
  spalte<S>("open_tasks", "stand", 12, false, (z) => z.open_tasks ?? 0),
  spalte<S>("next_task", "stand", 34, false, (z) => (z.next_task ? `${z.next_task.body} (${datum(z.next_task.due_on)})` : "")),
  spalte<S>("last_activity_at", "stand", 16, false, (z) => datum(z.last_activity_at)),
  spalte<S>("assistant_name", "stand", 24, false, (z) => z.assistant_name ?? ""),
  spalte<S>("open_steps", "stand", 12, true, (z) => z.next_open?.length ?? 0),
  spalte<S>("category", "einordnung", 18, false, (z, k) => vok(k, "speaker_category", z.category)),
  spalte<S>("topic_cluster", "einordnung", 20, false, (z, k) => vok(k, "topic_cluster", z.topic_cluster)),
  spalte<S>("topic_role", "einordnung", 20, false, (z) => z.topic_role ?? ""),
  spalte<S>("priority", "einordnung", 12, false, (z, k) => vok(k, "speaker_priority", z.priority)),
  spalte<S>("recommended_format", "einordnung", 18, false, (z, k) => vok(k, "session_format", z.recommended_format)),
  spalte<S>("stage_candidates", "einordnung", 26, false, (z) => (z.stage_candidates ?? []).map((b) => b.name).join(", ")),
  spalte<S>("contact_via", "einordnung", 22, false, (z) => z.contact_via ?? ""),
  spalte<S>("outreach_channel", "einordnung", 16, false, (z, k) => vok(k, "outreach_channel", z.outreach_channel)),
  spalte<S>("session_title", "programm", 40, true, (z, k) => sessionsVon(z).map((s) => titelVon(s, k.sprache)).join(TRENNER)),
  spalte<S>("session_stage", "programm", 22, true, (z) => sessionsVon(z).map((s) => s.stage_name ?? "").join(TRENNER)),
  spalte<S>("session_start", "programm", 22, true, (z) => sessionsVon(z).map((s) => datumZeit(s.start_at)).join(TRENNER)),
  spalte<S>("session_status", "programm", 18, false, (z, k) => sessionsVon(z).map((s) => vok(k, "publish_status", s.publish_status)).join(TRENNER)),
  spalte<S>("hospitality_status", "hospitality", 18, true, (z, k) => vok(k, "hospitality_status", z.hospitality_status)),
  spalte<S>("hotel_tier", "hospitality", 16, true, (z, k) => vok(k, "hotel_tier", z.hotel_tier)),
  spalte<S>("pass_type", "hospitality", 16, true, (z, k) => vok(k, "ticket_type", z.pass_type)),
  spalte<S>("lounge_access", "hospitality", 10, true, (z, k) => jaNein(k, z.lounge_access)),
  spalte<S>("travel_costs_covered", "hospitality", 16, true, (z, k) => jaNein(k, z.travel_costs_covered)),
  spalte<S>("travel_costs_approved", "hospitality", 16, false, (z, k) => jaNein(k, z.travel_costs_approved)),
  spalte<S>("stage_guest", "weiteres", 14, false, (z, k) => jaNein(k, z.stage_guest)),
  spalte<S>("updated_at", "weiteres", 14, false, (z) => datum(z.updated_at)),
  spalte<S>("internal_notes", "weiteres", 40, false, (z) => z.internal_notes ?? ""),
];

// ─── Hotelliste ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Eine Buchung in einem Kontingent, wie `hospitality_admin_overview` sie liefert (`bookings` je Kontingent). */
export type BuchungQuelle = {
  id: string;
  status: string;
  guests: number;
  details: Record<string, string> | null;
  team_note: string | null;
  created_at: string;
  profile_id: string;
  speaker_name: string | null;
};

/** Ein Kontingent aus `hospitality_admin_overview`, soweit der Bericht es braucht. */
export type KontingentQuelle = {
  kind: string;
  tier: string | null;
  label_de: string | null;
  label_en: string | null;
  location: string | null;
  bookings: BuchungQuelle[] | null;
};

export type HotelZeile = {
  speaker_name: string | null;
  kontingent: string | null;
  tier: string | null;
  ort: string | null;
  status: string;
  guests: number;
  details: Record<string, string>;
  team_note: string | null;
  created_at: string;
};

/**
 * Eine Zeile je Hotelbuchung, nach Speaker-Name und Anfrage. Nur Kontingente der Art `hotel`: Fahrten stehen seit 0119 in `shuttle_booking` und auf der
 * Shuttle-Liste. Die Datenbank liefert stornierte Buchungen gar nicht erst.
 */
export function hotelZeilen(kontingente: KontingentQuelle[], sprache: "de" | "en"): HotelZeile[] {
  const zeilen: HotelZeile[] = [];
  for (const q of kontingente) {
    if (q.kind !== "hotel") continue;
    const name = (sprache === "en" ? (q.label_en ?? q.label_de) : (q.label_de ?? q.label_en)) ?? null;
    for (const b of q.bookings ?? []) {
      zeilen.push({
        speaker_name: b.speaker_name,
        kontingent: name,
        tier: q.tier,
        ort: q.location,
        status: b.status,
        guests: b.guests,
        details: b.details ?? {},
        team_note: b.team_note,
        created_at: b.created_at,
      });
    }
  }
  return zeilen.sort((a, b) => (a.speaker_name ?? "").localeCompare(b.speaker_name ?? "", "de") || a.created_at.localeCompare(b.created_at));
}

type H = HotelZeile;
const angabe = (z: H, key: string): string => z.details[key] ?? "";

export const HOTEL_SPALTEN: Spalte<H>[] = [
  spalte<H>("speaker", "buchung", 24, true, (z) => z.speaker_name ?? ""),
  spalte<H>("kontingent", "buchung", 28, true, (z) => z.kontingent ?? ""),
  spalte<H>("tier", "buchung", 16, true, (z, k) => vok(k, "hotel_tier", z.tier)),
  spalte<H>("ort", "buchung", 22, false, (z) => z.ort ?? ""),
  spalte<H>("status", "buchung", 14, true, (z, k) => k.woerter[`booking_${z.status}`] ?? z.status),
  spalte<H>("guests", "buchung", 10, true, (z) => z.guests),
  spalte<H>("created_at", "buchung", 14, false, (z) => datum(z.created_at)),
  spalte<H>("check_in", "aufenthalt", 14, true, (z) => datumOderText(angabe(z, "check_in"))),
  spalte<H>("check_out", "aufenthalt", 14, true, (z) => datumOderText(angabe(z, "check_out"))),
  spalte<H>("arrival_info", "aufenthalt", 30, false, (z) => angabe(z, "arrival_info")),
  spalte<H>("breakfast", "aufenthalt", 12, false, (z) => angabe(z, "breakfast")),
  spalte<H>("late_checkout", "aufenthalt", 12, false, (z) => angabe(z, "late_checkout")),
  spalte<H>("special", "aufenthalt", 36, true, (z) => angabe(z, "special")),
  spalte<H>("team_note", "aufenthalt", 36, false, (z) => z.team_note ?? ""),
];

// ─── Programm je Bühne ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Eine Zeile aus `programme_board`, soweit der Bericht sie braucht. */
export type BoardQuelle = {
  stage_name: string;
  stage_sort: number | null;
  day_date: string;
  start_at: string;
  end_at: string;
  slot_type: string | null;
  session_id: string | null;
  title_de: string | null;
  title_en: string | null;
  format: string | null;
  language: string | null;
  publish_status: string | null;
  capacity: number | null;
  speakers: { person_id: string; role?: string | null; first_name?: string | null; last_name?: string | null }[] | null;
};

export type ProgrammZeile = BoardQuelle;

/**
 * Eine Zeile je Session, die auf einem Slot liegt — nach Tag, Bühne (wie im Board) und Beginn. Freie Slots stehen nicht auf der Liste: der Bericht ist das
 * Programm, nicht der Belegungsplan.
 */
export function programmZeilen(zeilen: BoardQuelle[]): ProgrammZeile[] {
  return zeilen
    .filter((z) => z.session_id)
    .sort(
      (a, b) =>
        a.day_date.localeCompare(b.day_date) || (a.stage_sort ?? 0) - (b.stage_sort ?? 0) || a.stage_name.localeCompare(b.stage_name, "de") || a.start_at.localeCompare(b.start_at),
    );
}

type P = ProgrammZeile;
const nameVon = (s: { first_name?: string | null; last_name?: string | null }): string => [s.first_name, s.last_name].filter(Boolean).join(" ");

export const PROGRAMM_SPALTEN: Spalte<P>[] = [
  spalte<P>("stage", "slot", 22, true, (z) => z.stage_name),
  spalte<P>("day", "slot", 14, true, (z) => datum(z.day_date)),
  spalte<P>("start", "slot", 10, true, (z) => uhrzeit(z.start_at)),
  spalte<P>("end", "slot", 10, true, (z) => uhrzeit(z.end_at)),
  spalte<P>("slot_type", "slot", 14, false, (z) => z.slot_type ?? ""),
  spalte<P>("title", "session", 44, true, (z, k) => titelVon(z, k.sprache)),
  spalte<P>("format", "session", 18, true, (z, k) => vok(k, "session_format", z.format)),
  spalte<P>("language", "session", 12, false, (z, k) => vok(k, "language", z.language)),
  spalte<P>("speakers", "session", 40, true, (z, k) =>
    (z.speakers ?? [])
      .map((s) => (s.role === "moderator" ? `${nameVon(s)} (${k.woerter.moderation ?? "moderator"})` : nameVon(s)))
      .filter((n) => n.trim() !== "")
      .join(", "),
  ),
  spalte<P>("publish_status", "session", 16, true, (z, k) => vok(k, "publish_status", z.publish_status)),
  spalte<P>("capacity", "session", 10, false, (z) => z.capacity ?? ""),
];

// ─── Auswahl und Tabelle ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

type SpaltenKopf = { key: string; gruppe: string; breite: number; standard: boolean };

/** Die Spalten eines Berichts ohne die Funktionen — für die Auswahl auf der Seite. */
export function spaltenVon(bericht: BerichtId): SpaltenKopf[] {
  const liste: Spalte<never>[] = bericht === "speaker" ? SPEAKER_SPALTEN : bericht === "hotel" ? HOTEL_SPALTEN : PROGRAMM_SPALTEN;
  return liste.map(({ key, gruppe, breite, standard }) => ({ key, gruppe, breite, standard }));
}

/** Die Gruppen eines Berichts in der Reihenfolge, in der sie zuerst vorkommen. */
export function spaltenGruppen(bericht: BerichtId): { gruppe: string; spalten: SpaltenKopf[] }[] {
  const aus: { gruppe: string; spalten: SpaltenKopf[] }[] = [];
  for (const s of spaltenVon(bericht)) {
    const g = aus.find((x) => x.gruppe === s.gruppe);
    if (g) g.spalten.push(s);
    else aus.push({ gruppe: s.gruppe, spalten: [s] });
  }
  return aus;
}

/**
 * Die gewählten Spalten aus der Adresszeile (`?spalten=a&spalten=b` oder `?spalten=a,b`), **in der Reihenfolge des Berichts** und nur, was er kennt. `alle` wählt alle;
 * ohne gültige Auswahl gilt die Vorgabe. Aus der Adresse wird nie ein Spaltenname übernommen, der nicht in der Liste steht.
 */
export function waehleSpalten(bericht: BerichtId, param: string | string[] | undefined): string[] {
  const alle = spaltenVon(bericht);
  const roh = (Array.isArray(param) ? param : param === undefined ? [] : [param]).flatMap((p) => p.split(",")).map((p) => p.trim());
  if (roh.includes("alle")) return alle.map((s) => s.key);
  const gewaehlt = new Set(roh);
  const treffer = alle.filter((s) => gewaehlt.has(s.key)).map((s) => s.key);
  return treffer.length > 0 ? treffer : alle.filter((s) => s.standard).map((s) => s.key);
}

export type Tabelle = { kopf: string[]; zeilen: Zelle[][]; breiten: number[] };

function tabelleVon<Z>(spalten: Spalte<Z>[], keys: string[], zeilen: Z[], k: ExportKontext, label: (key: string) => string): Tabelle {
  const gewaehlt = spalten.filter((s) => keys.includes(s.key));
  return {
    kopf: gewaehlt.map((s) => label(s.key)),
    zeilen: zeilen.map((z) => gewaehlt.map((s) => s.wert(z, k))),
    breiten: gewaehlt.map((s) => s.breite),
  };
}

/** Die Rohdaten eines Berichts, wie die Seite sie lädt. */
export type Rohdaten =
  | { bericht: "speaker"; zeilen: ManagedSpeaker[] }
  | { bericht: "hotel"; zeilen: HotelZeile[] }
  | { bericht: "programm"; zeilen: ProgrammZeile[] };

/**
 * Die Tabelle eines Berichts mit den Spalten aus der Adresszeile. `label` gibt die Spaltenüberschrift (`col_<bericht>_<key>` im Wörterbuch); die Seite und der
 * Download rufen dasselbe auf.
 */
export function baueBericht(
  roh: Rohdaten,
  spaltenParam: string | string[] | undefined,
  k: ExportKontext,
  label: (bericht: BerichtId, key: string) => string,
): { gewaehlt: string[]; tabelle: Tabelle } {
  const gewaehlt = waehleSpalten(roh.bericht, spaltenParam);
  const l = (key: string) => label(roh.bericht, key);
  switch (roh.bericht) {
    case "speaker":
      return { gewaehlt, tabelle: tabelleVon(SPEAKER_SPALTEN, gewaehlt, roh.zeilen, k, l) };
    case "hotel":
      return { gewaehlt, tabelle: tabelleVon(HOTEL_SPALTEN, gewaehlt, roh.zeilen, k, l) };
    case "programm":
      return { gewaehlt, tabelle: tabelleVon(PROGRAMM_SPALTEN, gewaehlt, roh.zeilen, k, l) };
  }
}

/** Das Byte-Order-Mark: ohne es hält Excel die Datei für Latin-1 und macht aus „ü“ ein „Ã¼“. Als Zeichencode, nicht als unsichtbares Zeichen im Quelltext. */
const BOM = String.fromCharCode(0xfeff);

/**
 * Die Datei als CSV: Semikolon, BOM und Zeilenende wie bei Regieplan, Shuttle und Lounge-Liste, damit Excel auf deutschen Rechnern die Spalten nicht in eine einzige
 * quetscht. **Jede** Zelle — auch die Überschrift — läuft durch `csvCell` (Formelschutz, `lib/csv.ts`).
 */
export function tabelleAlsCsv(t: Tabelle): string {
  const kopf = t.kopf.map((c) => csvCell(c)).join(";");
  const zeilen = t.zeilen.map((z) => z.map((c) => csvCell(c)).join(";"));
  return `${BOM}${[kopf, ...zeilen].join("\r\n")}\r\n`;
}

/** Die Datei als Excel: dieselbe Tabelle, Überschrift fett und festgehalten. Texte bleiben Texte — auch eine Zelle, die mit `=` beginnt, ist hier keine Formel. */
export async function tabelleAlsXlsx(t: Tabelle, blatt: string): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  // Blattnamen sind auf 31 Zeichen begrenzt und kennen einige Zeichen nicht.
  const ws = wb.addWorksheet(blatt.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Export");
  ws.columns = t.kopf.map((c, i) => ({ header: c, key: `c${i}`, width: t.breiten[i] ?? 16 }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const z of t.zeilen) ws.addRow(Object.fromEntries(z.map((c, i) => [`c${i}`, c])));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
