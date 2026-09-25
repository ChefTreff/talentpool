import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const sql = () => migrationText("v6_talk_speaker_zugang");
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Rumpf einer Funktion aus dem Migrationstext, bis zum nächsten `$$;`. */
function rumpf(name: string): string {
  const s = sql();
  const start = s.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `${name} fehlt`);
  return s.slice(start, s.indexOf("$$;", start));
}

describe("Speaker eines gebuchten Slots: Datenmodell (PART-091)", () => {
  it("die Empfängerregel steht am Profil und zeigt nur auf einen Kontakt desselben Profils", () => {
    const s = sql();
    assert.match(s, /add constraint speaker_contact_id_profile_key unique \(id, profile_id\)/);
    assert.match(s, /add column mail_via_contact_id uuid;/);
    assert.match(
      s,
      /foreign key \(mail_via_contact_id, id\) references speaker_contact \(id, profile_id\)\s+on delete set null \(mail_via_contact_id\)/,
    );
    assert.match(s, /\('speaker_contact_kind', 'partner', 'Partner-Kontakt', 'Partner contact', 6\)/);
    assert.match(s, /\('partner_speaker_contact', 'de', 1,/);
    assert.match(s, /\('partner_speaker_contact', 'en', 1,/);
    assert.match(s.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("partner_add_speaker: eigener Zugang wie bisher, Verwaltet-Fall über den Operations-Kontakt", () => {
    const s = sql();
    assert.match(s, /drop function if exists partner_add_speaker\(uuid, text, text, text\);/);
    assert.match(s, /grant execute on function partner_add_speaker\(uuid, text, text, text, boolean\) to authenticated;/);
    const f = rumpf("partner_add_speaker");
    assert.match(f, /p_verwaltet boolean DEFAULT false/);
    // Das Recht bleibt das aus 0139: Partner der Session mit Bearbeitungsrecht.
    assert.match(f, /if v_se\.partner_org_id is null or not partner_can_edit\(v_se\.partner_org_id\) then/);
    assert.match(f, /om\.roles @> '\{primary_ops\}'/);
    assert.match(f, /raise exception 'no_ops_contact' using errcode = 'P0001'/);
    assert.match(f, /raise exception 'speaker_has_access' using errcode = 'P0001'/);
    assert.match(f, /raise exception 'contact_is_speaker' using errcode = '23514'/);
    assert.match(f, /select v_prof, 'partner', p\.id, p\.first_name, p\.last_name, pe\.email, true, current_date/);
    assert.match(f, /update speaker_profile set mail_via_contact_id = v_kontakt where id = v_prof;/);
    assert.match(f, /values \(v_ops, 'speaker_assistant', 'edition', v_ed,/);
    assert.match(f, /perform queue_mail\('partner_speaker_contact', v_ops,/);
    // Nur beim ersten Anlegen: ein zweiter Slot schickt keine zweite Mail.
    assert.match(f, /if coalesce\(p_verwaltet, false\) and v_prof_neu then/);
    // Keine Mail an den Speaker selbst.
    assert.doesNotMatch(f, /queue_mail\([^,]+, v_person/);
    assert.match(f, /'verwaltet', coalesce\(p_verwaltet, false\), 'contact_id', v_kontakt/);
  });

  it("partner_speakers nennt den Kontakt, partner_assign_stage_guest gibt Gästen keinen Talk-Slot mehr", () => {
    const s = sql();
    assert.match(s, /drop function if exists partner_speakers\(uuid, uuid\);/);
    assert.match(s, /grant execute on function partner_speakers\(uuid, uuid\) to authenticated;/);
    assert.match(rumpf("partner_speakers"), /photo_asset_id uuid, mail_contact_name text\)/);
    assert.match(rumpf("partner_speakers"), /where c\.id = sp\.mail_via_contact_id\)/);
    const gast = rumpf("partner_assign_stage_guest");
    assert.match(gast, /v_talk := not v_buehne and not coalesce\(p_assign, false\)/);
    assert.doesNotMatch(gast, /v_se\.format in \('keynote'/);
    // Die Standbühne bleibt, wie sie war.
    assert.match(gast, /v_stage\.type = 'partner_booth'/);
  });
});

describe("Talk-Seite: Speaker eintragen (PART-091, PART-089)", () => {
  const seite = () => src("app/(partner)/partner/talk/page.tsx");
  const formular = () => src("app/(partner)/partner/talk/SpeakerHinzufuegen.tsx");
  const karte = () => src("app/(partner)/partner/talk/SpeakerKarte.tsx");

  it("keine Gäste mehr auf der Talk-Seite, dafür das Eintragen mit der Zugangsfrage", () => {
    assert.doesNotMatch(seite(), /Gaesteliste|TalkGaeste|partner_stage_guests/);
    assert.match(seite(), /<SpeakerHinzufuegen/);
    assert.match(seite(), /rpc\("partner_contacts", \{ p_org_id: current\.org_id \}\)/);
    assert.match(seite(), /includes\("primary_ops"\)/);
    assert.match(formular(), /t\.modeQuestion/);
    assert.match(formular(), /verwaltet,\n/);
    // Ohne Operations-Kontakt steht nur der eigene Zugang zur Wahl.
    assert.match(formular(), /if \(opsName !== null\) optionen\.push/);
    // Fehler stehen im Formular, nicht im Toast.
    assert.match(formular(), /role="alert"/);
    assert.match(src("app/(partner)/partner/actions.ts"), /p_verwaltet: input\.verwaltet/);
  });

  it("die Karte sagt beim verwalteten Speaker, über wen die Kommunikation läuft", () => {
    assert.match(karte(), /speaker\.mail_contact_name/);
    assert.match(karte(), /t\.managedNote\.replace\("\{kontakt\}", kontakt\)/);
  });

  it("Programmpunkte auf der Standbühne stehen nicht unter Talk (PART-089)", () => {
    assert.match(seite(), /from\("stage"\)\.select\("id, type"\)/);
    assert.match(seite(), /b\.type === "partner_booth"/);
    assert.match(seite(), /!\(x\.stage_id && standbuehnen\.has\(x\.stage_id\)\)/);
  });

  it("die Standbühne ordnet Gäste weiter zu", () => {
    assert.match(src("app/(partner)/partner/buehne/StandTabelle.tsx"), /<GastZuordnung/);
  });

  it("Admin-Weg: die Organisation zeigt ihre Speaker mit Zugangsweg", () => {
    const admin = src("app/(admin)/admin/partner/[org]/page.tsx");
    assert.match(admin, /rpc\("partner_speakers", \{ p_org_id: org \}\)/);
    assert.match(src("app/(admin)/admin/partner/[org]/OrgDetail.tsx"), /href=\{`\/admin\/speaker\/\$\{sp\.profile_id\}`\}/);
  });

  it("alle benutzten Texte stehen in beiden Wörterbüchern", () => {
    const benutzt = (text: string, praefix: string) =>
      [...new Set([...text.matchAll(new RegExp(`\\b${praefix}\\.([a-zA-Z]+)`, "g"))].map((m) => m[1]))];
    const talk = [...benutzt(seite(), "s"), ...benutzt(formular(), "t"), ...benutzt(karte(), "t")];
    const admin = benutzt(src("app/(admin)/admin/partner/[org]/OrgDetail.tsx"), "t").filter((k) => k.startsWith("talkSpeaker"));
    assert.ok(admin.length >= 5);
    for (const sprache of ["de", "en"]) {
      const dict = JSON.parse(src(`lib/i18n/${sprache}.json`));
      for (const key of talk) assert.equal(typeof dict.partnerTalk[key], "string", `${sprache}: partnerTalk.${key}`);
      for (const key of admin) assert.equal(typeof dict.adminPartner[key], "string", `${sprache}: adminPartner.${key}`);
      for (const key of ["speaker_has_access", "no_ops_contact", "contact_is_speaker"]) {
        assert.equal(typeof dict.rpc[key], "string", `${sprache}: rpc.${key}`);
      }
      // Die Gäste-Texte der Talk-Seite aus #206 sind weg.
      assert.equal(dict.partnerTalk.guestsTitle, undefined);
    }
  });
});
