import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { eckdatenItems } from "@/lib/hackathon/eckdaten";
import { standKarte } from "@/lib/hackathon/stand";

const teilnahme = (o: Partial<Parameters<typeof standKarte>[0]> = {}) => ({
  application: { status: "accepted" as const }, team: { id: "t" }, challenge: { submission_deadline: "2027-04-16T10:00:00Z" }, submission: null, ...o,
});

describe("Stand-Karte der Hackathon-Startseite (HACK-013)", () => {
  it("jeder Stand hat genau einen Satz; die Aktion springt zur passenden Karte darunter", () => {
    assert.deepEqual(standKarte(teilnahme({ application: null, team: null, challenge: null })), { key: "open", anchor: "apply", deadline: null, late: false });
    assert.equal(standKarte(teilnahme({ application: { status: "applied" }, team: null, challenge: null })).anchor, "application");
    assert.equal(standKarte(teilnahme({ team: null, challenge: null })).key, "noTeam");
    assert.equal(standKarte(teilnahme({ challenge: null })).key, "noChallenge");
    const build = standKarte(teilnahme());
    assert.deepEqual([build.key, build.anchor, build.deadline], ["build", "submit", "2027-04-16T10:00:00Z"]);
    assert.equal(standKarte(teilnahme({ submission: { late: false } })).key, "submitted");
    assert.equal(standKarte(teilnahme({ submission: { late: true } })).late, true);
  });

  it("abgelehnt und zurückgezogen haben keine Aktion", () => {
    assert.equal(standKarte(teilnahme({ application: { status: "declined" }, team: null, challenge: null })).anchor, null);
    assert.equal(standKarte(teilnahme({ application: { status: "withdrawn" }, team: null, challenge: null })).anchor, null);
  });
});

describe("Eckdaten des Hackathons (HACK-013/020)", () => {
  const voll = { start_date: "2027-04-15", end_date: "2027-04-16", start_time: "14:00:00", end_time: "18:00:00", timezone: "Europe/Berlin", venue: "Halle 2", location: "Hamburg", note: "Kick-off 14:00" };

  it("Datum mit Spanne, Uhrzeiten und Zusatzzeile; Ort mit Veranstaltungsort", () => {
    const [datum, ort] = eckdatenItems(voll, "en-GB");
    assert.equal(datum.art, "datum");
    assert.equal(datum.art === "datum" && datum.tag, "15");
    assert.match(datum.titel, /15/);
    assert.match(datum.titel, /16/);
    assert.equal(datum.zusatz, "14:00–18:00 · Kick-off 14:00");
    assert.deepEqual([ort.titel, ort.zusatz], ["Halle 2", "Hamburg"]);
  });

  it("nichts Erfundenes: ohne Angabe fehlt die Zeile", () => {
    assert.deepEqual(eckdatenItems(null, "en-GB"), []);
    const nur = eckdatenItems({ ...voll, start_date: null, end_date: null, venue: null, location: null }, "en-GB");
    assert.deepEqual(nur, []);
    const ohneZeit = eckdatenItems({ ...voll, start_time: null, end_time: null, note: null, venue: null }, "de-DE");
    assert.equal(ohneZeit.length, 2);
    assert.equal(ohneZeit[0].zusatz, undefined);
    assert.equal(ohneZeit[1].titel, "Hamburg");
    assert.equal(ohneZeit[1].zusatz, undefined);
  });

  it("ein Tag allein wird ohne Spanne gezeigt", () => {
    const [d] = eckdatenItems({ ...voll, end_date: "2027-04-15" }, "en-GB");
    assert.doesNotMatch(d.titel, /–/);
  });
});

describe("Hackathon-Eckdaten: Datenbank und Oberfläche (HACK-020)", async () => {
  const { readFileSync } = await import("node:fs");
  const { migrationText } = await import("@/tests/migration-datei");
  const sql = migrationText("v6_hack_eventseite");
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

  it("Zeiten ohne zweite Quelle für das Datum, Pflege nur durch das Hack-Team, Feldnamen im Audit", () => {
    assert.match(sql, /add column if not exists start_time time/);
    assert.doesNotMatch(sql, /add column if not exists starts_at/);
    const set = sql.slice(sql.indexOf("create or replace function set_hackathon_info"), sql.indexOf("-- ---------------------------------------------------------------- 2"));
    assert.match(set, /if not is_hack_team\(\) then raise exception 'not allowed' using errcode = '42501'/);
    assert.match(set, /'invalid_range'/);
    assert.match(set, /'note_too_long'/);
    assert.match(set, /'hack\.info_set'[\s\S]*jsonb_build_object\('fields'/);
  });

  it("die Lese-RPC hat dasselbe Gate wie das Portal und zählt erst ab 20", () => {
    const info = sql.slice(sql.indexOf("create or replace function hack_event_info"));
    assert.match(info, /has_role\('hackathon_participant'\) or has_role\('hackathon_partner'\) or has_role\('area_lead_hackathon'\) or is_hack_team\(\)/);
    assert.match(info, /v_acc >= 20/);
    assert.doesNotMatch(info, /first_name|last_name/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("der Typ hackathon_lead steht im Vokabular, im CHECK und in upsert_edition_contact — mit der ganzen Live-Liste", () => {
    assert.match(sql, /'partner_lead', 'partner_buddy', 'speaker_lead', 'speaker_buddy', 'tour_lead', 'hackathon_lead'/);
    assert.match(sql, /not in \('partner_lead','partner_buddy','speaker_lead','speaker_buddy','tour_lead','hackathon_lead'\)/);
  });

  it("die Startseite nutzt die Bausteine, die Seitenspalte steht am Handy nach dem Hauptteil", () => {
    const st = read("components/hackathon/Startseite.tsx");
    assert.match(st, /lg:order-2 lg:col-span-2/);
    assert.match(st, /lg:order-1 lg:col-span-1/);
    assert.match(st, /<Eckdaten[\s\S]*<NextStepBanner/);
    assert.match(read("app/(hackathon)/hackathon/page.tsx"), /hack_event_info/);
    for (const lang of ["de", "en"]) {
      const j = JSON.parse(read(`lib/i18n/${lang}.json`));
      for (const k of ["standOpen", "standNoTeam", "standBuild", "standSubmittedLate", "sideContact", "sideCounts"]) assert.ok(j.hackathon[k], `${lang}:${k}`);
      for (const k of ["infoTitle", "infoSave", "infoSaved"]) assert.ok(j.adminHackathon[k], `${lang}:${k}`);
      for (const k of ["invalid_range", "note_too_long"]) assert.ok(j.rpc[k], `${lang}:${k}`);
    }
  });

  it("die Eckdaten sind im Admin pflegbar (Admin-Weg)", () => {
    assert.match(read("app/(admin)/admin/hackathon/page.tsx"), /<EckdatenForm/);
    assert.match(read("app/(admin)/admin/hackathon/actions.ts"), /rpc\("set_hackathon_info"/);
  });
});
