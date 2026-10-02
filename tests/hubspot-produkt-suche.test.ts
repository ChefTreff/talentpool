import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SUCHE_MAX, findeNachArtikelnummer } from "@/lib/hubspot/produkt-suche";

const zeile = (id: string, name: string, sku: string | null) => ({ id, name, sku });
const katalog = [
  zeile("1", "Messestand Standard", "I-10729"),
  zeile("2", "Messestand Premium", "I-10730"),
  zeile("3", "Altes Paket I-10729 (FLS26)", null),
  zeile("4", "Company Tour", "CT-1"),
];

describe("Archiv-Karte: Suche nach Artikelnummer (K-47)", () => {
  it("findet die Nummer ohne Rücksicht auf Schreibweise und Trennzeichen", () => {
    for (const q of ["I-10729", "i-10729", "I10729", " i 10729 "]) {
      assert.deepEqual(findeNachArtikelnummer(katalog, q).map((p) => p.id), ["1", "3"], q);
    }
  });

  it("stellt Treffer in der Nummer vor Treffer im Namen", () => {
    const r = findeNachArtikelnummer(katalog, "I-10729");
    assert.equal(r[0].id, "1");
    assert.equal(r[1].id, "3");
  });

  it("liefert bei zu kurzer, leerer oder fremder Anfrage nichts", () => {
    assert.deepEqual(findeNachArtikelnummer(katalog, "I"), []);
    assert.deepEqual(findeNachArtikelnummer(katalog, "--"), []);
    assert.deepEqual(findeNachArtikelnummer(katalog, ""), []);
    assert.deepEqual(findeNachArtikelnummer(katalog, undefined), []);
    assert.deepEqual(findeNachArtikelnummer(katalog, 10729), []);
    assert.deepEqual(findeNachArtikelnummer(katalog, "Z-99999"), []);
  });

  it("trifft nicht, was nur ähnlich beginnt (I-10730 ist nicht I-10729)", () => {
    assert.ok(!findeNachArtikelnummer(katalog, "I-10729").some((p) => p.id === "2"));
  });

  it("begrenzt die Trefferzahl", () => {
    const viele = Array.from({ length: 80 }, (_, i) => zeile(String(i), `Paket ${i}`, `X-${1000 + i}`));
    assert.equal(findeNachArtikelnummer(viele, "X-10").length, SUCHE_MAX);
  });
});

describe("Archiv-Route: Sicherheitszusagen bleiben", () => {
  const route = readFileSync(new URL("../app/api/admin/hubspot/archive-products/route.ts", import.meta.url), "utf8");

  it("archiviert nur Ids, die der Server selbst (Altbestand oder Treffer derselben Anfrage) gefunden hat", () => {
    assert.match(route, /findeNachArtikelnummer\(alle, body\.sku\)/);
    assert.match(route, /new Set\(\[\.\.\.ohneSku, \.\.\.treffer\]\.map/);
    assert.match(route, /gewaehlt\.filter\(\(id\) => bekannt\.has\(id\)\)/);
  });

  it("schreibt weiter nur bei ausdrücklichem dryRun:false", () => {
    assert.match(route, /istTrockenlauf\(body\)/);
    assert.match(route, /!dryRun && zuArchivieren\.length > 0/);
  });

  it("Audit trägt keine E-Mail-Adresse im Klartext", () => {
    assert.ok(!/\.email/.test(route), "kein Zugriff auf .email in der Route");
  });
});
