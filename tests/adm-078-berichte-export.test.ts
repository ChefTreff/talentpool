import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { ManagedSpeaker } from "@/app/(speaker-leads)/speaker-leads/types";
import {
  BERICHTE,
  HOTEL_SPALTEN,
  PROGRAMM_SPALTEN,
  SPEAKER_SPALTEN,
  TRENNER,
  VORSCHAU_ZEILEN,
  baueBericht,
  datum,
  datumZeit,
  hotelZeilen,
  programmZeilen,
  spaltenGruppen,
  spaltenVon,
  tabelleAlsCsv,
  tabelleAlsXlsx,
  uhrzeit,
  waehleBericht,
  waehleSpalten,
  type BoardQuelle,
  type ExportKontext,
  type KontingentQuelle,
  type Tabelle,
} from "@/lib/speaker/export-berichte";

/**
 * ADM-078 (Konrad 05.10.: „eine Exportsektion im Speaker-Admin hinzufügen, wo man sich verschiedene Berichte zusammenstellen und sehen kann“; Paulina: „eine riesige
 * Excel, wo alle Daten auf einen Blick drin sind … ein Final Check“): drei Berichte aus vorhandenen Quellen — Speaker-Gesamtliste, Hotelliste, Programm je Bühne —, die
 * Spalten wählbar, Vorschau und Datei aus derselben Tabelle. Keine Datenbankänderung. Die Zusammensetzung (`lib/speaker/export-berichte.ts`) wird hier **ausgeführt**,
 * auch die Zeitformate und beide Dateiformate; die Seite, der Download und der Datenlader werden am Quelltext geprüft.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** Das Byte-Order-Mark vorn in der CSV — als Zeichencode, nicht als unsichtbares Zeichen im Quelltext. */
const BOM = String.fromCharCode(0xfeff);
const BERICHTE_LIB = "lib/speaker/export-berichte.ts";
const DATEN = "lib/speaker/export-daten.ts";
const SEITE = "app/(admin)/admin/speaker/export/page.tsx";
const ANSICHT = "app/(admin)/admin/speaker/export/BerichteAnsicht.tsx";
const ROUTE = "app/(admin)/admin/speaker/export/datei/route.ts";

const K: ExportKontext = {
  vokabular: {
    speaker_type: { keynote: "Keynote" },
    speaker_pipeline: { confirmed: "Bestätigt", lead: "Lead" },
    speaker_decline_reason: { time: "Zeitlich nicht möglich" },
    hospitality_status: { granted: "Zugesagt" },
    hotel_tier: { standard: "Standard" },
    ticket_type: { speaker: "Speaker-Pass" },
    session_format: { keynote: "Keynote", panel: "Panel" },
    publish_status: { draft: "Entwurf" },
    language: { de: "Deutsch" },
  },
  woerter: { ja: "ja", nein: "nein", moderation: "Moderation", booking_confirmed: "Bestätigt" },
  sprache: "de",
};
const label = (bericht: string, key: string) => `${bericht}.${key}`;

const BASIS = {
  id: "a",
  person_id: "p",
  first_name: "Anna",
  last_name: "Beispiel",
  title: null,
  email: "anna@example.org",
  job_title: "CEO",
  organization_name: "Beispiel GmbH",
  speaker_type: "keynote",
  pipeline_status: "confirmed",
  owner_person_id: null,
  owner_name: "Konrad Gruner",
  reception_eligible: false,
  travel_costs_covered: true,
  travel_costs_approved: false,
  hospitality_status: "granted",
  hotel_tier: "standard",
  pass_type: "speaker",
  lounge_access: true,
  invited_at: "2026-10-01T10:00:00Z",
  confirmed_at: "2026-10-05T10:00:00Z",
  declined_at: null,
  decline_reason: null,
  assistant_name: null,
  sessions: [],
  next_open: [],
  updated_at: "2026-10-09T10:00:00Z",
  internal_notes: null,
  stage_guest: false,
  category: null,
  topic_cluster: null,
  topic_role: null,
  priority: null,
  recommended_format: null,
  contact_via: null,
  outreach_channel: null,
  stage_candidates: [],
  open_tasks: 0,
  next_task: null,
  last_activity_at: null,
} satisfies Record<string, unknown>;
const speaker = (extra: Record<string, unknown> = {}) => ({ ...BASIS, ...extra }) as unknown as ManagedSpeaker;

/** Die Zelle einer Spalte in der ersten Zeile. */
const zelle = (r: { gewaehlt: string[]; tabelle: Tabelle }, key: string, zeile = 0) => {
  const i = r.gewaehlt.indexOf(key);
  assert.ok(i >= 0, `Spalte ${key} ist nicht gewählt`);
  return r.tabelle.zeilen[zeile][i];
};
/** Ohne Angabe alle Spalten; `"vorgabe"` heißt: keine Auswahl in der Adresse (also die Vorgabe des Berichts). */
const speakerBericht = (zeilen: ManagedSpeaker[], spalten: string | string[] = "alle") =>
  baueBericht({ bericht: "speaker", zeilen }, spalten === "vorgabe" ? undefined : spalten, K, label);

