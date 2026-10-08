import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { ADMIN_SECTIONS } from "@/lib/admin-sections";
import {
  BEREICH_ABSCHNITT,
  FRIST_BEREICHE,
  NEUE_ZIELGRUPPE,
  bereichDerFrist,
  beschriftung,
  erinnerungText,
  inLokaleZeit,
  leseBereich,
  leseTage,
  zaehleJeBereich,
} from "@/lib/fristen/anzeige";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
type W = { admin: { deadlines: Record<string, string>; words: Record<string, string> }; rpc: Record<string, string>; auditAction: Record<string, string> };
const de = JSON.parse(lies("lib/i18n/de.json")) as W;
const en = JSON.parse(lies("lib/i18n/en.json")) as W;

describe("Fristen je Bereich: Hilfen (ADM-099)", () => {
  it("jede Zielgruppe gehört einem Bereich, alles Unbekannte dem System (fail closed)", () => {
    assert.equal(bereichDerFrist("speaker"), "speaker");
    assert.equal(bereichDerFrist("partner"), "partner");
    assert.equal(bereichDerFrist("volunteer"), "volunteers");
    for (const a of ["award", "all", "hackathon", "", "irgendwas"]) assert.equal(bereichDerFrist(a), "system", a);
    assert.equal(leseBereich("partner"), "partner");
    assert.equal(leseBereich("unbekannt"), "speaker");
    assert.equal(leseBereich(undefined), "speaker");
  });

  it("neue Fristen eines Bereichs entstehen mit der Zielgruppe dieses Bereichs; die Rechte kommen aus demselben Abschnitt wie in der Datenbank", () => {
    for (const b of FRIST_BEREICHE) assert.equal(bereichDerFrist(NEUE_ZIELGRUPPE[b]), b, b);
    const sql = migrationText("v6_fristen_je_bereich");
    const zuordnung: Record<string, string> = { speaker: "deadlinesSpeaker", partner: "deadlinesPartner", volunteer: "deadlinesVolunteers" };
    for (const [aud, abschnitt] of Object.entries(zuordnung)) assert.match(sql, new RegExp(`when '${aud}' then '${abschnitt}'`));
    assert.match(sql, /else 'deadlinesSystem' end/);
    assert.deepEqual(Object.values(BEREICH_ABSCHNITT).sort(), ["deadlinesPartner", "deadlinesSpeaker", "deadlinesSystem", "deadlinesVolunteers"]);
  });

  it("die Beschriftung kommt in der Sprache der Person, sonst in der anderen — nie der Schlüssel", () => {
    assert.equal(beschriftung({ label_de: "Abstimmung ab", label_en: "Voting from" }, "de"), "Abstimmung ab");
    assert.equal(beschriftung({ label_de: "Abstimmung ab", label_en: "Voting from" }, "en"), "Voting from");
    assert.equal(beschriftung({ label_de: "Nur deutsch", label_en: null }, "en"), "Nur deutsch");
    assert.equal(beschriftung({ label_de: " ", label_en: null }, "de"), "—");
  });

  it("die Erinnerung steht in Tagen; was kein voller Tag ist, in Stunden", () => {
    const t = { reminderAtDue: "zur Fälligkeit", reminderDays: "{n} Tage vorher", reminderHours: "{n} Stunden vorher" };
    assert.equal(erinnerungText({ reminder_hours: 0 }, t), "zur Fälligkeit");
    assert.equal(erinnerungText({ reminder_hours: 48 }, t), "2 Tage vorher");
    assert.equal(erinnerungText({ reminder_hours: 336 }, t), "14 Tage vorher");
    assert.equal(erinnerungText({ reminder_hours: 36 }, t), "36 Stunden vorher");
  });

  it("die Eingabe der Tage: ganze Zahl von 0 bis 90, sonst keine", () => {
    assert.equal(leseTage("0"), 0);
    assert.equal(leseTage("7"), 7);
    assert.equal(leseTage(" 90 "), 90);
    for (const x of ["91", "-1", "1.5", "", "abc", "100", "2 Tage"]) assert.equal(leseTage(x), null, x);
  });

  it("die lokale Zeit passt in ein datetime-local-Feld, und die Zählung je Bereich stimmt", () => {
    assert.match(inLokaleZeit("2027-03-31T12:00:00Z"), /^2027-03-31T\d{2}:\d{2}$/);
    assert.deepEqual(zaehleJeBereich([{ audience: "partner" }, { audience: "partner" }, { audience: "award" }, { audience: "speaker" }]), {
      speaker: 1, partner: 2, volunteers: 0, system: 1,
    });
  });
});

