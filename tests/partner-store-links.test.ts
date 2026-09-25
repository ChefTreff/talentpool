import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const sql = () => migrationText("v6_portal_links");
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const json = (p: string) => JSON.parse(src(p)) as Record<string, Record<string, string>>;

function rumpf(name: string): string {
  const s = sql();
  const start = s.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `${name} fehlt`);
  return s.slice(start, s.indexOf("$$;", start));
}

describe("Links je Schlüssel (PART-072, Datenmodell)", () => {
  it("eigene Tabelle, nur über Funktionen erreichbar, nur https", () => {
    const s = sql();
    assert.match(s, /create table portal_link \(/);
    assert.match(s, /url text not null check \(url ~ '\^https:\/\/\[\^\[:space:\]\]\+\$' and length\(url\) <= 500\)/);
    assert.match(s, /alter table portal_link enable row level security;/);
    assert.match(s, /revoke all on portal_link from anon, authenticated;/);
    assert.doesNotMatch(s, /create policy/);
    assert.match(s, /create unique index portal_link_key_edition_uniq/);
    assert.match(s.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("lesen mit Zielgruppe wie bei den Videos, der Link der Edition vor dem allgemeinen", () => {
    const f = rumpf("portal_links_for");
    assert.match(f, /security definer/);
    assert.match(f, /set search_path = public, extensions/);
    assert.match(f, /if not \(my_kb_audiences\(\) && array\[p_audience\]\) then/);
    assert.match(f, /order by l\.key, l\.edition_id nulls last/);
  });

  it("pflegen nur das Team, jede Änderung im Audit, eigene Fehlerschlüssel", () => {
    for (const name of ["portal_links_admin", "upsert_portal_link", "delete_portal_link"]) {
      assert.match(rumpf(name), /if not is_staff\(\) then raise exception 'not allowed' using errcode = '42501'; end if;/, name);
    }
    const up = rumpf("upsert_portal_link");
    assert.match(up, /raise exception 'portal_link_url'/);
    assert.match(up, /raise exception 'portal_link_key'/);
    assert.match(up, /raise exception 'invalid_audience'/);
    assert.match(up, /perform log_audit\('portal_link\.upsert'/);
    assert.match(rumpf("delete_portal_link"), /perform log_audit\('portal_link\.delete'/);
  });

  it("die beiden Store-Links als Startwerte für alle Zielgruppen", () => {
    const s = sql();
    const teil = s.slice(s.indexOf("insert into portal_link (key, title_de, title_en, url, audience, sort_order) values"));
    assert.equal((teil.match(/array\['partner','speaker','talent','volunteer','hackathon'\]/g) ?? []).length, 2);
    assert.match(teil, /on conflict do nothing;/);
  });
});

describe("Links je Schlüssel (PART-072, Oberfläche)", () => {
  it("Partner-Portal und Teilnehmer-Programm lesen dieselben Store-Links, nie mehr die Konstante", () => {
    const partner = src("app/(partner)/partner/event-app/page.tsx");
    assert.match(partner, /loadStoreLinks\("partner", current\.edition_id\)/);
    assert.match(partner, /\{storeLinks\.appStore && \(/);
    const talent = src("app/(talent)/programm/page.tsx");
    assert.match(talent, /loadStoreLinks\("talent"\)/);
    assert.doesNotMatch(talent, /EVENT_APP_STORE_LINKS/);
    const quelle = src("lib/event-app/store-links.ts");
    assert.doesNotMatch(quelle, /https:\/\//, "keine Adresse mehr im Code");
    const lader = src("lib/event-app/load-store-links.ts");
    assert.match(lader, /import "server-only";/);
    assert.match(lader, /rpc\("portal_links_for"/);
  });

  it("Pflege im Admin unter Videos mit derselben Maske", () => {
    const seite = src("app/(admin)/admin/videos/page.tsx");
    assert.match(seite, /rpc\("portal_links_admin"\)/);
    assert.match(seite, /save=\{saveLink\}/);
    assert.match(seite, /remove=\{removeLink\}/);
    assert.match(seite, /idPrefix="l"/);
    const maske = src("app/(admin)/admin/videos/VideoAdmin.tsx");
    assert.match(maske, /save = saveVideo, remove = removeVideo, idPrefix = "v"/, "Videos bleiben, wie sie waren");
    const aktionen = src("app/(admin)/admin/videos/actions.ts");
    assert.match(aktionen, /ruf\("upsert_portal_link", \{ p_data: data \}\)/);
    assert.match(aktionen, /ruf\("delete_portal_link", \{ p_id: id \}\)/);
    assert.match(aktionen, /await requireAdminSection\("videos"\);/);
  });

  it("Texte in beiden Sprachen", () => {
    for (const sprache of ["de", "en"]) {
      const d = json(`lib/i18n/${sprache}.json`);
      for (const k of ["linksTitle", "linksLead", "linkAdd", "linkEmpty", "linkEmptyBody", "linkKeyHint", "linkUrl", "linkUrlHint"]) {
        assert.ok(d.videos[k]?.trim(), `${sprache}: videos.${k}`);
      }
      assert.ok(d.partnerEventApp.storeLabel?.trim(), `${sprache}: partnerEventApp.storeLabel`);
    }
  });
});