describe("ADM-078: Bericht und Spalten aus der Adresszeile", () => {
  it("drei Berichte; alles Unbekannte ist die Speaker-Gesamtliste, bei mehreren Angaben zählt die erste", () => {
    assert.deepEqual([...BERICHTE], ["speaker", "hotel", "programm"]);
    assert.equal(waehleBericht(undefined), "speaker");
    assert.equal(waehleBericht("gibt-es-nicht"), "speaker");
    assert.equal(waehleBericht("hotel"), "hotel");
    assert.equal(waehleBericht(["programm", "hotel"]), "programm");
    assert.equal(waehleBericht(""), "speaker");
  });

  it("ohne Auswahl gilt die Vorgabe — in der Reihenfolge des Berichts", () => {
    const vorgabe = (b: (typeof BERICHTE)[number]) => spaltenVon(b).filter((s) => s.standard).map((s) => s.key);
    for (const b of BERICHTE) assert.deepEqual(waehleSpalten(b, undefined), vorgabe(b));
    assert.ok(vorgabe("speaker").includes("email") && !vorgabe("speaker").includes("internal_notes"), "E-Mail an, interne Notiz aus");
  });

  it("die Reihenfolge bestimmt der Bericht, nicht die Adresse; Komma-Listen und Mehrfachangaben gehen", () => {
    assert.deepEqual(waehleSpalten("speaker", ["email", "last_name"]), ["last_name", "email"]);
    assert.deepEqual(waehleSpalten("speaker", "email,last_name"), ["last_name", "email"]);
    assert.deepEqual(waehleSpalten("speaker", ["email,first_name", "last_name"]), ["last_name", "first_name", "email"]);
    assert.deepEqual(waehleSpalten("speaker", " email , last_name "), ["last_name", "email"]);
  });

  it("aus der Adresse wird nie ein Name übernommen, den der Bericht nicht kennt; ohne gültigen Treffer gilt die Vorgabe", () => {
    assert.deepEqual(waehleSpalten("speaker", ["email", "'; drop table person; --", "hotel_tier_x", "__proto__", "constructor"]), ["email"]);
    assert.deepEqual(waehleSpalten("speaker", ["nur-unbekanntes"]), waehleSpalten("speaker", undefined));
    // ein Name aus einem anderen Bericht zählt hier nicht
    assert.deepEqual(waehleSpalten("hotel", ["last_name"]), waehleSpalten("hotel", undefined));
  });

  it("„alle“ wählt alle Spalten des Berichts", () => {
    assert.equal(waehleSpalten("speaker", "alle").length, SPEAKER_SPALTEN.length);
    assert.equal(waehleSpalten("hotel", ["alle"]).length, HOTEL_SPALTEN.length);
    assert.equal(waehleSpalten("programm", "alle").length, PROGRAMM_SPALTEN.length);
  });

  it("jede Spalte hat einen eindeutigen Namen und gehört zu einer Gruppe; die Gruppen führen jede Spalte genau einmal", () => {
    for (const b of BERICHTE) {
      const keys = spaltenVon(b).map((s) => s.key);
      assert.equal(new Set(keys).size, keys.length, `${b}: doppelter Spaltenname`);
      const ausGruppen = spaltenGruppen(b).flatMap((g) => g.spalten.map((s) => s.key));
      assert.deepEqual([...ausGruppen].sort(), [...keys].sort(), `${b}: die Gruppen decken nicht alle Spalten ab`);
      for (const s of spaltenVon(b)) assert.ok(s.breite > 0 && s.gruppe.length > 0, `${b}.${s.key}`);
    }
  });
});

describe("ADM-078: Zeitformate — Berliner Zeit, ausgeführt", () => {
  it("ein Kalendertag bleibt, wie er ist; ein Zeitpunkt zählt als Berliner Tag", () => {
    assert.equal(datum("2027-04-16"), "16.04.2027");
    assert.equal(datum("2027-04-16T08:30:00Z"), "16.04.2027");
    // 22:30 UTC ist im April (MESZ, +2) schon der nächste Tag
    assert.equal(datum("2027-04-16T22:30:00Z"), "17.04.2027");
  });

  it("Datum mit Uhrzeit in Sommer- und Winterzeit, Mitternacht als 00 statt 24", () => {
    assert.equal(datumZeit("2027-04-16T08:30:00Z"), "16.04.2027 10:30");
    assert.equal(datumZeit("2027-01-15T12:00:00Z"), "15.01.2027 13:00");
    assert.equal(datumZeit("2027-04-16T22:30:00Z"), "17.04.2027 00:30");
    assert.equal(uhrzeit("2027-04-16T08:30:00Z"), "10:30");
    assert.equal(uhrzeit("2027-04-16T22:30:00Z"), "00:30");
  });

  it("leer bleibt leer, Unlesbares bleibt unverändert (kein „Invalid Date“ in der Datei)", () => {
    for (const f of [datum, datumZeit, uhrzeit]) {
      assert.equal(f(null), "");
      assert.equal(f(undefined), "");
      assert.equal(f(""), "");
      assert.equal(f("kaputt"), "kaputt");
    }
  });
});

