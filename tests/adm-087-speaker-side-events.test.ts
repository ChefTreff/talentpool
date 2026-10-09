import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import {
  SIDE_EVENTS_PFAD,
  einladungsTeile,
  eventTitel,
  eventZeit,
  offeneEinladungen,
  sideEventsKurz,
  sideEventsMarke,
  tagText,
  zusagen,
  type SpeakerSideEvent,
} from "@/lib/speaker/side-events";

/**
 * ADM-087: der Block „Side Events“ je Speaker im Admin-Detail und im Personen-Fenster der Leads. Die Datenbank-Seite belegt
 * `supabase/tests/v6_speaker_side_events.sql` (20 Erwartungen, echter Rollenwechsel, Gegenstücke zu jeder Abweisung); hier steht, was
 * sich ohne Datenbank festhalten lässt — und, wo es geht, **ausgeführt** wird: Zählung, Marke, Kurzfassung, Zeilen und die Formatierung
 * der Zeiten laufen mit den echten Wörterbüchern (die Zeitformatierung stürzte schon einmal erst in der Laufzeit ab, #373).
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));
const sql = () => migrationText("v6_speaker_side_events");
const code = (text: string) => text.replace(/--[^\n]*/g, "");

const DETAIL = "app/(admin)/admin/speaker/[id]/Detail.tsx";
const SEITE = "app/(admin)/admin/speaker/[id]/page.tsx";
const FENSTER = "app/(speaker-leads)/speaker-leads/SpeakerFenster.tsx";
const AKTIONEN = "app/(speaker-leads)/speaker-leads/actions.ts";
const PIPELINE = "app/(speaker-leads)/speaker-leads/PipelineSeite.tsx";
const BLOCK = "components/speaker/SideEventsBlock.tsx";
const LIB = "lib/speaker/side-events.ts";

const zeile = (x: Partial<SpeakerSideEvent> = {}): SpeakerSideEvent => ({
  side_event_id: "e1",
  title_de: "Speaker Dinner",
  title_en: "Speaker Dinner EN",
  location: "Elbphilharmonie",
  starts_at: "2027-04-16T17:00:00Z",
  ends_at: "2027-04-16T20:00:00Z",
  published: true,
  status: "invited",
  guests: 0,
  via: "team",
  invited_at: "2026-10-05T09:00:00Z",
  mailed_at: null,
  responded_at: null,
  ...x,
});