describe("Fristen je Bereich: Migration (ADM-099)", () => {
  const sql = migrationText("v6_fristen_je_bereich");

  it("Rechte je Zielgruppe statt is_staff(), alt und neu geprüft; Systemfristen bleiben fest", () => {
    const upsert = sql.slice(sql.indexOf("function upsert_deadline("), sql.indexOf("function delete_deadline("));
    assert.ok(!/is_staff\(\)/.test(upsert), "kein pauschales is_staff() mehr");
    assert.equal((upsert.match(/can_edit_deadline\(/g) ?? []).length >= 3, true, "alt, neu und Anlegen");
    assert.match(upsert, /deadline_is_system/);
    assert.match(upsert, /v_key !~ '\^\[a-z\]\[a-z0-9_\]\{2,60\}\$'/);
    assert.match(upsert, /has_admin_section\('deadlinesSystem'\)/, "Schlüssel von aussen nur admin");
  });

  it("Löschen: nur eigene, ungenutzte; die Nutzung schaut in Vorlagen und Aufgaben", () => {
    const del = sql.slice(sql.indexOf("function delete_deadline("), sql.indexOf("function deadlines_overview("));
    assert.match(del, /can_edit_deadline\(v\.audience\)/);
    assert.match(del, /if not v\.custom then raise exception 'deadline_is_system'/);
    assert.match(del, /deadline_in_use/);
    const nutzung = sql.slice(sql.indexOf("function deadline_usage_count("), sql.indexOf("function upsert_deadline("));
    assert.match(nutzung, /deliverable_template/);
    assert.match(nutzung, /speaker_task/);
  });

  it("die Übersicht gibt den Schlüssel nicht heraus und sagt je Zeile, ob die Person ändern darf", () => {
    const kopf = /function deadlines_overview\([^)]*\)\s+RETURNS TABLE\(([^)]*)\)/.exec(sql)?.[1] ?? "";
    assert.ok(kopf.length > 0);
    assert.ok(!/\bkey\b/.test(kopf), "Schlüssel nicht in der Übersicht");
    assert.match(kopf, /can_edit boolean/);
    assert.match(kopf, /usage_count integer/);
  });

  it("alle drei neuen Abschnitte tragen die Rollen aus dem Vorschlag, System nur admin, und die Datei endet gehärtet", () => {
    for (const [abschnitt, rollen] of Object.entries({
      deadlinesSpeaker: ["area_lead_speaker", "programme_team"],
      deadlinesPartner: ["area_lead_partner", "partner_team"],
      deadlinesVolunteers: ["area_lead_volunteers", "volunteers_team"],
    })) {
      const s = ADMIN_SECTIONS.find((x) => x.key === abschnitt)!;
      assert.deepEqual([...s.roles].sort(), [...rollen].sort(), abschnitt);
    }
    assert.deepEqual(ADMIN_SECTIONS.find((x) => x.key === "deadlinesSystem")!.roles, []);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("Fristen je Bereich: Oberfläche (ADM-099)", () => {
  const baustein = lies("components/fristen/FristenVerwaltung.tsx");
  const seite = lies("app/(admin)/admin/fristen/page.tsx");
  const aktionen = lies("components/fristen/actions.ts");

  it("die Oberfläche zeigt nie den Schlüssel: keine Spalte, keine Eingabe, keine Auswahl", () => {
    assert.ok(!/\b(f|e|frist|offen)\.key\b/.test(baustein), "der Baustein liest keinen Schlüssel der Frist (res.key ist der Fehlerschlüssel)");
    assert.ok(!/fieldKey|colKey/.test(baustein));
    assert.match(seite, /rpc\("deadlines_overview"\)/);
    assert.ok(!/from\("deadline"\)/.test(seite), "die Seite liest nicht mehr die Tabelle (mit Schlüssel)");
  });

  it("geändert wird über die Id; eine neue Frist hat keinen Schlüssel in der Eingabe; die Aktionen gehen über die Sitzung", () => {
    assert.match(baustein, /\.\.\.\(e\.id \? \{ id: e\.id \} : \{\}\)/);
    assert.match(aktionen, /rpc\("upsert_deadline"/);
    assert.match(aktionen, /rpc\("delete_deadline"/);
    assert.match(aktionen, /requireAnyAdminSection\(ABSCHNITTE/);
    assert.ok(!/createSupabaseAdminClient/.test(aktionen));
  });

  it("Löschen gibt es nur für eigene Fristen, und nur wenn nichts darauf zeigt", () => {
    assert.match(baustein, /f\.custom && \(/);
    assert.match(baustein, /f\.usage_count > 0/);
  });

  it("die Übersicht hat einen Reiter je Bereich und lässt jede Person nur ändern, wofür sie das Recht hat", () => {
    assert.match(seite, /FRIST_BEREICHE\.map/);
    assert.match(seite, /can_edit_deadline/);
    assert.match(seite, /darfAnlegen=\{darf === true\}/);
    assert.match(baustein, /f\.can_edit \?/);
  });

  it("alle Schlüssel der Oberfläche stehen in DE und EN, samt Fehlerschlüsseln und Protokollname", () => {
    const keys = new Set([...baustein.matchAll(/\bt\.([a-zA-Z_]+)\b/g)].map((m) => m[1]));
    for (const k of keys) {
      assert.ok(k in de.admin.deadlines, `de ${k}`);
      assert.ok(k in en.admin.deadlines, `en ${k}`);
    }
    for (const b of FRIST_BEREICHE) assert.ok(de.admin.deadlines[`area_${b}`] && en.admin.deadlines[`area_${b}`], `area_${b}`);
    const rpcKeys = lies("lib/rpc-error.ts");
    for (const k of ["deadline_in_use", "deadline_is_system", "deadline_not_found", "invalid_reminder"]) {
      assert.ok(rpcKeys.includes(`"${k}"`), `BUSINESS_KEYS ${k}`);
      assert.ok(de.rpc[k] && en.rpc[k], `rpc ${k}`);
    }
    assert.ok(de.auditAction["deadline.delete"] && en.auditAction["deadline.delete"]);
    for (const k of ["deadlinesSpeaker", "deadlinesPartner", "deadlinesVolunteers", "deadlinesSystem"]) {
      assert.ok(de.admin.words[k] && en.admin.words[k], `Seitenkopf-Wort ${k}`);
    }
  });
});