describe("ADM-078: Speaker-Gesamtliste", () => {
  it("die Vorgabe ist, was der Final-Check braucht — Person, Stand, Betreuung, Programm, Hospitality; die interne Notiz und die Einordnung sind aus", () => {
    const r = speakerBericht([speaker()], "vorgabe");
    assert.deepEqual(r.gewaehlt, [
      "last_name", "first_name", "email", "job_title", "organization", "speaker_type", "pipeline_status", "owner_name", "confirmed_at", "open_steps",
      "session_title", "session_stage", "session_start", "hospitality_status", "hotel_tier", "pass_type", "lounge_access", "travel_costs_covered",
    ]);
    assert.deepEqual(r.tabelle.kopf, r.gewaehlt.map((k) => `speaker.${k}`), "die Überschriften kommen aus dem Wörterbuch (hier die Testfunktion)");
  });

  it("Vokabular wird beschriftet, Ja/Nein ausgeschrieben, Zeitpunkte als Berliner Tag", () => {
    const r = speakerBericht([speaker()]);
    assert.equal(zelle(r, "speaker_type"), "Keynote");
    assert.equal(zelle(r, "pipeline_status"), "Bestätigt");
    assert.equal(zelle(r, "hospitality_status"), "Zugesagt");
    assert.equal(zelle(r, "hotel_tier"), "Standard");
    assert.equal(zelle(r, "pass_type"), "Speaker-Pass");
    assert.equal(zelle(r, "lounge_access"), "ja");
    assert.equal(zelle(r, "travel_costs_approved"), "nein");
    assert.equal(zelle(r, "confirmed_at"), "05.10.2026");
    assert.equal(zelle(r, "declined_at"), "");
    assert.equal(zelle(r, "owner_name"), "Konrad Gruner");
  });

  it("ein Schlüssel, den das Vokabular nicht kennt, steht roh da statt leer", () => {
    const r = speakerBericht([speaker({ speaker_type: "neu-erfunden" })]);
    assert.equal(zelle(r, "speaker_type"), "neu-erfunden");
  });

  it("Zahlen bleiben Zahlen (offene Aufgaben, offene Schritte), damit eine Summe in Excel stimmt", () => {
    const r = speakerBericht([speaker({ open_tasks: 3, next_open: ["a", "b"] })]);
    assert.equal(zelle(r, "open_tasks"), 3);
    assert.equal(zelle(r, "open_steps"), 2);
    const leer = speakerBericht([speaker({ open_tasks: null, next_open: null })]);
    assert.equal(zelle(leer, "open_tasks"), 0);
    assert.equal(zelle(leer, "open_steps"), 0);
  });

  it("mehrere Sessions stehen in einer Zelle, in allen Spalten in derselben Reihenfolge — auch wenn eine ohne Slot ist", () => {
    const r = speakerBericht([
      speaker({
        sessions: [
          { session_id: "s1", title_de: "Eröffnung", title_en: "Opening", publish_status: "draft", start_at: "2027-04-16T08:00:00Z", stage_name: "Main Stage" },
          { session_id: "s2", title_de: null, title_en: "Panel", publish_status: null, start_at: null, stage_name: null },
        ],
      }),
    ]);
    assert.equal(zelle(r, "session_title"), `Eröffnung${TRENNER}Panel`, "ohne deutschen Titel der englische");
    assert.equal(zelle(r, "session_stage"), `Main Stage${TRENNER}`);
    assert.equal(zelle(r, "session_start"), `16.04.2027 10:00${TRENNER}`);
    assert.equal(zelle(r, "session_status"), `Entwurf${TRENNER}`);
    const en = baueBericht({ bericht: "speaker", zeilen: [speaker({ sessions: [{ session_id: "s", title_de: "Eröffnung", title_en: "Opening", publish_status: null, start_at: null, stage_name: null }] })] }, "alle", { ...K, sprache: "en" }, label);
    assert.equal(zelle(en, "session_title"), "Opening");
  });

  it("Aufgabe, Bühnen in Frage, Assistenz und interne Notiz", () => {
    const r = speakerBericht([
      speaker({
        next_task: { id: "t", body: "Anrufen", due_on: "2026-10-12", assignee_person_id: null, assignee_name: null },
        stage_candidates: [{ stage_id: "1", name: "Main Stage" }, { stage_id: "2", name: "Future Stage" }],
        assistant_name: "Max Assistent",
        internal_notes: "Zeile 1\nZeile 2",
      }),
    ]);
    assert.equal(zelle(r, "next_task"), "Anrufen (12.10.2026)");
    assert.equal(zelle(r, "stage_candidates"), "Main Stage, Future Stage");
    assert.equal(zelle(r, "assistant_name"), "Max Assistent");
    assert.equal(zelle(r, "internal_notes"), "Zeile 1\nZeile 2");
    assert.equal(zelle(speakerBericht([speaker()]), "next_task"), "");
  });

  it("eine Zeile je Speaker in der Reihenfolge der Quelle (die Datenbank sortiert nach Stand und Name); die Datei hat so viele Zeilen wie Speaker", () => {
    const r = speakerBericht([speaker({ last_name: "Zeta" }), speaker({ last_name: "Alpha" }), speaker({ last_name: "Mitte" })], "last_name");
    assert.deepEqual(r.tabelle.zeilen.map((z) => z[0]), ["Zeta", "Alpha", "Mitte"]);
  });

  it("jede Spalte rechnet mit einer vollständigen Zeile, ohne zu fallen — auch mit lauter leeren Feldern", () => {
    const leer = speaker({
      first_name: null, last_name: null, email: null, job_title: null, organization_name: null, owner_name: null, invited_at: null, confirmed_at: null,
      sessions: null, next_open: null, stage_candidates: null, open_tasks: null, hotel_tier: "", pass_type: "", hospitality_status: "", speaker_type: "",
    });
    const r = speakerBericht([leer]);
    assert.equal(r.tabelle.zeilen[0].length, SPEAKER_SPALTEN.length);
    for (const z of r.tabelle.zeilen[0]) assert.ok(typeof z === "string" || typeof z === "number");
  });
});