describe("ADM-087: die Migration `v6_speaker_side_events`", () => {
  it("legt genau eine Lesefunktion an — keine Tabelle, keine Spalte, kein Schreibweg", () => {
    const c = code(sql());
    assert.equal((c.match(/create (or replace )?function\b/gi) ?? []).length, 1);
    assert.match(c, /create or replace function speaker_side_events\(p_profile_id uuid\)/);
    assert.doesNotMatch(c, /\b(create|alter|drop) table\b|\binsert into\b|\bupdate\b[^;]*\bset\b|\bdelete from\b|log_audit|queue_mail/i);
  });

  it("SECURITY DEFINER, STABLE, `search_path` gepinnt; am Ende `harden_definer_functions()`", () => {
    const c = code(sql());
    assert.match(c, /language plpgsql stable security definer set search_path to 'public', 'extensions' as \$\$/);
    assert.match(c.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("das Recht ist eng: `is_speaker_team` der Edition des Profils — nicht `can_manage_speaker` (Stage Leads, auch als Betreuer, bleiben draußen)", () => {
    const c = code(sql());
    assert.match(c, /select sp\.edition_id into v_ed from speaker_profile sp where sp\.id = p_profile_id;/);
    assert.match(c, /if not coalesce\(is_speaker_team\(v_ed\), false\) then raise exception 'not allowed' using errcode = '42501'; end if;/);
    assert.doesNotMatch(c, /can_manage_speaker|is_stage_lead_of|has_role\(/);
  });

  it("die Prüfungen stehen in der Reihenfolge Anmeldung (28000) → Recht (42501) → Existenz (P0002): wer nicht zum Team gehört, erfährt nicht, ob es das Profil gibt", () => {
    const c = code(sql());
    const anmeldung = c.indexOf("errcode = '28000'");
    const recht = c.indexOf("errcode = '42501'");
    const existenz = c.indexOf("errcode = 'P0002'");
    assert.ok(anmeldung > 0 && recht > anmeldung && existenz > recht, `Reihenfolge ${anmeldung} < ${recht} < ${existenz}`);
    assert.match(c, /if v_ed is null then raise exception 'speaker_not_found'/);
    assert.ok(c.indexOf("current_person_id() is null") < c.indexOf("select sp.edition_id"), "ohne Anmeldung wird gar nicht erst gesucht");
  });

  it("die Spaltenliste hat weder den Hinweis (`note`) noch den Token (`token_hash`) — Freitext kann Art.-9-Daten nennen", () => {
    const c = code(sql());
    const tabelle = c.slice(c.indexOf("returns table("), c.indexOf("language plpgsql"));
    assert.doesNotMatch(tabelle, /note|token/i);
    const auswahl = c.slice(c.indexOf("return query"), c.indexOf("order by"));
    assert.doesNotMatch(auswahl, /\bnote\b|token/i);
    assert.match(tabelle, /guests integer/, "die Begleitung nur als Zahl");
    for (const spalte of ["side_event_id", "title_de", "title_en", "location", "starts_at", "ends_at", "published", "status", "via", "invited_at", "mailed_at", "responded_at"]) {
      assert.match(tabelle, new RegExp(`\\b${spalte}\\b`), spalte);
    }
  });

  it("nur Einladungen dieses Profils und Events seiner Edition, nach Beginn sortiert, auch nicht veröffentlichte Events (kein `published`-Filter)", () => {
    const c = code(sql());
    const abfrage = c.slice(c.indexOf("return query"), c.indexOf("end $$"));
    assert.match(abfrage, /where i\.profile_id = p_profile_id\s+and e\.edition_id = v_ed/);
    assert.match(abfrage, /order by e\.starts_at, e\.id;/);
    assert.doesNotMatch(abfrage.slice(abfrage.indexOf("where")), /e\.published/, "ein zurückgezogenes Event darf nicht verschwinden");
  });
});

describe("ADM-087: der DB-Test hält die Regeln fest", () => {
  const test = () => quelle("supabase/tests/v6_speaker_side_events.sql");

  it("20 Erwartungen im Muster `t_erw`, mit echtem Rollenwechsel und den Rollen `authenticated` und `anon`", () => {
    const t = test();
    const erw = t.slice(t.indexOf("insert into t_erw values"), t.indexOf("create function pg_temp.abgewiesen"));
    assert.equal((erw.match(/^\s+\('\d\d_[a-z_]+', /gm) ?? []).length, 20);
    assert.match(t, /set local role authenticated/);
    assert.match(t, /set local role anon/);
    for (const rolle of ["'admin'", "'area_lead_speaker'", "'programme_team'", "'speaker_manager'", "'standbuehne_editor'"]) {
      assert.ok(t.includes(rolle), rolle);
    }
  });

  it("zu jeder Abweisung gibt es das Gegenstück, und der Stage Lead als Betreuer zeigt, dass `can_manage_speaker` weiter wäre", () => {
    const t = test();
    assert.match(t, /'06_stage_lead_betreuer', '\^kann_verwalten=true rejected 42501/);
    assert.match(t, /'05_rechte_je_rolle', '\^admin=3 area_lead_speaker=3 programme_team=3\$'/);
    assert.match(t, /'03_andere_edition', '\^einladung_da=true event_da=true nicht_dabei=true\$'/);
    assert.match(t, /'06_unbekannt_ohne_recht', '\^rejected 42501/);
    assert.match(t, /'06_unbekannt_team', '\^rejected P0002 speaker_not_found/);
  });

  it("die Fixtures machen jede falsche Sortierung sichtbar: Beginn weicht von Anlage, Id und Titel ab", () => {
    const t = test();
    assert.match(t, /a0870000-0000-4000-8000-000000000002', v_ed, 'ZZ Dinner'/);
    assert.match(t, /a0870000-0000-4000-8000-000000000001', v_ed, 'ZZ Brunch'/);
    assert.match(t, /a0870000-0000-4000-8000-000000000003', v_ed, 'ZZ Empfang'/);
    assert.equal((t.match(/created_at\)/g) ?? []).length, 3, "created_at ist gesetzt, sonst wären alle in einer Transaktion gleich");
  });
});

describe("ADM-087: Zählung, Marke und Kurzfassung (ausgeführt)", () => {
  it("„offen“ zählt nur unbeantwortete Einladungen zu **veröffentlichten** Events — zu einem Entwurf kann niemand antworten", () => {
    const rows = [
      zeile({ side_event_id: "a", status: "invited", published: true }),
      zeile({ side_event_id: "b", status: "invited", published: false }),
      zeile({ side_event_id: "c", status: "yes" }),
      zeile({ side_event_id: "d", status: "no" }),
    ];
    assert.equal(offeneEinladungen(rows), 1);
    assert.equal(offeneEinladungen([]), 0);
    assert.equal(zusagen(rows), 1);
  });

  it("die Marke „Offen“ / „Offen · n“ steht nur bei offenen Einladungen und ist gelb", () => {
    const t = woerterbuch("de").leads;
    assert.equal(sideEventsMarke([], t), undefined);
    assert.equal(sideEventsMarke([zeile({ status: "yes" })], t), undefined);
    assert.deepEqual(sideEventsMarke([zeile()], t), { text: "Offen", ton: "warning" });
    assert.deepEqual(sideEventsMarke([zeile({ side_event_id: "a" }), zeile({ side_event_id: "b" }), zeile({ side_event_id: "c", status: "yes" })], t), {
      text: "Offen · 2",
      ton: "warning",
    });
  });

  it("die Kurzfassung des zugeklappten Blocks: keine, eine, mehrere Einladungen mit und ohne Zusagen", () => {
    const de = woerterbuch("de").leads;
    const en = woerterbuch("en").leads;
    assert.equal(sideEventsKurz([], de), "Zu keinem Side Event eingeladen");
    assert.equal(sideEventsKurz([zeile({ status: "yes" })], de), "1 Einladung · 1 zugesagt");
    assert.equal(sideEventsKurz([zeile({ side_event_id: "a" }), zeile({ side_event_id: "b" })], de), "2 Einladungen");
    assert.equal(
      sideEventsKurz([zeile({ side_event_id: "a", status: "yes" }), zeile({ side_event_id: "b", status: "yes" }), zeile({ side_event_id: "c", status: "no" })], de),
      "3 Einladungen · 2 zugesagt",
    );
    assert.equal(sideEventsKurz([zeile({ status: "yes" })], en), "1 invitation · 1 attending");
  });
});

describe("ADM-087: Zeiten, Titel und die Zeile unter dem Event (ausgeführt)", () => {
  it("die Zeit läuft (kein TypeError) und zeigt Berliner Zeit — im Sommer und im Winter, deutsch und englisch", () => {
    assert.equal(eventZeit("de-DE", "2027-04-16T17:00:00Z"), "16.04.2027, 19:00");
    assert.equal(eventZeit("de-DE", "2027-01-15T18:00:00Z"), "15.01.2027, 19:00");
    assert.equal(eventZeit("en-GB", "2027-04-16T17:00:00Z"), "16 Apr 2027, 19:00");
    assert.equal(tagText("de-DE", "2026-10-05T22:30:00Z"), "06.10.2026", "22:30 UTC ist schon der nächste Tag in Berlin");
    assert.equal(tagText("en-GB", "2026-10-05T09:00:00Z"), "5 Oct 2026");
  });

  it("ein unlesbares Datum ergibt einen leeren Text statt eines Fehlers", () => {
    assert.equal(eventZeit("de-DE", "kein Datum"), "");
    assert.equal(tagText("de-DE", ""), "");
  });

  it("der Titel kommt in der Sprache der Ansicht, mit dem anderen als Rückfall und „—“ als letztem", () => {
    assert.equal(eventTitel(zeile(), "de"), "Speaker Dinner");
    assert.equal(eventTitel(zeile(), "en"), "Speaker Dinner EN");
    assert.equal(eventTitel(zeile({ title_en: "" }), "en"), "Speaker Dinner");
    assert.equal(eventTitel(zeile({ title_de: "" }), "de"), "Speaker Dinner EN");
    assert.equal(eventTitel(zeile({ title_de: "", title_en: "" }), "de"), "—");
  });

  it("die Zeile unter dem Event, deutsch: eine offene Einladung ohne Mail nennt nur Einladung und fehlende Mail", () => {
    const t = woerterbuch("de").leads;
    assert.deepEqual(einladungsTeile(zeile(), "de-DE", t), ["Eingeladen am 05.10.2026", "Keine Einladungsmail"]);
  });

  it("die Zeile nach einer Zusage per Link: Mail, Antwort mit Weg, Begleitung — und bei einem nicht veröffentlichten Event der Hinweis", () => {
    const t = woerterbuch("de").leads;
    const r = zeile({
      status: "yes",
      guests: 2,
      via: "email",
      published: false,
      mailed_at: "2026-10-05T09:05:00Z",
      responded_at: "2026-10-06T07:00:00Z",
    });
    assert.deepEqual(einladungsTeile(r, "de-DE", t), [
      "Eingeladen am 05.10.2026",
      "Einladungsmail am 05.10.2026",
      "Antwort am 06.10.2026 (per Link in der Mail)",
      "Begleitung: 2",
      "Im Speaker-Portal nicht sichtbar",
    ]);
  });

  it("eine Begleitung steht nur bei einer Zusage; jeder Weg hat seinen Text", () => {
    const t = woerterbuch("de").leads;
    const absage = einladungsTeile(zeile({ status: "no", guests: 3, via: "portal", responded_at: "2026-10-06T07:00:00Z" }), "de-DE", t);
    assert.ok(!absage.some((x) => x.startsWith("Begleitung")), absage.join(" | "));
    assert.ok(absage.includes("Antwort am 06.10.2026 (im Portal)"));
    const team = einladungsTeile(zeile({ status: "yes", via: "team", responded_at: "2026-10-06T07:00:00Z" }), "de-DE", t);
    assert.ok(team.includes("Antwort am 06.10.2026 (vom Team eingetragen)"));
    assert.ok(!team.some((x) => x.startsWith("Begleitung")), "Zusage ohne Begleitung nennt keine");
  });

  it("englisch: dieselben Zeilen aus dem englischen Wörterbuch", () => {
    const t = woerterbuch("en").leads;
    const r = zeile({ status: "yes", guests: 1, via: "email", mailed_at: "2026-10-05T09:05:00Z", responded_at: "2026-10-06T07:00:00Z" });
    assert.deepEqual(einladungsTeile(r, "en-GB", t), [
      "Invited on 5 Oct 2026",
      "Invitation email on 5 Oct 2026",
      "Answered on 6 Oct 2026 (via the link in the email)",
      "Guests: 1",
    ]);
  });
});

describe("ADM-087: Wörterbücher", () => {
  const schluessel = (sprache: "de" | "en") =>
    Object.keys(woerterbuch(sprache).leads)
      .filter((k) => /^(blockSideEvents|sideEvent)/.test(k))
      .sort();

  it("deutsch und englisch haben dieselben 20 Schlüssel, mit denselben Platzhaltern", () => {
    const de = woerterbuch("de").leads;
    const en = woerterbuch("en").leads;
    assert.deepEqual(schluessel("de"), schluessel("en"));
    assert.equal(schluessel("de").length, 20);
    for (const k of schluessel("de")) {
      const p = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
      assert.equal(p(de[k]), p(en[k]), `${k}: Platzhalter`);
      assert.ok(de[k].trim() !== "" && en[k].trim() !== "", `${k}: leer`);
    }
  });

  it("jeder Schlüssel, den Code oder Bausteine benutzen, steht im Wörterbuch — und jeder neue Schlüssel wird benutzt", () => {
    const text = [LIB, BLOCK, DETAIL, FENSTER].map(quelle).join("\n");
    const benutzt = new Set<string>();
    for (const m of text.matchAll(/\b(?:t|tl)\.((?:blockSideEvents|sideEvent\w+))/g)) benutzt.add(m[1]);
    for (const m of text.matchAll(/t\[`(sideEventVia_)\$\{[^}]+\}`\]/g)) for (const w of ["portal", "email", "team"]) benutzt.add(`${m[1]}${w}`);
    for (const k of benutzt) assert.ok(schluessel("de").includes(k), `${k} fehlt im Wörterbuch`);
    for (const k of schluessel("de")) assert.ok(benutzt.has(k), `${k} wird nirgends benutzt`);
  });
});

describe("ADM-087: die Seite und das Detail", () => {
  it("die Seite liest `speaker_side_events` mit der Profil-Id im selben Aufruf wie die übrigen Daten; ein Fehler wird „nicht zu laden“, nie eine leere Liste", () => {
    const s = quelle(SEITE);
    assert.match(s, /supabase\.rpc\("speaker_side_events", \{ p_profile_id: id \}\)/);
    assert.match(s, /sideEvents=\{sideEventsAntwort\.error \? null : \(\(sideEventsAntwort\.data \?\? \[\]\) as SpeakerSideEvent\[\]\)\}/);
    assert.match(s, /sideEventStatus: vgroup\(vocab, "side_event_status"\)/);
    // das Tor bleibt, wie es war
    assert.match(s, /await requireAdminSection\("speakers", `\/admin\/speaker\/\$\{id\}`\)/);
  });

  it("der Block steht als siebte Karte zwischen Hospitality und Programm — für den Admin in jedem Stand, mit Marke und Kurzfassung", () => {
    const d = quelle(DETAIL);
    const hospitality = d.indexOf('id="hospitality"');
    const sideEvents = d.indexOf('<Block id="side-events"');
    const programm = d.indexOf('id="programm"');
    assert.ok(hospitality > 0 && sideEvents > hospitality && programm > sideEvents, `${hospitality} < ${sideEvents} < ${programm}`);
    assert.match(d, /<Block id="side-events" karte ebene="h2" titel=\{tl\.blockSideEvents\} marke=\{markeSideEvents\} kurz=\{kurzSideEvents\}>/);
    // der Block folgt unmittelbar auf den Kommentar davor — keine Bedingung („nachZusage && …“, „? …“) dazwischen: der Admin sieht jeden Block in jedem Stand
    assert.match(d.slice(d.lastIndexOf("*/}", sideEvents), sideEvents), /^\*\/\}\s*$/);
    assert.match(d, /const markeSideEvents = sideEvents === null \? undefined : sideEventsMarke\(sideEvents, tl\);/);
    assert.match(d, /const kurzSideEvents = sideEvents === null \? tl\.sideEventsError : sideEventsKurz\(sideEvents, tl\);/);
    assert.match(d, /\{ id: "hospitality", label: tl\.blockHospitality \},\s+\{ id: "side-events", label: tl\.blockSideEvents \},\s+\{ id: "programm"/);
  });

  it("der Block bekommt die Einladungen, die Gast-Kennzeichnung, die Vokabular-Bezeichnungen, die Formatsprache und die deutschen Titel", () => {
    const d = quelle(DETAIL);
    const block = d.slice(d.indexOf("<SideEventsBlock"), d.indexOf("</Block>", d.indexOf("<SideEventsBlock")));
    assert.match(block, /rows=\{sideEvents\}/);
    assert.match(block, /gast=\{gast\}/);
    assert.match(block, /statusLabels=\{labels\.sideEventStatus \?\? \{\}\}/);
    assert.match(block, /sprache=\{dateLocale\}/);
    assert.match(block, /locale="de"/);
    assert.match(block, /t=\{tl\}/);
  });
});

describe("ADM-087: das Personen-Fenster", () => {
  const fenster = () => quelle(FENSTER);

  it("der Block steht zwischen Hospitality und Programm und nur für das Team, nach der Zusage, nie für Gäste", () => {
    const f = fenster();
    assert.match(f, /const zeigeSideEvents = isTeam && nachZusage && !gast;/);
    assert.match(f, /\{zeigeSideEvents && \(\s+<Block id="fenster-side-events" ebene="h3" titel=\{t\.blockSideEvents\} marke=\{markeSideEvents\} kurz=\{kurzSideEvents\}>/);
    const hospitality = f.indexOf('id="fenster-hospitality"');
    const sideEvents = f.indexOf('id="fenster-side-events"');
    const programm = f.indexOf('id="fenster-programm"');
    assert.ok(hospitality > 0 && sideEvents > hospitality && programm > sideEvents, `${hospitality} < ${sideEvents} < ${programm}`);
  });

  it("die Einladungen werden nur geladen, wenn der Block erscheint — Stage Leads rufen die Funktion nie auf (sie würden 42501 bekommen)", () => {
    const f = fenster();
    const wirkung = f.slice(f.indexOf("useEffect(() => {\n    if (!zeigeSideEvents) return;"), f.indexOf("}, [speaker.id, zeigeSideEvents]);") + 40);
    assert.match(wirkung, /if \(!zeigeSideEvents\) return;/);
    assert.match(wirkung, /void speakerSideEvents\(speaker\.id\)\.then\(\(rows\) => \{\s+if \(aktuell\) setSideEvents\(rows\);/);
    assert.match(wirkung, /\}, \[speaker\.id, zeigeSideEvents\]\);/);
    assert.equal((f.match(/speakerSideEvents\(/g) ?? []).length, 1, "genau ein Aufruf, und der steht hinter der Bedingung");
    assert.match(f, /useState<SpeakerSideEvent\[\] \| null \| undefined>\(undefined\)/, "undefined = lädt, null = nicht zu lesen");
  });

  it("solange sie laden, steht keine Kurzfassung; nicht zu lesen heißt Fehlermeldung statt „nicht eingeladen“", () => {
    const f = fenster();
    assert.match(f, /const markeSideEvents = sideEvents \? sideEventsMarke\(sideEvents, t\) : undefined;/);
    assert.match(f, /const kurzSideEvents = sideEvents === undefined \? undefined : sideEvents === null \? t\.sideEventsError : sideEventsKurz\(sideEvents, t\);/);
  });

  it("die Aktion liest nur, antwortet bei Fehler mit `null` (nie `[]`) und meldet alles außer 42501 ins Protokoll", () => {
    const a = quelle(AKTIONEN);
    const von = a.indexOf("export async function speakerSideEvents");
    const aktion = a.slice(von, a.indexOf("\n}\n", von) + 3);
    assert.match(aktion, /const supabase = await client\(\);/, "hinter dem Tor des Bereichs");
    assert.match(aktion, /supabase\.rpc\("speaker_side_events", \{ p_profile_id: profileId \}\)/);
    assert.match(aktion, /if \(error\) \{\s+if \(error\.code !== "42501"\) console\.error/);
    assert.match(aktion, /return null;\s+\}\s+return \(data \?\? \[\]\) as SpeakerSideEvent\[\];/);
    assert.doesNotMatch(aktion, /revalidatePath|refresh\(\)|\.insert\(|\.update\(|\.delete\(/);
  });

  it("die Vokabular-Bezeichnungen der Stände kommen mit der Seite des Fensters", () => {
    assert.match(quelle(PIPELINE), /sideEventStatus: vgroup\(vocab, "side_event_status"\)/);
  });
});

describe("ADM-087: der Baustein ist nur lesend und unterscheidet laden, nicht lesbar, leer und gefüllt", () => {
  const b = () => quelle(BLOCK);

  it("keine Zustände, keine Aktionen — nur Anzeige und ein Weg zur Verwaltung", () => {
    const text = b();
    assert.doesNotMatch(text, /useState|useEffect|useTransition|onClick|"use server"|from "\.\.\/\.\.\/app|actions"/);
    assert.equal(SIDE_EVENTS_PFAD, "/admin/side-events");
    assert.match(text, /<ButtonLink href=\{SIDE_EVENTS_PFAD\} variant="secondary" size="sm">/);
  });

  it("die vier Zustände haben je ihren Zweig: `undefined` lädt, `null` ist eine Meldung (role=alert), `[]` ist leer, sonst die Liste", () => {
    const text = b();
    assert.match(text, /rows === undefined \? \([\s\S]*?role="status"[\s\S]*?t\.sideEventsLoading/);
    assert.match(text, /rows === null \? \([\s\S]*?role="alert"[\s\S]*?t\.sideEventsError/);
    assert.match(text, /rows\.length === 0 \? \(\s+<p className="ct-help">\{gast \? t\.sideEventsEmptyGuest : t\.sideEventsEmpty\}<\/p>/);
  });

  it("jede Zeile zeigt Titel, Zeit und Ort, den Stand als Badge mit Ton, bei einem Entwurf „Nicht veröffentlicht“ und die Angaben dazu", () => {
    const text = b();
    assert.match(text, /const TON: Record<SideEventStand, BadgeTone> = \{ invited: "warning", yes: "success", no: "neutral" \};/);
    assert.match(text, /\{eventTitel\(r, locale\)\}/);
    assert.match(text, /eventZeit\(sprache, r\.starts_at\), r\.location/);
    assert.match(text, /\{!r\.published && <Badge>\{t\.sideEventsUnpublished\}<\/Badge>\}/);
    assert.match(text, /<Badge tone=\{TON\[r\.status\]\}>\{statusLabels\[r\.status\] \?\? r\.status\}<\/Badge>/);
    assert.match(text, /\{einladungsTeile\(r, sprache, t\)\.join\(" · "\)\}/);
  });

  it("der Typ kennt weder Hinweis noch Token — die Funktion liefert sie nicht", () => {
    const l = quelle(LIB);
    const typ = l.slice(l.indexOf("export type SpeakerSideEvent"), l.indexOf("};", l.indexOf("export type SpeakerSideEvent")));
    assert.doesNotMatch(typ, /\bnote\b|token/i);
    assert.doesNotMatch(l, /\.note\b|token_hash/);
  });
});

describe("ADM-087: Admin-Weg, Testdaten und Doku", () => {
  it("die Verwaltung, auf die der Block verweist, gibt es als Admin-Abschnitt mit demselben Pfad", () => {
    const abschnitte = quelle("lib/admin-sections.ts");
    assert.match(abschnitte, /\{ key: "sideEvents", path: "\/admin\/side-events"/);
  });

  it("der Testdaten-Schritt `side-events` lädt Konrad auch zum Entwurf ein — so zeigt sein Speaker-Detail beide Zustände", () => {
    const s = quelle("scripts/testdaten-konrad.mjs");
    assert.match(
      s,
      /side_event_id: ids\[SIDE_EVENT_ENTWURF\], profile_id: sp\.id, status: "invited", guests: 0, note: null, via: "team"/,
    );
    assert.match(s, /\/admin\/speaker → Konrads Testprofil → Block „Side Events“/);
  });

  it("die Doku nennt den Klickweg, den Datenschutz, den Testplan und die Zeile des Tests", () => {
    assert.match(quelle("docs/team-testleitfaden.md"), /Block „Side Events“ im Speaker-Detail/);
    const testdaten = quelle("docs/testdaten-konrad.md");
    assert.match(testdaten, /Block „Side Events“ im Speaker-Detail zeigt sie mit „Nicht veröffentlicht“/);
    assert.match(testdaten, /`\/admin\/speaker` → Konrads Testprofil → Block „Side Events“/);
    assert.match(quelle("docs/datenschutz-verarbeitungen.md"), /seit ADM-087 auch je Speaker als Block „Side Events“/);
    assert.match(quelle("supabase/tests/README.md"), /\| `v6_speaker_side_events\.sql` \|/);
  });
});
