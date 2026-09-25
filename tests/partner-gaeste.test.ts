import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { gastFehlt, gastFotoPfad } from "@/components/partner/gaeste";

const sql = () => migrationText("v6_standbuehnen_gaeste");
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Rumpf einer Funktion aus dem Migrationstext, bis zum nächsten `$$;`. */
function rumpf(name: string): string {
  const s = sql();
  const start = s.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `${name} fehlt`);
  return s.slice(start, s.indexOf("$$;", start));
}

describe("Standbühnen-Gäste: Datenmodell und Sperren (PART-081)", () => {
  it("der CHECK schließt jede Speaker-Leistung aus und verlangt Organisation und Einwilligung", () => {
    const s = sql();
    assert.match(s, /add column if not exists stage_guest boolean not null default false/);
    assert.match(s, /add column if not exists stage_guest_consent_at timestamptz/);
    const check = s.slice(s.indexOf("add constraint speaker_profile_stage_guest_chk"));
    for (const teil of ["not lounge_access", "not reception_eligible", "not travel_costs_covered",
      "hospitality_status = 'none'", "created_by_org_id is not null", "stage_guest_consent_at is not null"]) {
      assert.ok(check.slice(0, 400).includes(teil), teil);
    }
  });

  it("kein Hub-Zugang, kein Freiticket, kein Talk-Speaker", () => {
    assert.match(rumpf("invite_speaker"), /if v_sp\.stage_guest then raise exception 'stage_guest'/);
    assert.match(rumpf("upsert_speaker"), /returning id, stage_guest into v_id, v_guest;[\s\S]*if not v_guest then\s+insert into role_assignment/);
    assert.match(rumpf("speaker_ticket_create"), /if v_sp\.stage_guest then raise exception 'not_eligible'/);
    assert.match(rumpf("speaker_profile_tickets_sync"), /if not new\.stage_guest and speaker_is_confirmed\(new\.pipeline_status\)/);
    assert.match(rumpf("partner_add_speaker"), /raise exception 'stage_guest' using errcode = 'P0001'/);
    assert.match(rumpf("partner_speakers"), /and not sp\.stage_guest/);
  });

  it("Swapcard nur mit veröffentlichter Session am Slot — und QS-049 bleibt stehen", () => {
    const f = rumpf("event_app_speakers");
    assert.match(f, /not sp\.stage_guest or exists \(/);
    assert.match(f, /se\.slot_id is not null and se\.publish_status = 'published'/);
    // Aus dem aktuellen Snapshot (QS-049): „bestätigt“ ist der Pipeline-Status, nicht confirmed_at.
    assert.match(f, /where speaker_is_confirmed\(sp\.pipeline_status\)/);
  });

  it("das Porträt öffnet nur den Foto-Pfad eigener Gäste; can_manage_speaker bleibt unverändert", () => {
    assert.match(rumpf("speaker_asset_path_allowed"), /split_part\(p_name, '\/', 3\) = 'photo' and partner_manages_stage_guest\(v_profile\)/);
    assert.match(rumpf("register_speaker_asset"), /p_kind = 'photo' and partner_manages_stage_guest\(p_profile_id\)/);
    assert.doesNotMatch(sql(), /create or replace function can_manage_speaker\(/);
    assert.match(sql(), /revoke execute on function partner_manages_stage_guest\(uuid\) from public, anon, authenticated;/);
  });

  it("die Partner-RPCs prüfen Recht und Einwilligung und schreiben ins Audit", () => {
    const anlegen = rumpf("partner_add_stage_guest");
    assert.match(anlegen, /if not partner_can_edit\(p_org_id\)/);
    assert.match(anlegen, /raise exception 'stage_guest_consent_required'/);
    assert.match(anlegen, /raise exception 'already_speaker'/);
    assert.match(anlegen, /'confirmed', now\(\)/);
    const zuordnen = rumpf("partner_assign_stage_guest");
    // Standbühne mit dem Recht des Boards, Talk der Organisation mit dem Partner-Recht (PART-088).
    assert.match(zuordnen, /v_stage\.type = 'partner_booth'[\s\S]*can_edit_slot\(v_se\.slot_id\)/);
    assert.match(zuordnen, /v_se\.partner_org_id = v_sp\.created_by_org_id[\s\S]*partner_can_edit\(v_sp\.created_by_org_id\)/);
    for (const name of ["partner_add_stage_guest", "partner_update_stage_guest", "partner_remove_stage_guest", "partner_assign_stage_guest"]) {
      assert.match(rumpf(name), /log_audit\(/, name);
      assert.match(rumpf(name), /security definer/, name);
      assert.match(rumpf(name), /set search_path = public, extensions/, name);
    }
    assert.match(sql().trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("Standbühnen-Gäste in der Oberfläche (PART-081)", () => {
  it("Pflichtfelder wie die RPC, dazu Einwilligung", () => {
    const voll = { firstName: "Ada", lastName: "Muster", jobTitle: "CTO", organization: "Firma", email: "ada@firma.de", consent: true };
    assert.deepEqual(gastFehlt(voll), []);
    assert.deepEqual(gastFehlt({ ...voll, jobTitle: " ", email: "kein-at", consent: false }), ["jobTitle", "email", "consent"]);
    assert.equal(gastFotoPfad("ed", "pr", "bild.jpg", "id"), "ed/pr/photo/id-bild.jpg");
  });

  it("Partnerportal und Admin nutzen dieselbe Liste und denselben Kern, ohne service_role", () => {
    const kern = src("lib/partner/gaeste.ts");
    assert.match(kern, /rpc\("partner_add_stage_guest"/);
    assert.match(kern, /rpc\("partner_stage_guest_files"[\s\S]*storage\.from\(GAST_BUCKET\)\.remove[\s\S]*rpc\("partner_remove_stage_guest"/);
    // Der Kommentar nennt `service_role` ausdrücklich als nicht benutzt — geprüft wird die Verwendung.
    assert.doesNotMatch(kern, /createSupabaseAdminClient|SUPABASE_SECRET|secretKey/);
    assert.match(src("app/(partner)/partner/actions.ts"), /gastAnlegen\(await client\(\), input\)/);
    assert.match(src("app/(admin)/admin/partner/actions.ts"), /gastAnlegen\(await client\(\), input\)/);
    assert.match(src("app/(partner)/partner/buehne/gaeste/page.tsx"), /<Gaesteliste/);
    assert.match(src("app/(admin)/admin/partner/[org]/OrgDetail.tsx"), /<Gaesteliste/);
    assert.match(src("app/(partner)/partner/buehne/StandTabelle.tsx"), /assignStageGuest\(z\.session_id!, profileId, zuordnen\)/);
  });

  it("jeder Text der Gästeliste steht in beiden Wörterbüchern", () => {
    const code = src("components/partner/Gaesteliste.tsx");
    const benutzt = [...new Set([...code.matchAll(/\bt\.([a-zA-Z]+)/g)].map((m) => m[1]))];
    assert.ok(benutzt.length > 25, `nur ${benutzt.length} Schlüssel gefunden`);
    for (const sprache of ["de", "en"]) {
      const dict = JSON.parse(src(`lib/i18n/${sprache}.json`));
      for (const key of benutzt) assert.equal(typeof dict.partnerGuests[key], "string", `${sprache}: partnerGuests.${key}`);
      for (const key of ["stage_guest", "already_speaker", "stage_guest_consent_required"]) {
        assert.equal(typeof dict.rpc[key], "string", `${sprache}: rpc.${key}`);
      }
    }
  });
});

describe("Talk-Seite mit Gästen (PART-088, PART-089)", () => {
  const seite = () => src("app/(partner)/partner/talk/page.tsx");

  it("Speaker sind Gäste: Liste unten, Zuordnung am Talk, kein Einladen ins Speaker-Portal mehr", () => {
    assert.match(seite(), /rpc\("partner_stage_guests", args\)/);
    assert.match(seite(), /<Gaesteliste/);
    assert.match(seite(), /<TalkGaeste/);
    assert.doesNotMatch(seite(), /SpeakerHinzufuegen/);
    assert.doesNotMatch(src("app/(partner)/partner/actions.ts"), /export async function addTalkSpeaker/);
    assert.match(src("app/(partner)/partner/talk/TalkGaeste.tsx"), /assignStageGuest\(sessionId, profileId, zuordnen\)/);
  });

  it("Programmpunkte auf der Standbühne stehen nicht unter Talk", () => {
    assert.match(seite(), /from\("stage"\)\.select\("id, type"\)/);
    assert.match(seite(), /b\.type === "partner_booth"/);
    assert.match(seite(), /!\(x\.stage_id && standbuehnen\.has\(x\.stage_id\)\)/);
  });

  it("Tabelle und Talk nutzen dieselbe Zuordnung", () => {
    for (const datei of ["app/(partner)/partner/buehne/StandTabelle.tsx", "app/(partner)/partner/talk/TalkGaeste.tsx"]) {
      assert.match(src(datei), /<GastZuordnung/, datei);
    }
  });

  it("die neuen Texte der Talk-Seite stehen in beiden Wörterbüchern", () => {
    const benutzt = [...new Set([...seite().matchAll(/\bs\.([a-zA-Z]+)/g)].map((m) => m[1]))];
    for (const sprache of ["de", "en"]) {
      const block = JSON.parse(src(`lib/i18n/${sprache}.json`)).partnerTalk as Record<string, string>;
      for (const key of benutzt) assert.equal(typeof block[key], "string", `${sprache}: partnerTalk.${key}`);
      assert.doesNotMatch(block.lead, /Speaker-Portal/, `${sprache}: lead nennt kein Speaker-Portal mehr`);
    }
  });
});
