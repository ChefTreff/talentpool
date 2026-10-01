import assert from "node:assert/strict";
import test from "node:test";
import { leseQuellen, parseQuelle, ZIELGRUPPEN, PHASEN } from "@/scripts/wiki-quelle.mjs";
import { KB_AUDIENCES, KB_PHASES } from "@/components/wiki/types";
import { migrationText } from "@/tests/migration-datei";

const ORDNER = "content/wiki";
const artikel = leseQuellen(ORDNER);

/**
 * Die Quelldateien der Wissensbasis (ADM-008).
 *
 * Die Artikel stammen aus dem Wiki des Vorjahres. Sie werden **veröffentlicht**
 * importiert, bevor Konrad sie live durchsieht — deshalb prüft dieser Test
 * nicht, ob der Import läuft, sondern ob etwas aus dem Vorjahr stehen geblieben
 * ist, das Partnern und Speakern eine falsche Tatsache erzählen würde: eine
 * Jahreszahl, ein Link in ein System, auf das sie keinen Zugriff haben, oder
 * eine Notion-Datei mit abgelaufener Signatur.
 */

test("jede Quelldatei lässt sich lesen und hat eine Kategorie", () => {
  assert.ok(artikel.length >= 26, `nur ${artikel.length} Artikel gefunden`);
  for (const a of artikel) {
    assert.ok(a.zielgruppe.length > 0, `${a.datei}: keine Zielgruppe`);
    assert.ok(a.titel.length > 2, `${a.datei}: Titel zu kurz`);
    assert.ok(a.rumpf.length > 200, `${a.datei}: Text zu kurz (${a.rumpf.length})`);
    assert.ok(a.quelle, `${a.datei}: Herkunft fehlt im Kopf`);
  }
});

test("Vokabular im Importskript deckt sich mit der Oberfläche", () => {
  // Das Skript ist .mjs und kann die TS-Konstanten nicht laden; die Liste steht
  // deshalb zweimal. Driftet sie, ist der Import still großzügiger als der Editor.
  assert.deepEqual([...ZIELGRUPPEN].sort(), [...KB_AUDIENCES].sort());
  assert.deepEqual([...PHASEN].sort(), [...KB_PHASES].sort());
});

test("kein Jahr und keine Edition des Vorjahres im Text", () => {
  for (const a of artikel) {
    for (const muster of [/FLS\s?26/i, /\b2026\b/]) {
      const treffer = muster.exec(a.rumpf);
      assert.equal(treffer, null, `${a.datei}: „${treffer?.[0]}" steht noch im Text`);
    }
  }
});

test("keine Links in Systeme, die den Lesenden nicht offenstehen", () => {
  // Notion-Dateien tragen eine ablaufende Signatur, Airtable-Formulare und die
  // Drive-Ordner des Vorjahres sind für Partner nicht freigegeben, und der alte
  // Messeshop unter partner.chef-treff.de ist durch das Portal ersetzt.
  const verboten = [
    "notion.so",
    "notion.com",
    "airtable.com",
    "drive.google.com",
    "loom.com",
    "prod-files-secure.s3",
    "partner.chef-treff.de",
    "vivenu.chef-treff.de",
    "fls26-programm",
  ];
  for (const a of artikel) {
    for (const nadel of verboten) {
      assert.ok(!a.rumpf.includes(nadel), `${a.datei}: Link auf ${nadel}`);
    }
  }
});

test("offene Punkte stehen sichtbar im Artikel, nicht nur im Kopf", () => {
  const mitOffenen = artikel.filter((a) => a.pruefen.length > 0);
  assert.ok(mitOffenen.length > 0, "kein Artikel mit offenen Punkten — Kopf vermutlich nicht gelesen");
  for (const a of mitOffenen) {
    assert.ok(a.koerper.startsWith("> **Für 2027 noch nicht final:**"), `${a.datei}: Hinweis fehlt im Text`);
    for (const p of a.pruefen) {
      assert.ok(a.koerper.includes(p), `${a.datei}: offener Punkt „${p}" taucht im Artikel nicht auf`);
    }
  }
  // Gegenprobe: ein Artikel ohne offene Punkte bekommt keinen Hinweis.
  const ohne = parseQuelle(
    ["---", "slug: zztest", "titel: ZZTEST", "zielgruppe: partner", "---", "Nur Text."].join("\n"),
    "zztest.md",
  );
  assert.equal(ohne.koerper, "Nur Text.");
});

test("fehlende Kategorie bricht den Import ab", () => {
  const ohne = ["---", "slug: zztest", "titel: ZZTEST", "---", "Text."].join("\n");
  assert.throws(() => parseQuelle(ohne, "zztest.md"), /zielgruppe ist Pflicht/);
  const falsch = ["---", "slug: zztest", "titel: ZZTEST", "zielgruppe: vertrieb", "---", "Text."].join("\n");
  assert.throws(() => parseQuelle(falsch, "zztest.md"), /unbekannte zielgruppe/);
});

test("die Pflichtkategorie hängt an der Tabelle, nicht nur am Skript", () => {
  // Der Import schreibt als Admin-Client an `upsert_kb_article` vorbei. Ohne
  // diesen Prüfsatz wäre „Kategorie ist Pflicht" eine Zusage des Skripts.
  const sql = migrationText("v4_wissensbasis");
  assert.match(sql, /kb_article_audience_chk\s+check\s*\(\s*cardinality\(audience\)\s*>\s*0\s*\)/i);
});
