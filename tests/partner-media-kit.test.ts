import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import {
  dateiGroesse,
  dateiTitel,
  GRAFIK_ERLAUBT,
  istBild,
  MEDIA_KIT_ERLAUBT,
} from "@/components/partner/media-kit";

const sql = () => migrationText("v6_media_kit");
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const json = (p: string) => JSON.parse(src(p)) as Record<string, Record<string, string>>;

function rumpf(name: string): string {
  const s = sql();
  const start = s.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `${name} fehlt`);
  return s.slice(start, s.indexOf("$$;", start));
}

describe("Media Kit (PART-041/ADM-023, Datenmodell)", () => {
  it("Media-Kit-Dateien sind Dateien der Edition; das Marketing pflegt nur diese Art", () => {
    const s = sql();
    assert.match(s, /\('edition_file_kind', 'media_kit', 'Media Kit', 'Media kit', 5, true\)/);
    const set = rumpf("set_edition_file");
    assert.match(set, /or \(is_marketing_team\(\) and v_kind = 'media_kit'\s+and \(v_id is null or exists \(select 1 from edition_file f where f\.id = v_id and f\.kind = 'media_kit'\)\)\)\) then/);
    // Die Prüfung steht vor jedem Schreiben.
    assert.ok(set.indexOf("raise exception 'not allowed'") < set.indexOf("insert into edition_file"));
    assert.match(rumpf("delete_edition_file"), /or \(is_marketing_team\(\) and exists \(select 1 from edition_file f where f\.id = p_id and f\.kind = 'media_kit'\)\)/);
    assert.match(rumpf("edition_files_admin"), /and \(is_staff\(\) or is_production_team\(\) or f\.kind = 'media_kit'\)/);
  });

  it("die Partnergrafik legt nur das Team an; der Partner liest sie", () => {
    const pfad = rumpf("partner_asset_path_allowed");
    assert.match(pfad, /if v_kind = 'partner_graphic' then\s+return case when p_write then \(is_marketing_team\(\) or is_partner_team\(\)\)\s+else \(is_partner_of\(v_org\) or is_marketing_team\(\) or is_partner_team\(\)\) end;/);
    assert.match(rumpf("register_partner_asset"), /if p_kind = 'partner_graphic' then raise exception 'not allowed' using errcode = '42501'; end if;/);
    const g = rumpf("set_partner_graphic");
    assert.match(g, /if not \(is_staff\(\) or is_marketing_team\(\) or is_partner_team\(\)\) then/);
    assert.match(g, /'\/partner_graphic\/%'/);
    assert.match(g, /o\.bucket_id = 'partner-assets' and o\.name = p_storage_path/);
    assert.match(g, /'accepted', v_me, now\(\), v_me/);
    assert.match(g, /perform log_audit\('partner\.graphic'/);
    assert.match(rumpf("partner_graphics_admin"), /if not \(is_staff\(\) or is_marketing_team\(\) or is_partner_team\(\)\) then/);
  });

  it("reine Ergänzungen bleiben Ergänzungen: nichts aus der Live-Fassung fällt weg", () => {
    for (const name of ["partner_asset_path_allowed", "register_partner_asset"]) {
      const neu = rumpf(name);
      const live = src(`supabase/snapshot/functions/${name}.sql`);
      for (const zeile of live.split("\n").map((z) => z.trim()).filter((z) => z && !z.startsWith("create or replace"))) {
        if (zeile.endsWith("$$;")) continue;
        assert.ok(neu.includes(zeile), `${name}: Zeile fehlt: ${zeile}`);
      }
    }
  });

  it("ZIP im Bucket edition-files, Rechte der neuen Funktionen, harden am Ende", () => {
    const s = sql();
    assert.match(s, /update storage\.buckets\s+set allowed_mime_types = /);
    assert.match(s, /array\['application\/zip'\]/);
    assert.match(s, /grant execute on function set_partner_graphic\(uuid, text, text, text, bigint, uuid\) to authenticated;/);
    assert.match(s, /grant execute on function partner_graphics_admin\(uuid\) to authenticated;/);
    assert.match(s.trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("Media Kit (PART-041/ADM-023, Oberfläche)", () => {
  it("Hilfen: Größe, Vorschau, Titel in der Sprache", () => {
    assert.equal(dateiGroesse(1_572_864, "de-DE"), "1,5 MB");
    assert.equal(dateiGroesse(2048, "de-DE"), "2 KB");
    assert.equal(dateiGroesse(10, "de-DE"), "1 KB");
    assert.equal(dateiGroesse(null, "de-DE"), null);
    assert.equal(istBild("image/png"), true);
    assert.equal(istBild("application/pdf"), false);
    assert.equal(istBild("application/zip"), false);
    const d = { label_de: "Logo-Paket", label_en: null, filename: "logos.zip" };
    assert.equal(dateiTitel(d, "en"), "Logo-Paket", "ohne Englisch der deutsche Titel");
    assert.equal(dateiTitel({ ...d, label_en: "Logo pack" }, "en"), "Logo pack");
    assert.equal(dateiTitel({ label_de: null, label_en: null, filename: "logos.zip" }, "de"), "logos.zip");
  });

  it("Browser, Routen und Datenbank nennen dieselben Formate", () => {
    const kit = src("app/api/admin/media-kit/route.ts");
    for (const typ of MEDIA_KIT_ERLAUBT) assert.ok(kit.includes(`"${typ}"`), `Media-Kit-Route: ${typ}`);
    const grafik = src("app/api/admin/partnergrafik/route.ts");
    for (const typ of GRAFIK_ERLAUBT) {
      assert.ok(grafik.includes(`"${typ}"`), `Grafik-Route: ${typ}`);
      assert.ok(rumpf("set_partner_graphic").includes(`'${typ}'`), `set_partner_graphic: ${typ}`);
    }
  });

  it("Routen: Gate, Rolle vor service_role, Partnergrafik über die Bucket-Policy", () => {
    const kit = src("app/api/admin/media-kit/route.ts");
    assert.match(kit, /await requireAdminSection\("graphics", "\/admin\/grafiken"\);/);
    assert.ok(kit.indexOf('rpc("is_marketing_team")') < kit.indexOf("createSupabaseAdminClient().storage"), "erst die Rolle, dann service_role");
    assert.match(kit, /kind: ART,/);
    assert.match(kit, /audience: \["partner"\]/);
    const grafik = src("app/api/admin/partnergrafik/route.ts");
    assert.match(grafik, /await requireAdminSection\("graphics", "\/admin\/grafiken"\);/);
    assert.doesNotMatch(grafik, /createSupabaseAdminClient/, "signiert mit der Sitzung, die Policy entscheidet");
    assert.match(grafik, /rpc\("set_partner_graphic"/);
  });

  it("Partnerseite liest das Media Kit der Edition und die eigene aktuelle Grafik, Admin pflegt beides", () => {
    const seite = src("app/(partner)/partner/media/page.tsx");
    assert.match(seite, /await requireArea\("partner", "\/partner\/media"\);/);
    assert.match(seite, /rpc\("edition_files", \{ p_audience: "partner", p_edition_id: current\.edition_id \}\)/);
    assert.match(seite, /\.filter\(\(d\) => d\.kind === "media_kit"\)/);
    assert.match(seite, /a\.kind === "partner_graphic" && a\.is_current/);
    assert.match(seite, /download \? \{ download \} : undefined/);
    const layout = src("app/(partner)/layout.tsx");
    assert.match(layout, /media: \{ href: "\/partner\/media", label: t\.partner\.navMedia \}/);
    const admin = src("app/(admin)/admin/grafiken/page.tsx");
    assert.match(admin, /<MediaKitAdmin/);
    assert.match(admin, /<PartnergrafikenAdmin/);
    assert.match(admin, /rpc\("partner_graphics_admin"/);
  });

  it("Texte in beiden Sprachen", () => {
    for (const sprache of ["de", "en"]) {
      const d = json(`lib/i18n/${sprache}.json`);
      assert.ok(d.partner.navMedia?.trim(), `${sprache}: partner.navMedia`);
      for (const k of ["title", "lead", "graphicTitle", "graphicLead", "graphicAlt", "graphicDownload", "graphicEmptyTitle", "graphicEmptyBody", "kitTitle", "kitLead", "kitDownload", "kitEmptyTitle", "kitEmptyBody"]) {
        assert.ok(d.partnerMedia[k]?.trim(), `${sprache}: partnerMedia.${k}`);
      }
      for (const k of ["mediaKitTitle", "mediaKitLead", "mediaKitUploaded", "partnerGraphicsTitle", "partnerGraphicsLead", "partnerGraphicsCount", "uploadFailedShort"]) {
        assert.ok(d.adminGrafiken[k]?.trim(), `${sprache}: adminGrafiken.${k}`);
      }
    }
  });
});
