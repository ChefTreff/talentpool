import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/**
 * PART-098 (Konrad 05.10.): die drei Einstiege der Partner-Übersicht heißen Tickets, Event-App, Messeshop — ohne
 * zweite Überschrift darunter — und die Knöpfe stehen auf einer Linie. Das Layout selbst belegt der Browser
 * (Knopfhöhen mit verschieden langen Texten, vorher 344/304/304, jetzt 344/344/344); hier steht, was der Quelltext
 * festhält, damit es nicht still zurückkehrt.
 */
describe("PART-098: Einstiege der Partner-Übersicht", () => {
  const seite = src("app/(partner)/partner/page.tsx");
  const karte = src("components/ui/PhotoCard.tsx");

  it("die Überschrift der Karte ist der Name des Bereichs: Tickets, Event-App, Messeshop — mit den Rückfällen Kontakte und Wiki", () => {
    const block = seite.slice(seite.indexOf("const einstiege = ["), seite.indexOf("return (\n    <>"));
    for (const name of ["t.partnerTickets.title", "t.partnerEventApp.title", "t.partnerShop.title", "t.partnerContacts.title", "t.partner.navWiki"]) {
      assert.ok(block.includes(`name: ${name},`), name);
    }
    // Die Stichwörter über den Namen sind weg: sie stehen weiter an den Seitenköpfen, nicht mehr an den Karten.
    for (const wort of ["wordAccess", "wordVisibility", "wordEquipment", "wordTeam"]) assert.ok(!block.includes(wort), wort);
  });

  it("die Karte bekommt den Namen als Überschrift und keine zweite darunter", () => {
    const aufruf = seite.slice(seite.indexOf("<PhotoCard"), seite.indexOf("/>", seite.indexOf("<PhotoCard")));
    assert.match(aufruf, /word=\{e\.name\}/);
    assert.doesNotMatch(aufruf, /\btitle=/);
  });

  it("die Texte der Seitenköpfe bleiben: die Stichwörter gibt es weiter im Wörterbuch (DE und EN)", () => {
    for (const sprache of ["de", "en"]) {
      const p = JSON.parse(src(`lib/i18n/${sprache}.json`)).partner;
      for (const k of ["wordAccess", "wordVisibility", "wordEquipment", "wordTeam"]) assert.ok(p[k], `${sprache}: ${k}`);
    }
  });

  it("die Aktion sitzt am Boden der Karte: Textspalte als Spalte, Aktion mit `mt-auto`", () => {
    assert.match(karte, /<div className="flex min-w-0 flex-1 flex-col">/);
    assert.match(karte, /\{action && <div className="mt-auto pt-3">\{action\}<\/div>\}/);
    // Ohne Streckung bleibt es beim bisherigen Abstand von 12 px: `pt-3` ersetzt das frühere `mt-3`.
    assert.doesNotMatch(karte, /<div className="mt-3">\{action\}<\/div>/);
  });

  it("die Karte steht in einem Raster gleich hoher Karten — die Seite streckt sie nicht von Hand", () => {
    assert.match(seite, /<div className="mb-10 grid gap-6 sm:grid-cols-3">/);
    assert.doesNotMatch(seite.slice(seite.indexOf("<PhotoCard"), seite.indexOf("/>", seite.indexOf("<PhotoCard"))), /className=/);
  });
});
