import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const sql = () => migrationText("v6_tour_wuensche");
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

function rumpf(name: string): string {
  const s = sql();
  const start = s.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `${name} fehlt`);
  return s.slice(start, s.indexOf("$$;", start));
}

describe("Company Tour: Wünsche je Stopp (PART-092, Datenmodell)", () => {
  it("eigene Tabelle Stopp × Bewerbung, nur über Funktionen erreichbar", () => {
    const s = sql();
    assert.match(s, /create table company_tour_wish \(/);
    assert.match(s, /primary key \(stop_id, application_id\)/);
    assert.match(s, /references application \(id\) on delete cascade/);
    assert.match(s, /alter table company_tour_wish enable row level security;/);
    assert.match(s, /revoke all on company_tour_wish from anon, authenticated;/);
    assert.doesNotMatch(s, /create policy/);
    assert.match(s.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("Schreibweg: Recht des Stopps, nur mit Einwilligung, höchstens fünf unter Sperre, Audit", () => {
    const f = rumpf("partner_set_tour_wish");
    assert.match(f, /security definer/);
    assert.match(f, /set search_path = public, extensions/);
    assert.match(f, /from company_tour_stop where id = p_stop_id for update/);
    assert.match(f, /if v_st\.host_org_id is null or not partner_can_edit\(v_st\.host_org_id\) then/);
    assert.match(f, /v_app\.session_id is distinct from v_session/);
    assert.match(f, /if not v_app\.consent_share then raise exception 'application_not_shared'/);
    assert.match(f, /if v_n >= 5 then raise exception 'too_many_wishes'/);
    assert.match(f, /perform log_audit\(case when coalesce\(p_wish, false\) then 'partner\.tour_wish' else 'partner\.tour_wish_remove' end/);
    // Keine Entscheidung durch den Partner: der Status der Bewerbung bleibt unberührt.
    assert.doesNotMatch(f, /update application/);
  });

  it("Lesen: Kennzeichnung in der Partnerliste, Team-Sicht nur für das Team der Session", () => {
    assert.match(sql(), /drop function if exists partner_tour_applications\(uuid\);/);
    assert.match(rumpf("partner_tour_applications"), /profile jsonb, wished boolean\)/);
    assert.match(rumpf("tour_wishes_for_session"), /if not is_application_team\(p_session_id\) then raise exception 'not allowed'/);
  });
});

describe("Company Tour: Wünsche in der Oberfläche (PART-092)", () => {
  it("Partner markiert in der Bewerbungsliste des Stopps, mit Zähler und Obergrenze", () => {
    const liste = src("app/(partner)/partner/company-tour/TourBewerbungen.tsx");
    assert.match(liste, /export const MAX_WUENSCHE = 5;/);
    assert.match(liste, /setzen: setTourWish\.bind\(null, x\.stop_id\)/);
    assert.match(liste, /!nurTeilnehmende && canEdit/);
    const karte = src("components/partner/ApplicantList.tsx");
    // Ohne Einwilligung gibt es keinen Wunsch-Knopf.
    assert.match(karte, /\{wunsch && !hidden && \(/);
    assert.match(src("app/(partner)/partner/actions.ts"), /rpc\("partner_set_tour_wish"/);
  });

  it("das Team sieht die Wünsche in seiner Entscheidungssicht", () => {
    assert.match(src("app/(admin)/admin/bewerbungen/[id]/page.tsx"), /rpc\("tour_wishes_for_session", \{ p_session_id: id \}\)/);
    assert.match(src("app/(admin)/admin/bewerbungen/[id]/QueueView.tsx"), /wuensche\?\.\[row\.id\]/);
  });

  it("Texte in beiden Wörterbüchern", () => {
    for (const sprache of ["de", "en"]) {
      const dict = JSON.parse(src(`lib/i18n/${sprache}.json`));
      for (const key of ["wishCount", "wishLead"]) assert.equal(typeof dict.partnerTour[key], "string", `${sprache}: partnerTour.${key}`);
      for (const key of ["wishAdd", "wishRemove", "wishBadge", "wishAdded", "wishRemoved"]) {
        assert.equal(typeof dict.partnerApplicants[key], "string", `${sprache}: partnerApplicants.${key}`);
      }
      assert.equal(typeof dict.admin.applications.wishBadge, "string", `${sprache}: admin.applications.wishBadge`);
      for (const key of ["too_many_wishes", "application_not_shared"]) assert.equal(typeof dict.rpc[key], "string", `${sprache}: rpc.${key}`);
    }
  });
});