describe("ADM-078: Hotelliste", () => {
  const quellen: KontingentQuelle[] = [
    {
      kind: "hotel",
      tier: "standard",
      label_de: "Hotel Test",
      label_en: "Test Hotel",
      location: "Hamburg",
      bookings: [
        { id: "b2", status: "confirmed", guests: 2, details: { check_in: "2027-04-15", check_out: "2027-04-17", special: "ruhig", breakfast: "ja", arrival_info: "ICE 10:30" }, team_note: "VIP", created_at: "2026-10-03T10:00:00Z", profile_id: "p2", speaker_name: "Zoe Zeta" },
        { id: "b1", status: "requested", guests: 1, details: null, team_note: null, created_at: "2026-10-02T10:00:00Z", profile_id: "p1", speaker_name: "Anna Alpha" },
      ],
    },
    { kind: "shuttle", tier: null, label_de: "Shuttle", label_en: null, location: null, bookings: [{ id: "x", status: "confirmed", guests: 1, details: null, team_note: null, created_at: "2026-10-02T10:00:00Z", profile_id: "p3", speaker_name: "Nicht im Bericht" }] },
    { kind: "hotel", tier: null, label_de: null, label_en: null, location: null, bookings: null },
  ];

  it("nur Kontingente der Art Hotel; eine Zeile je Buchung, nach Name des Speakers", () => {
    const z = hotelZeilen(quellen, "de");
    assert.deepEqual(z.map((r) => r.speaker_name), ["Anna Alpha", "Zoe Zeta"]);
    assert.ok(!z.some((r) => r.speaker_name === "Nicht im Bericht"), "Fahrten stehen auf der Shuttle-Liste");
  });

  it("bei gleichem Namen entscheidet die Anfrage; ohne Namen steht die Zeile vorn und bricht nicht", () => {
    const gleich: KontingentQuelle[] = [
      { kind: "hotel", tier: null, label_de: "H", label_en: null, location: null, bookings: [
        { id: "2", status: "requested", guests: 1, details: null, team_note: null, created_at: "2026-10-05T10:00:00Z", profile_id: "a", speaker_name: "Gleich Gleich" },
        { id: "1", status: "requested", guests: 1, details: null, team_note: null, created_at: "2026-10-01T10:00:00Z", profile_id: "a", speaker_name: "Gleich Gleich" },
        { id: "0", status: "requested", guests: 1, details: null, team_note: null, created_at: "2026-10-09T10:00:00Z", profile_id: "b", speaker_name: null },
      ] },
    ];
    assert.deepEqual(hotelZeilen(gleich, "de").map((r) => r.created_at), ["2026-10-09T10:00:00Z", "2026-10-01T10:00:00Z", "2026-10-05T10:00:00Z"]);
  });

  it("Name des Kontingents in der Sprache des Berichts, mit Rückfall auf die andere", () => {
    assert.equal(hotelZeilen(quellen, "de")[0].kontingent, "Hotel Test");
    assert.equal(hotelZeilen(quellen, "en")[0].kontingent, "Test Hotel");
    const nurDe: KontingentQuelle[] = [{ ...quellen[0], label_en: null }];
    assert.equal(hotelZeilen(nurDe, "en")[0].kontingent, "Hotel Test");
  });

  it("die Spalten: Stand aus dem Wörterbuch, Tage als Tage, Angaben der Buchung roh, Zahl der Personen als Zahl", () => {
    const r = baueBericht({ bericht: "hotel", zeilen: hotelZeilen(quellen, "de") }, "alle", K, label);
    // Anna Alpha: Anfrage ohne Angaben
    assert.equal(zelle(r, "speaker", 0), "Anna Alpha");
    assert.equal(zelle(r, "status", 0), "requested", "ein Stand ohne Wort im Wörterbuch steht roh da");
    assert.equal(zelle(r, "check_in", 0), "");
    // Zoe Zeta: bestätigt mit Angaben
    assert.equal(zelle(r, "status", 1), "Bestätigt");
    assert.equal(zelle(r, "tier", 1), "Standard");
    assert.equal(zelle(r, "ort", 1), "Hamburg");
    assert.equal(zelle(r, "guests", 1), 2);
    assert.equal(zelle(r, "check_in", 1), "15.04.2027");
    assert.equal(zelle(r, "check_out", 1), "17.04.2027");
    assert.equal(zelle(r, "arrival_info", 1), "ICE 10:30");
    assert.equal(zelle(r, "breakfast", 1), "ja");
    assert.equal(zelle(r, "special", 1), "ruhig");
    assert.equal(zelle(r, "team_note", 1), "VIP");
    assert.equal(zelle(r, "created_at", 1), "03.10.2026");
  });

  it("Anreise als Zeitpunkt wird als Berliner Zeit gelesen, Freitext bleibt Freitext", () => {
    const q: KontingentQuelle[] = [{ kind: "hotel", tier: null, label_de: "H", label_en: null, location: null, bookings: [
      { id: "1", status: "requested", guests: 1, details: { check_in: "2027-04-15T14:00:00Z", check_out: "Samstag Abend" }, team_note: null, created_at: "2026-10-01T10:00:00Z", profile_id: "a", speaker_name: "A" },
    ] }];
    const r = baueBericht({ bericht: "hotel", zeilen: hotelZeilen(q, "de") }, "alle", K, label);
    assert.equal(zelle(r, "check_in"), "15.04.2027 16:00");
    assert.equal(zelle(r, "check_out"), "Samstag Abend");
  });
});

describe("ADM-078: Programm je Bühne", () => {
  const board = (extra: Partial<BoardQuelle>): BoardQuelle => ({
    stage_name: "Main Stage",
    stage_sort: 1,
    day_date: "2027-04-16",
    start_at: "2027-04-16T08:00:00Z",
    end_at: "2027-04-16T08:30:00Z",
    slot_type: "session",
    session_id: "s",
    title_de: "Titel",
    title_en: null,
    format: "keynote",
    language: "de",
    publish_status: "draft",
    capacity: null,
    speakers: [],
    ...extra,
  });

  it("nur Sessions mit Slot: ein freier Slot ist keine Programmzeile", () => {
    const z = programmZeilen([board({ session_id: "a" }), board({ session_id: null, title_de: null })]);
    assert.equal(z.length, 1);
    assert.equal(z[0].session_id, "a");
  });

  it("sortiert nach Tag, Bühne (wie im Board) und Beginn", () => {
    const z = programmZeilen([
      board({ session_id: "tag2", day_date: "2027-04-17", start_at: "2027-04-17T08:00:00Z" }),
      board({ session_id: "spaet", start_at: "2027-04-16T10:00:00Z" }),
      board({ session_id: "future-frueh", stage_name: "Future Stage", stage_sort: 2, start_at: "2027-04-16T07:00:00Z" }),
      board({ session_id: "frueh", start_at: "2027-04-16T07:00:00Z" }),
    ]);
    assert.deepEqual(z.map((r) => r.session_id), ["frueh", "spaet", "future-frueh", "tag2"]);
  });

  it("die Spalten: Tag, Zeiten in Berliner Zeit, Format und Stand aus dem Vokabular, die Moderation ist als solche gekennzeichnet", () => {
    const r = baueBericht(
      {
        bericht: "programm",
        zeilen: programmZeilen([
          board({
            speakers: [
              { person_id: "1", role: "speaker", first_name: "Anna", last_name: "Beispiel" },
              { person_id: "2", role: "moderator", first_name: "Max", last_name: "Mod" },
              { person_id: "3", role: "speaker", first_name: null, last_name: null },
            ],
            capacity: 120,
          }),
        ]),
      },
      "alle",
      K,
      label,
    );
    assert.equal(zelle(r, "stage"), "Main Stage");
    assert.equal(zelle(r, "day"), "16.04.2027");
    assert.equal(zelle(r, "start"), "10:00");
    assert.equal(zelle(r, "end"), "10:30");
    assert.equal(zelle(r, "title"), "Titel");
    assert.equal(zelle(r, "format"), "Keynote");
    assert.equal(zelle(r, "language"), "Deutsch");
    assert.equal(zelle(r, "publish_status"), "Entwurf");
    assert.equal(zelle(r, "speakers"), "Anna Beispiel, Max Mod (Moderation)", "ein Eintrag ohne Namen fällt weg");
    assert.equal(zelle(r, "capacity"), 120);
    assert.equal(zelle(r, "slot_type"), "session");
  });

  it("Titel in der Sprache des Berichts mit Rückfall; eine Session ohne Besetzung bricht nichts", () => {
    const z = programmZeilen([board({ title_de: null, title_en: "Only English", speakers: null })]);
    const r = baueBericht({ bericht: "programm", zeilen: z }, "alle", K, label);
    assert.equal(zelle(r, "title"), "Only English");
    assert.equal(zelle(r, "speakers"), "");
    assert.equal(zelle(r, "capacity"), "");
  });
});

