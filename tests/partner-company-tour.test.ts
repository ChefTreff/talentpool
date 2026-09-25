import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { profilUmschalten } from "@/components/partner/profil";
import { HINWEISE_MAX, tourAenderungen, tourEntwurf, type TourStopp } from "@/components/partner/tour";

const sql = () => migrationText("v6_tour_bewerbungen_partner");
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const zeile: TourStopp = {
  stop_id: "s1", tour_id: "t1", tour_name: "TEST — Company Tour", track: "ZZTEST", meeting_point: "CCH",
  tour_starts_at: null, tour_ends_at: null, sort_order: 1, arrival_at: null, departure_at: null,
  address: "Testweg 1", contact_name: null, contact_email: null, contact_phone: null, time_note: null,
  snacks: null, notes_public: null, target_profile: {}, photos_allowed: true, filled_at: null,
  lead_name: null, lead_role_de: null, lead_role_en: null, lead_email: null, lead_phone: null, lead_photo_path: null,
};

describe("Company Tour: Bewerbungen für den Partner (PART-046, Datenmodell)", () => {
  it("nur lesen, Recht wie bei den eigenen Formaten, Personenbezug nur mit Einwilligung, Abruf im Audit", () => {
    const s = sql();
    const f = s.slice(s.indexOf("create or replace function partner_tour_applications("), s.indexOf("$$;"));
    assert.match(f, /security definer/);
    assert.match(f, /set search_path = public, extensions/);
    assert.match(f, /if v_st\.host_org_id is null or not partner_can_edit\(v_st\.host_org_id\) then/);
    assert.match(f, /case when a\.consent_share then a\.person_id end/);
    assert.match(f, /case when a\.consent_share then \(\s*select coalesce\(jsonb_agg/);
    assert.match(f, /perform log_audit\('application\.partner_view', 'session', v_session::text/);
    assert.match(f, /'tour', true/);
    // Keine Entscheidung: die Funktion schreibt nichts ausser dem Audit.
    assert.doesNotMatch(f, /update application|insert into application/);
    assert.match(s, /grant execute on function partner_tour_applications\(uuid\) to authenticated;/);
    assert.match(s.trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("Company Tour im Partner-Portal (PART-046)", () => {
  it("Seite im Menü, drei Reiter, Stopp und Bewerbungen über die RPCs", () => {
    assert.match(src("app/(partner)/layout.tsx"), /company_tour: \{ href: "\/partner\/company-tour"/);
    const tabs = src("app/(partner)/partner/company-tour/TourTabs.tsx");
    for (const pfad of ["`${BASE}/bewerbungen`", "`${BASE}/teilnehmende`"]) assert.ok(tabs.includes(pfad), pfad);
    assert.match(src("app/(partner)/partner/company-tour/daten.ts"), /rpc\("partner_company_tour", args\)/);
    assert.match(src("app/(partner)/partner/company-tour/TourBewerbungen.tsx"), /rpc\("partner_tour_applications", \{ p_stop_id: x\.stop_id \}\)/);
    assert.match(src("app/(partner)/partner/actions.ts"), /rpc\("partner_update_tour_stop", \{ p_stop_id: stopId, p_fields: fields \}\)/);
  });

  it("die Bewerbungsliste der Tour hat keine Entscheidungsknöpfe", () => {
    assert.doesNotMatch(src("app/(partner)/partner/company-tour/TourBewerbungen.tsx"), /decide=/);
    assert.match(src("components/partner/ApplicantList.tsx"), /\{decide && \(/);
    // Die Bewerberseite entscheidet weiter — mit der Aktion, nicht mit einem Schalter.
    assert.match(src("app/(partner)/partner/bewerber/[id]/page.tsx"), /decide=\{canEditOnboarding\([^)]*\)[^?]*\? decideApplication : undefined\}/);
  });

  it("gespeichert wird nur, was sich geändert hat; offene Ja/Nein-Fragen bleiben offen", () => {
    const vorher = tourEntwurf(zeile);
    assert.deepEqual(tourAenderungen(vorher, vorher), {});
    const jetzt = { ...vorher, contact_name: "  Ada  ", snacks: null, photos_allowed: false };
    assert.deepEqual(tourAenderungen(vorher, jetzt), { contact_name: "Ada", photos_allowed: false });
    assert.deepEqual(tourAenderungen(vorher, { ...vorher, snacks: true }), { snacks: true });
    assert.equal(HINWEISE_MAX, 1000);
    // Dieselbe Grenze wie in der RPC (Live-Fassung aus dem Snapshot).
    assert.match(src("supabase/snapshot/functions/partner_update_tour_stop.sql"), /length\(coalesce\(p_fields->>'notes_public', ''\)\) > 1000/);
  });

  it("gesuchte Profile: dieselbe Auswahl wie bei den Interview Tables, leere Felder fallen weg", () => {
    assert.deepEqual(profilUmschalten({}, "career_level", "junior"), { career_level: ["junior"] });
    assert.deepEqual(profilUmschalten({ career_level: ["junior"] }, "career_level", "junior"), {});
    assert.match(src("app/(partner)/partner/interview-tables/TischeView.tsx"), /<ProfilAuswahl/);
    assert.match(src("components/partner/TourStopp.tsx"), /<ProfilAuswahl/);
  });

  it("Admin-Weg: dieselbe Maske unter der Organisation, über dieselbe RPC", () => {
    assert.match(src("app/(admin)/admin/partner/[org]/page.tsx"), /rpc\("partner_company_tour", \{ p_org_id: org \}\)/);
    assert.match(src("app/(admin)/admin/partner/[org]/OrgDetail.tsx"), /save=\{adminUpdateTourStop\}/);
    assert.match(src("app/(admin)/admin/partner/actions.ts"), /export async function adminUpdateTourStop[\s\S]*rpc\("partner_update_tour_stop"/);
  });

  it("alle benutzten Texte stehen in beiden Wörterbüchern", () => {
    const benutzt = (text: string, praefix: string) =>
      [...new Set([...text.matchAll(new RegExp(`\\b${praefix}\\.([a-zA-Z_]+)`, "g"))].map((m) => m[1]))];
    const tour = [
      ...benutzt(src("components/partner/TourStopp.tsx"), "t"),
      ...benutzt(src("app/(partner)/partner/company-tour/page.tsx"), "s"),
      ...benutzt(src("app/(partner)/partner/company-tour/TourKopf.tsx"), "t"),
      ...benutzt(src("app/(partner)/partner/company-tour/TourBewerbungen.tsx"), "s"),
      "profile_occupation_status", "profile_career_level", "profile_study_field", "profileTitle", "profileHint",
    ];
    for (const sprache of ["de", "en"]) {
      const dict = JSON.parse(src(`lib/i18n/${sprache}.json`));
      for (const key of tour) assert.equal(typeof dict.partnerTour[key], "string", `${sprache}: partnerTour.${key}`);
      assert.equal(typeof dict.partner.navCompanyTour, "string", `${sprache}: partner.navCompanyTour`);
      for (const key of ["tourStopLead", "tourToAdmin"]) assert.equal(typeof dict.adminPartner[key], "string", `${sprache}: adminPartner.${key}`);
    }
  });
});
