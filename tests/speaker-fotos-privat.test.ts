import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { speakerPhotoPath, veralteteFotoKopien } from "@/lib/event-app/mapping";

/**
 * SPK-047 (Security-Check F2): der Bucket der Speaker-Fotokopien ist privat,
 * Swapcard bekommt signierte Adressen mit sieben Tagen Laufzeit, und jeder
 * Echtlauf räumt Kopien weg, die zu keinem Speaker in der App mehr gehören.
 */
const sql = () => migrationText("v6_speaker_fotos_privat");
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("SPK-047: Datenbank", () => {
  it("stellt genau den einen Bucket auf privat", () => {
    assert.match(sql(), /update storage\.buckets set public = false where id = 'speaker-photos';/);
    assert.equal((sql().match(/update storage\.buckets/g) ?? []).length, 1);
    assert.match(sql().trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("SPK-047: Pfad und Aufräumen", () => {
  const zeile = { edition_slug: "fls27", photo_asset_id: "a1", photo_mime: "image/JPEG" };

  it("der Pfad nennt weder Namen noch Person", () => {
    assert.equal(speakerPhotoPath(zeile), "fls27/a1.jpg");
    assert.equal(speakerPhotoPath({ ...zeile, photo_mime: "image/gif" }), null);
    assert.equal(speakerPhotoPath({ ...zeile, photo_asset_id: null }), null);
  });

  it("veraltet ist, was dieser Lauf nicht schickt", () => {
    const behalten = new Set(["fls27/a1.jpg"]);
    assert.deepEqual(
      veralteteFotoKopien(["fls27/a1.jpg", "fls27/alt.png", "fls27/abgesagt.webp"], behalten),
      ["fls27/alt.png", "fls27/abgesagt.webp"],
    );
    assert.deepEqual(veralteteFotoKopien([], behalten), []);
  });
});

describe("SPK-047: Export", () => {
  it("die Fotokopie bekommt eine signierte Adresse mit sieben Tagen, keine öffentliche", () => {
    const l = quelle("lib/event-app/logos.ts");
    const foto = l.slice(l.indexOf("export const PHOTO_BUCKET"));
    assert.doesNotMatch(foto, /getPublicUrl/);
    assert.match(foto, /createSignedUrl\(dest, dryRun \? PHOTO_URL_TTL_TROCKENLAUF : PHOTO_URL_TTL_SECONDS\)/);
    assert.match(foto, /export const PHOTO_URL_TTL_SECONDS = 7 \* 24 \* 60 \* 60;/);
  });

  it("der Lauf räumt vor allen Abbrüchen auf und entfernt nur im Echtlauf", () => {
    const s = quelle("lib/event-app/speakers.ts");
    const aufraeumen = s.indexOf("entferneVeralteteFotos(admin");
    assert.ok(aufraeumen > 0, "Aufräumen fehlt");
    assert.ok(aufraeumen < s.indexOf("if (rows.length === 0) return out;"), "Aufräumen steht hinter dem Leer-Abbruch");
    assert.ok(aufraeumen < s.indexOf("if (!opts.hatSchluessel)"), "Aufräumen steht hinter dem Schlüssel-Abbruch");
    assert.match(quelle("lib/event-app/logos.ts"), /if \(dryRun\) continue;\s+for \(let i = 0; i < weg\.length; i \+= 100\)/);
  });

  it("kein Weg nutzt mehr die öffentliche Fotoadresse", () => {
    for (const p of ["lib/event-app/speakers.ts", "lib/event-app/logos.ts", "app/api/admin/swapcard/speakers/route.ts"]) {
      assert.doesNotMatch(quelle(p), /ensurePublicPhoto|publicPhotoUrl|PUBLIC_PHOTO_BUCKET|öffentliche Kopie/);
    }
  });

  it("die Karte nennt die entfernten Kopien in DE und EN", () => {
    for (const sprache of ["de", "en"] as const) {
      const w = JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));
      assert.ok(w.adminPartner.speakerPhotosRemoved?.includes("{n}"), `${sprache}.speakerPhotosRemoved fehlt`);
      assert.ok(w.adminPartner.speakerPhotosRemovedDry?.includes("{n}"), `${sprache}.speakerPhotosRemovedDry fehlt`);
    }
  });
});