describe("ADM-078: die Datei — CSV", () => {
  const tabelle = (kopf: string[], ...zeilen: (string | number)[][]): Tabelle => ({ kopf, zeilen, breiten: kopf.map(() => 16) });

  it("Semikolon, BOM vorn, Zeilenende CRLF, jede Zelle in Anführungszeichen — auch die Überschriften", () => {
    const csv = tabelleAlsCsv(tabelle(["Name", "Zahl"], ["Anna", 3], ["Ben", 4]));
    assert.equal(csv, BOM + '"Name";"Zahl"\r\n"Anna";"3"\r\n"Ben";"4"\r\n');
  });

  it("Formelschutz auf jeder Zelle, auch auf Überschriften: ein Anfang mit = + - @ bekommt ein Leerzeichen davor", () => {
    const csv = tabelleAlsCsv(tabelle(["=Kopf", "+Kopf2"], ['=HYPERLINK("http://böse")', "@SUM(A1)"], ["-1+2", "+49 40 123"], ["\t=tab", "normal"]));
    const zeilen = csv.replace(BOM, "").split("\r\n");
    assert.equal(zeilen[0], '" =Kopf";" +Kopf2"');
    assert.equal(zeilen[1], '" =HYPERLINK(""http://böse"")";" @SUM(A1)"');
    assert.equal(zeilen[2], '" -1+2";" +49 40 123"');
    assert.equal(zeilen[3], '" \t=tab";"normal"');
    // keine Zelle beginnt in der Datei noch mit einem Formelzeichen
    for (const zeile of zeilen.slice(0, 4)) for (const c of zeile.split('";"')) assert.doesNotMatch(c.replace(/^"/, ""), /^[=+\-@]/);
  });

  it("reine Zahlen bleiben Zahlen — auch negative", () => {
    const csv = tabelleAlsCsv(tabelle(["a"], [-5], [0], ["12,5"]));
    assert.equal(csv, BOM + '"a"\r\n"-5"\r\n"0"\r\n"12,5"\r\n');
  });

  it("Anführungszeichen werden verdoppelt, Semikolon und Zeilenumbruch bleiben in der Zelle", () => {
    const csv = tabelleAlsCsv(tabelle(["a"], ['Sie sagte "ja"; dann ging sie\nnach Hause']));
    assert.equal(csv, BOM + '"a"\r\n"Sie sagte ""ja""; dann ging sie\nnach Hause"\r\n');
  });

  it("ohne Zeilen bleibt die Überschrift", () => {
    assert.equal(tabelleAlsCsv(tabelle(["a", "b"])), BOM + '"a";"b"\r\n');
  });

  it("aus einem Bericht gebaut: die böse Zelle ist in der Datei entschärft", () => {
    const r = speakerBericht([speaker({ last_name: '=cmd|"/c calc"!A1', internal_notes: "+49 30 99" })], ["last_name", "internal_notes"]);
    const csv = tabelleAlsCsv(r.tabelle);
    assert.match(csv, /" =cmd\|""\/c calc""!A1";" \+49 30 99"/);
  });
});

describe("ADM-078: die Datei — Excel (gelesen, nicht nur geschrieben)", () => {
  async function lesen(puffer: ArrayBuffer) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(puffer);
    return wb;
  }

  it("dieselbe Tabelle: Überschrift fett und festgehalten, Texte als Texte, Zahlen als Zahlen", async () => {
    const t: Tabelle = { kopf: ["Name", "Zahl"], zeilen: [["Anna", 3], ["Ben", 4.5]], breiten: [20, 10] };
    const wb = await lesen(await tabelleAlsXlsx(t, "Speaker-Gesamtliste"));
    const ws = wb.worksheets[0];
    assert.equal(ws.name, "Speaker-Gesamtliste");
    assert.equal(ws.getCell(1, 1).value, "Name");
    assert.equal(ws.getCell(1, 1).font?.bold, true);
    assert.equal(ws.getCell(2, 1).value, "Anna");
    assert.equal(ws.getCell(2, 2).value, 3);
    assert.equal(typeof ws.getCell(3, 2).value, "number");
    assert.equal(ws.getColumn(1).width, 20);
    assert.equal(ws.views[0]?.state, "frozen");
    assert.equal(ws.rowCount, 3);
  });

  it("eine Zelle, die mit = beginnt, ist ein Text und keine Formel", async () => {
    const t: Tabelle = { kopf: ["a"], zeilen: [["=1+1"], ['=HYPERLINK("http://böse")'], ["@SUM(A1)"]], breiten: [20] };
    const wb = await lesen(await tabelleAlsXlsx(t, "x"));
    const ws = wb.worksheets[0];
    for (const [r, erwartet] of [[2, "=1+1"], [3, '=HYPERLINK("http://böse")'], [4, "@SUM(A1)"]] as const) {
      const c = ws.getCell(r, 1);
      assert.equal(c.value, erwartet);
      assert.equal(typeof c.value, "string", "ein Text, kein Formelobjekt");
      assert.equal(c.formula, undefined);
    }
  });

  it("der Blattname ist zulässig: höchstens 31 Zeichen, ohne die Zeichen, die Excel verbietet", async () => {
    const t: Tabelle = { kopf: ["a"], zeilen: [], breiten: [10] };
    const wb = await lesen(await tabelleAlsXlsx(t, "Programm/je:Bühne?[*]\\" + "x".repeat(40)));
    const name = wb.worksheets[0].name;
    assert.ok(name.length <= 31);
    assert.doesNotMatch(name, /[\\/?*[\]:]/);
    const leer = await lesen(await tabelleAlsXlsx(t, ""));
    assert.equal(leer.worksheets[0].name, "Export");
  });

  it("ein ganzer Bericht übersteht den Weg über die Datei", async () => {
    const r = speakerBericht([speaker({ sessions: [{ session_id: "s", title_de: "Eröffnung", title_en: null, publish_status: "draft", start_at: "2027-04-16T08:00:00Z", stage_name: "Main Stage" }] })]);
    const wb = await lesen(await tabelleAlsXlsx(r.tabelle, "Speaker"));
    const ws = wb.worksheets[0];
    assert.equal(ws.columnCount, SPEAKER_SPALTEN.length);
    const i = r.gewaehlt.indexOf("session_start") + 1;
    assert.equal(ws.getCell(2, i).value, "16.04.2027 10:00");
  });
});

describe("ADM-078: der Datenlader liest, was es gibt — keine Datenbankänderung", () => {
  const daten = quelle(DATEN);

  it("die jüngste Edition, dann je Bericht die vorhandene Quelle mit der Edition", () => {
    assert.match(daten, /\.from\("event"\)\s*\.select\("id"\)\s*\.eq\("is_edition", true\)\s*\.order\("start_date", \{ ascending: false \}\)\s*\.limit\(1\)/);
    assert.match(daten, /supabase\.rpc\("manager_speakers", \{ p_edition_id: edition\.id \}\)/);
    assert.match(daten, /supabase\.rpc\("hospitality_admin_overview", \{ p_edition_id: edition\.id \}\)/);
    assert.match(daten, /\.from\("programme_board"\)\s*\.select\("stage_name, stage_sort, day_date, start_at, end_at, slot_type, session_id, title_de, title_en, format, language, publish_status, capacity, speakers"\)\s*\.in\("event_id", events\.map\(\(e\) => e\.id\)\)/);
  });

  it("das Programm kommt aus den Bühnen des Summits (`boardEvents`), ohne Bühnen aus einer leeren Liste ohne Abfrage", () => {
    assert.match(daten, /const events = await boardEvents\(supabase, \[edition\.id\]\);\s*if \(events\.length === 0\) return \{ ok: true, roh: \{ bericht, zeilen: \[\] \} \};/);
  });

  it("die Verweigerung der Datenbank (42501) ist „nicht erlaubt“, jeder andere Fehler „Fehler“ — nie eine leere Liste, die nach „es gibt nichts“ aussähe", () => {
    assert.match(daten, /fehler\.code === "42501" \? "nicht_erlaubt" : "fehler"/);
    assert.equal((daten.match(/verweigert\(error\)/g) ?? []).length, 3, "alle drei Berichte prüfen den Fehler");
    assert.match(daten, /if \(!edition\) return \{ ok: false, grund: "keine_edition" \};/);
  });

  it("jede Vokabular-Gruppe, aus der eine Spalte beschriftet, wird geladen — sonst stünde der rohe Schlüssel in der Datei", () => {
    const lib = quelle(BERICHTE_LIB);
    const benutzt = new Set([...lib.matchAll(/vok\(k, "([a-z_]+)"/g)].map((m) => m[1]));
    assert.ok(benutzt.size >= 12, `nur ${benutzt.size} Gruppen gefunden`);
    const geladen = new Set([...(daten.match(/const VOKABULAR = \[([\s\S]*?)\] as const;/)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
    for (const g of benutzt) assert.ok(geladen.has(g), `Vokabular ${g} wird nicht geladen`);
  });
});

describe("ADM-078: die Seite", () => {
  const seite = quelle(SEITE);
  const ansicht = quelle(ANSICHT);

  it("Zugang über den Admin-Abschnitt `speakers` — derselbe wie die Speaker-Liste, von der aus sie erreichbar ist", () => {
    assert.match(seite, /requireAdminSection\("speakers", "\/admin\/speaker\/export"\)/);
    assert.match(quelle("app/(admin)/admin/speaker/page.tsx"), /requireAdminSection\("speakers", "\/admin\/speaker"\)/);
  });

  it("Vorschau und Datei kommen aus derselben Funktion (`baueBericht`) mit denselben Spalten aus der Adresszeile; die Vorschau zeigt nur die ersten Zeilen und zählt alle", () => {
    assert.match(seite, /baueBericht\(daten\.roh, params\.spalten, k, \(b, key\) => ta\[`col_\$\{b\}_\$\{key\}`\] \?\? key\)/);
    assert.match(seite, /zeilen: tabelle\.zeilen\.slice\(0, VORSCHAU_ZEILEN\), gesamt: tabelle\.zeilen\.length, max: VORSCHAU_ZEILEN/);
    assert.equal(VORSCHAU_ZEILEN, 100);
    assert.match(quelle(ROUTE), /baueBericht\(daten\.roh, url\.searchParams\.getAll\("spalten"\), k, \(b, key\) => ta\[`col_\$\{b\}_\$\{key\}`\] \?\? key\)/);
  });

  it("bei Verweigerung oder Fehler zeigt die Seite den Grund statt einer leeren Tabelle", () => {
    assert.match(seite, /fehler=\{daten\.ok \? null : daten\.grund\}/);
    assert.match(ansicht, /fehler === "nicht_erlaubt" \? t\.notAllowedTitle : fehler === "keine_edition" \? t\.noEditionTitle : t\.errorTitle/);
  });

  it("die Ansicht ist ein GET-Formular mit Kontrollkästchen — lauffähig ohne Skript, die Auswahl steht in der Adresse", () => {
    assert.doesNotMatch(ansicht, /^"use client"/);
    assert.match(ansicht, /<form method="get" action="\/admin\/speaker\/export" className="mb-6">/);
    assert.match(ansicht, /<input type="hidden" name="bericht" value=\{bericht\} \/>/);
    assert.match(ansicht, /<Checkbox key=\{s\.key\} name="spalten" value=\{s\.key\} defaultChecked=\{gewaehlt\.includes\(s\.key\)\} label=\{s\.label\} \/>/);
  });

  it("drei Knöpfe, eine Hauptaktion: „Excel laden“ ist die primäre; „CSV laden“ und „Vorschau aktualisieren“ sind ruhiger; beide Downloads schicken die Auswahl an die Route", () => {
    assert.match(ansicht, /<Button type="submit" variant="secondary">\s*\{t\.refresh\}\s*<\/Button>/);
    assert.match(ansicht, /<Button type="submit" formAction="\/admin\/speaker\/export\/datei" name="format" value="xlsx">\s*\{t\.downloadXlsx\}/);
    assert.match(ansicht, /<Button type="submit" variant="ghost" formAction="\/admin\/speaker\/export\/datei" name="format" value="csv">\s*\{t\.downloadCsv\}/);
    assert.equal((ansicht.match(/<Button /g) ?? []).length, 3);
  });

  it("die Listen mit eigener Quelle werden verlinkt, nicht nachgebaut — als Download ohne Vorladen (ein vorgeladener Link führte die Route aus, PART-051)", () => {
    assert.match(ansicht, /<ButtonDownload href="\/api\/admin\/shuttle\/export\?format=csv" size="sm">/);
    assert.match(ansicht, /<ButtonDownload href="\/api\/admin\/shuttle\/export\?format=xlsx" size="sm">/);
    assert.match(ansicht, /<ButtonDownload href="\/admin\/speaker-tickets\/lounge-liste" size="sm">/);
    assert.doesNotMatch(ansicht, /<ButtonLink/);
    // die Ziele gibt es
    assert.ok(quelle("app/api/admin/shuttle/export/route.ts").includes("export async function GET"));
    assert.ok(quelle("app/(admin)/admin/speaker-tickets/lounge-liste/route.ts").includes("export async function GET"));
  });

  it("die Vorschau kürzt lange Werte und zeigt sie im Tooltip; Spalten nur mit Zahlen stehen rechts", () => {
    assert.match(ansicht, /className="max-w-64 truncate"/);
    assert.match(ansicht, /<span title=\{String\(c\)\}>\{c\}<\/span>/);
    assert.match(ansicht, /vorschau\.zeilen\.every\(\(z\) => typeof z\[i\] === "number"\)/);
  });

  it("die Berichte sind Reiter mit dem Bericht aus der Adresse als aktivem", () => {
    assert.match(seite, /tabs=\{BERICHTE\.map\(\(b\) => \(\{ href: `\/admin\/speaker\/export\?bericht=\$\{b\}`, label: ta\[`report_\$\{b\}`\], aktiv: b === bericht \}\)\)\}/);
  });
});

describe("ADM-078: der Download", () => {
  const route = quelle(ROUTE);

  it("Zugang wie die Seite; die Datenbank prüft je Bericht noch einmal (403 ohne Inhalt)", () => {
    assert.match(route, /await requireAdminSection\("speakers", /);
    assert.match(route, /daten\.grund === "nicht_erlaubt" \? 403 : daten\.grund === "keine_edition" \? 404 : 500/);
    assert.match(route, /daten\.grund === "nicht_erlaubt" \? "not allowed"/);
  });

  it("jeder Download steht im Audit-Log: Bericht, Format, gewählte Spaltennamen, Zeilenzahl — keine Zeilen, keine Adressen", () => {
    assert.match(route, /await logAudit\(\{\s*action: "speaker\.export",\s*objectType: "speaker_export",\s*objectId: bericht,\s*after: \{ format, spalten: gewaehlt, zeilen: tabelle\.zeilen\.length \},\s*\}\);/);
    const audit = route.slice(route.indexOf("await logAudit"), route.indexOf("});", route.indexOf("await logAudit")));
    assert.doesNotMatch(audit, /tabelle\.zeilen(?!\.length)/, "keine Zeilen im Audit");
    assert.doesNotMatch(audit, /email|roh|daten/i);
  });

  it("der Eintrag entsteht erst nach dem Bau der Tabelle und vor der Antwort: ein verweigerter oder gescheiterter Abruf hinterlässt keinen", () => {
    const abbruch = route.indexOf("if (!daten.ok)");
    const bau = route.indexOf("baueBericht(");
    const audit = route.indexOf("await logAudit");
    const antwort = route.indexOf("new Response(tabelleAlsCsv");
    assert.ok(abbruch > 0 && bau > abbruch && audit > bau && antwort > audit, "Reihenfolge: Abbruch, Bau, Audit, Antwort");
  });

  it("CSV und Excel mit dem richtigen Typ und als Anhang; nie zwischengespeichert; der Dateiname trägt Bericht und Tag", () => {
    assert.match(route, /"content-type": "text\/csv; charset=utf-8"/);
    assert.match(route, /"content-type": "application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet"/);
    assert.equal((route.match(/"cache-control": "no-store"/g) ?? []).length, 2);
    assert.equal((route.match(/attachment; filename=/g) ?? []).length, 2);
    assert.match(route, /speaker-gesamtliste/);
    assert.match(route, /hotelliste/);
    assert.match(route, /programm-je-buehne/);
  });

  it("der Formelschutz sitzt in der Zusammensetzung, nicht in der Route: die Route baut die CSV nicht selbst", () => {
    assert.doesNotMatch(route, /join\(";"\)/);
    assert.match(quelle(BERICHTE_LIB), /import \{ csvCell \} from "@\/lib\/csv";/);
  });

  it("der Bericht und das Format kommen aus Listen, nie roh aus der Adresse in den Dateinamen", () => {
    assert.match(route, /const bericht = waehleBericht\(url\.searchParams\.get\("bericht"\) \?\? undefined\);/);
    assert.match(route, /const format = url\.searchParams\.get\("format"\) === "csv" \? "csv" : "xlsx";/);
  });
});

describe("ADM-078: Einstieg, Navigation, Texte", () => {
  it("die Speaker-Liste hat den Knopf „Berichte und Export“ — ruhig (ghost), nach den drei anderen Wegen in derselben Gruppe", () => {
    const q = quelle("app/(admin)/admin/speaker/page.tsx");
    const aufgaben = q.indexOf('href="/admin/speaker/aufgaben"');
    const export_ = q.indexOf('href="/admin/speaker/export"');
    assert.ok(aufgaben > 0 && export_ > aufgaben);
    assert.match(q, /<ButtonLink href="\/admin\/speaker\/export" variant="ghost" size="sm">\s*\{ta\.exportLink\}\s*<\/ButtonLink>/);
  });

  it("kein neuer Menüpunkt: die Seitenleiste kennt die Seite nicht (die Admin-Struktur K-95 steht aus)", () => {
    const nav = quelle("lib/admin-navigation.ts");
    assert.doesNotMatch(nav, /speaker\/export/);
  });

  type Bereich = Record<string, string>;
  const de = JSON.parse(quelle("lib/i18n/de.json")) as { adminSpeakerExport: Bereich; adminSpeaker: Bereich };
  const en = JSON.parse(quelle("lib/i18n/en.json")) as { adminSpeakerExport: Bereich; adminSpeaker: Bereich };

  it("DE und EN haben dieselben Schlüssel, keiner ist leer", () => {
    assert.deepEqual(Object.keys(de.adminSpeakerExport).sort(), Object.keys(en.adminSpeakerExport).sort());
    for (const [sprache, b] of [["de", de.adminSpeakerExport], ["en", en.adminSpeakerExport]] as const) {
      for (const [k, v] of Object.entries(b)) assert.ok(v.trim(), `${sprache}.${k} ist leer`);
    }
    assert.equal(de.adminSpeaker.exportLink, "Berichte und Export");
    assert.equal(en.adminSpeaker.exportLink, "Reports and export");
  });

  it("jede Spalte, jede Gruppe und jeder Bericht hat seine Beschriftung — sonst stünde der Schlüssel in der Überschrift", () => {
    for (const b of BERICHTE) {
      for (const k of [`report_${b}`, `reportHint_${b}`]) assert.ok(de.adminSpeakerExport[k], k);
      for (const s of spaltenVon(b)) {
        assert.ok(de.adminSpeakerExport[`col_${b}_${s.key}`], `de col_${b}_${s.key}`);
        assert.ok(en.adminSpeakerExport[`col_${b}_${s.key}`], `en col_${b}_${s.key}`);
        assert.ok(de.adminSpeakerExport[`group_${s.gruppe}`], `de group_${s.gruppe}`);
        assert.ok(en.adminSpeakerExport[`group_${s.gruppe}`], `en group_${s.gruppe}`);
      }
    }
  });

  it("kein Beschriftungsschlüssel ohne Spalte (nichts liegt verwaist im Wörterbuch)", () => {
    const echt = new Set(BERICHTE.flatMap((b) => spaltenVon(b).map((s) => `col_${b}_${s.key}`)));
    const verwaist = Object.keys(de.adminSpeakerExport).filter((k) => k.startsWith("col_") && !echt.has(k));
    assert.deepEqual(verwaist, []);
  });

  it("die Platzhalter {n} und {max} stehen in beiden Sprachen", () => {
    for (const b of [de.adminSpeakerExport, en.adminSpeakerExport]) {
      assert.match(b.previewCount, /\{n\}/);
      assert.match(b.previewCut, /\{max\}/);
      assert.match(b.previewCut, /\{n\}/);
    }
  });
});

describe("ADM-078: Doku", () => {
  it("Testleitfaden: eine Zeile zu `/admin/speaker/export` nennt die drei Berichte, die Spaltenauswahl, Vorschau und Download und den Einstieg über die Speaker-Liste", () => {
    const zeile = quelle("docs/team-testleitfaden.md").split("\n").find((l) => l.startsWith("| `/admin/speaker/export`"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /ADM-078/);
    for (const wort of ["Speaker-Gesamtliste", "Hotelliste", "Programm je Bühne", "Vorschau aktualisieren", "Excel laden", "CSV laden", "Berichte und Export"]) assert.ok(zeile.includes(wort), wort);
  });

  it("Backlog: ADM-078 trägt die PR-Nummer, nennt die drei Berichte und was offen bleibt (Paulinas Berichte, gespeicherte Auswahl)", () => {
    const zeile = quelle("docs/feedback/admin.md").split("\n").find((l) => l.startsWith("| ADM-078 |"));
    assert.ok(zeile && /\| P2 \| (geplant|gebaut|abgenommen) #\d+/.test(zeile), "ADM-078 trägt keine PR-Nummer");
    assert.match(zeile, /Speaker-Gesamtliste/);
    assert.match(zeile, /Hotelliste/);
    assert.match(zeile, /Paulina/);
    assert.match(zeile, /Lesezeichen/);
  });
});
