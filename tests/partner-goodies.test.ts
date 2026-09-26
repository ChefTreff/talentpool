import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const sql = () => migrationText("v6_masterclass_goodies");
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const json = (p: string) => JSON.parse(src(p)) as Record<string, Record<string, string>>;

function rumpf(name: string): string {
  const s = sql();
  const start = s.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `${name} fehlt`);
  return s.slice(start, s.indexOf("$$;", start));
}

describe("Masterclass: Goodies (PART-054, Datenmodell)", () => {
  it("der Schlüssel goodies_planned ist nur für die Masterclass erlaubt", () => {
    const f = rumpf("format_detail_keys");
    assert.match(f, /when 'masterclass' then array\['goodies_planned'\]/);
    // Die übrigen Formate bleiben, wie sie live sind.
    const live = src("supabase/snapshot/functions/format_detail_keys.sql");
    for (const zeile of ["when 'side_event' then array['location_text', 'image_asset_id']", "'target_profile', 'interview_mode']"]) {
      assert.ok(live.includes(zeile) && f.includes(zeile), zeile);
    }
  });

  it("nur ja oder nein; null heißt keine Angabe; alles andere 22023", () => {
    const f = rumpf("check_format_details");
    assert.match(f, /if jsonb_typeof\(p_details->'goodies_planned'\) not in \('boolean', 'null'\) then\s+raise exception 'invalid_format_details' using errcode = '22023', detail = 'goodies_planned';/);
    assert.match(f, /jsonb_build_object\('goodies_planned', \(p_details->'goodies_planned'\)::boolean\)/);
    assert.match(f, /security definer/i);
    assert.match(f, /SET search_path TO 'public', 'extensions'/);
  });

  it("aus der Live-Fassung: nichts fällt weg", () => {
    // Jede Zeile der Live-Fassung steht auch im Vorschlag (fn-diff zeigt nur Ergänzungen).
    for (const name of ["format_detail_keys", "check_format_details"]) {
      const neu = rumpf(name);
      const live = src(`supabase/snapshot/functions/${name}.sql`);
      for (const zeile of live.split("\n").map((z) => z.trim()).filter((z) => z && !z.startsWith("create or replace"))) {
        // Das Ende (`$$;`, `end $$;`) schneidet `rumpf` ab.
        if (zeile.endsWith("$$;")) continue;
        assert.ok(neu.includes(zeile), `${name}: Zeile fehlt: ${zeile}`);
      }
    }
    assert.match(sql().trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("Masterclass: Goodies (PART-054, Oberfläche)", () => {
  it("Portal und Admin nutzen dieselbe Maske, gespeichert über partner_update_session", () => {
    const seite = src("app/(partner)/partner/masterclass/page.tsx");
    assert.match(seite, /<GoodiesFrage/);
    assert.match(seite, /save=\{updateFormatDetails\.bind\(null, x\.id\)\}/);
    assert.match(seite, /const WIKI_ANLIEFERUNG = "\/partner\/wiki#anlieferung-aufbau";/);
    const admin = src("app/(admin)/admin/partner/[org]/OrgDetail.tsx");
    assert.match(admin, /<GoodiesFrage/);
    assert.match(admin, /save=\{\(details\) => adminUpdateFormatDetails\(x\.id, details\)\}/);
    const partnerActions = src("app/(partner)/partner/actions.ts");
    assert.match(partnerActions, /export async function updateFormatDetails\(\s*sessionId: string,\s*details: Record<string, unknown>,/);
    const adminActions = src("app/(admin)/admin/partner/actions.ts");
    const teil = adminActions.slice(adminActions.indexOf("export async function adminUpdateFormatDetails"));
    assert.match(teil, /const supabase = await client\(\);/, "Admin-Gate über client()");
    assert.match(teil, /rpc\("partner_update_session"/);
  });

  it("die Maske gibt die übrigen Angaben mit und zeigt Fehler an der Stelle", () => {
    const m = src("components/partner/GoodiesFrage.tsx");
    assert.match(m, /save\(\{ \.\.\.\(details \?\? \{\}\), goodies_planned: neu \}\)/);
    assert.match(m, /setAuswahl\(vorher\);/, "bei Fehler zurück auf den alten Stand");
    assert.match(m, /role="alert"/);
    assert.match(m, /min-h-11/, "Ziel mindestens 44 px");
    assert.doesNotMatch(m, /toast\("error"/, "Fehler nicht als Toast");
  });

  it("Texte in beiden Sprachen", () => {
    for (const sprache of ["de", "en"]) {
      const d = json(`lib/i18n/${sprache}.json`);
      for (const k of ["goodiesTitle", "goodiesLead", "goodiesQuestion", "goodiesYes", "goodiesNo", "goodiesNone", "goodiesHintYes", "goodiesWiki", "goodiesSaved"]) {
        assert.ok(d.partnerMasterclass[k]?.trim(), `${sprache}: partnerMasterclass.${k}`);
      }
      assert.ok(d.adminPartner.goodiesTitle?.trim() && d.adminPartner.goodiesLead?.trim(), `${sprache}: adminPartner.goodies*`);
    }
  });
});
