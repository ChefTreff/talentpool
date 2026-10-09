import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

type Eintrag = { slug: string; title: string; body: string };

/** Die Einträge des `values`-Blocks der Migration: `($kb$slug$kb$, $kb$Titel$kb$, $kb$Text$kb$)`. */
function eintraege(): Eintrag[] {
  const sql = migrationText("v6_wiki_en_entwuerfe");
  return [...sql.matchAll(/\(\$kb\$([\s\S]*?)\$kb\$,\s*\$kb\$([\s\S]*?)\$kb\$,\s*\$kb\$([\s\S]*?)\$kb\$\)/g)].map((m) => ({
    slug: m[1], title: m[2], body: m[3],
  }));
}

/** Häufige deutsche Funktionswörter — ein englischer Text enthält so gut wie keine. */
const DEUTSCH = /\b(und|der|die|das|nicht|ihr|eure|euer|euch|für|wir|bitte|oder|wird|werden|sind|ist|mit|auf|dem|den|ein|eine|einen|sie|zum|zur|bei|nach|auch|wenn)\b/gi;

describe("Wiki: englische Entwürfe (ADM-103 Bau B)", () => {
  const alle = eintraege();

  it("alle 32 Artikel sind da, jeder Slug einmal, mit Titel und Text", () => {
    assert.equal(alle.length, 32);
    assert.equal(new Set(alle.map((e) => e.slug)).size, 32, "doppelter Slug");
    for (const e of alle) {
      assert.ok(/^[a-z0-9-]+$/.test(e.slug), e.slug);
      assert.ok(e.title.trim().length > 2, `${e.slug}: Titel`);
      assert.ok(e.body.trim().length > 300, `${e.slug}: Text`);
    }
  });

  it("die Titel sind eindeutig, damit Querverweise („siehe …“) genau einen Artikel meinen", () => {
    const titel = alle.map((e) => e.title);
    assert.equal(new Set(titel).size, titel.length, "doppelter Titel");
  });

  it("die Texte sind englisch: kaum deutsche Funktionswörter, keine deutschen Anführungszeichen, keine Platzhalter des Deutschen", () => {
    for (const e of alle) {
      const treffer = `${e.title} ${e.body.replace(/https?:\/\/\S+/g, "")}`.match(DEUTSCH) ?? [];
      // Eigennamen und Beispiele (Hamburg-Straßennamen, „German Mut statt German Angst“) dürfen vereinzelt vorkommen.
      assert.ok(treffer.length <= 3, `${e.slug}: sieht deutsch aus (${treffer.slice(0, 6).join(", ")})`);
      assert.ok(!/„|“\s*$/m.test(e.body.replace(/“[^”\n]*”/g, "")) , `${e.slug}: deutsche Anführungszeichen`);
      assert.ok(!/Für 2027 noch nicht final|Wir ergänzen die Angaben/.test(e.body), `${e.slug}: deutscher Hinweis`);
    }
  });

  it("der Hinweiskasten „noch nicht final“ steht übersetzt in den Artikeln, in denen er steht", () => {
    const mit = alle.filter((e) => e.body.startsWith("> **Not final for 2027:**"));
    assert.ok(mit.length >= 20, `nur ${mit.length}`);
    for (const e of mit) assert.match(e.body, /binding deadlines always also appear in your task list in the portal/, e.slug);
  });

  it("die Begriffe des Portals sind einheitlich (Trade fair shop, backdrop, Partner Portal, task list)", () => {
    const text = alle.map((e) => e.body).join("\n");
    assert.ok(!/Messeshop|Rückwand|Aufgabenliste|Partner-Portal/.test(text), "deutsche Begriffe geblieben");
    assert.ok(!/\bexpo shop\b|\btrade-show shop\b/i.test(text), "abweichende Schreibweise des Shops");
    assert.ok(/trade fair shop/i.test(text) && /backdrop/i.test(text) && /Partner Portal/.test(text) && /task list/.test(text));
  });

  it("die Migration legt Entwürfe an (archivierte bleiben archiviert), ändert nichts Vorhandenes und protokolliert", () => {
    const sql = migrationText("v6_wiki_en_entwuerfe");
    assert.match(sql, /case when d\.status = 'archived' then 'archived' else 'draft' end/);
    assert.ok(!/'published'/.test(sql.replace(/^\s*--.*$/gm, "")), "keine Zeile entsteht veröffentlicht");
    assert.match(sql, /on conflict do nothing/);
    assert.match(sql, /where d\.language = 'de' and d\.edition_id is null/);
    assert.match(sql, /log_audit\('kb\.en_drafts_seeded'/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
    for (const l of ["de", "en"]) {
      const d = JSON.parse(lies(`lib/i18n/${l}.json`)) as { auditAction: Record<string, string> };
      assert.ok(d.auditAction["kb.en_drafts_seeded"], l);
    }
  });
});
