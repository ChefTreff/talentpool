import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import de from "@/lib/i18n/de.json" with { type: "json" };
import en from "@/lib/i18n/en.json" with { type: "json" };

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ohneKommentare = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const MASKE = "app/(speaker)/speaker/grafik/GrafikMaske.tsx";

/**
 * SPK-080: Die Bedienung der „Hear me speak“-Maske steht im gemeinsamen Kern
 * (`useBildAusschnitt`, ADM-066), nicht mehr als eigene Kopie in der Maske. Diese
 * Datei hält fest, dass die Umstellung nichts von dem verloren hat, was die Maske
 * ausmacht: den Rahmen über dem Porträt, das Porträt, das im Browser bleibt, und den
 * Regler mit 44 px auf groben Zeigern.
 */
describe("Hear-me-speak-Maske auf dem gemeinsamen Kern (SPK-080)", () => {
  it("benutzt den Hook und bringt keine eigene Zeigerlogik mehr mit", () => {
    const q = ohneKommentare(src(MASKE));
    assert.match(q, /import \{ useBildAusschnitt \} from "@\/components\/ui\/useBildAusschnitt"/);
    assert.match(q, /useBildAusschnitt\(datei, GROESSE, \{ zeichneUeber \}\)/);
    for (const eigene of ["onPointerDown", "onPointerMove", "setPointerCapture", "onKeyDown", "ArrowLeft", "ZOOM_MAX", "TASTEN_SCHRITT"]) {
      assert.ok(!q.includes(eigene), `die Maske hat noch ${eigene}`);
    }
  });

  it("legt den Rahmen als Überblendung über das Porträt, auch ohne Porträt", () => {
    const q = ohneKommentare(src(MASKE));
    assert.match(q, /const zeichneUeber = useCallback\(/);
    assert.match(q, /ctx\.drawImage\(rahmen, 0, 0, GROESSE, GROESSE\)/);
    assert.match(q, /const GROESSE = 1200;/);
    assert.match(q, /const TEMPLATE = "\/brand\/hear-me-speak-fls26\.png";/);
    assert.ok(existsSync("public/brand/hear-me-speak-fls26.png"), "das Template liegt noch da");
    // ohne Porträt die ruhige Fläche aus dem Token, nicht als Hex-Wert
    assert.match(q, /--ct-accent-soft/);
    assert.doesNotMatch(q, /#[0-9a-fA-F]{6}\b/);
  });

  it("der Verweis auf `zeichneUeber` hängt vom Rahmen ab: ein geladener Rahmen löst das Neuzeichnen aus", () => {
    const q = ohneKommentare(src(MASKE));
    assert.match(q, /\[rahmen\],?\s*\)/);
    assert.match(q, /img\.onload = \(\) => setRahmen\(img\)/);
  });

  it("verteilt Zeichenfläche und Regler aus dem Hook und lässt Namen und Klassen bei der Maske", () => {
    const q = src(MASKE);
    assert.match(q, /<canvas\s+\{\.\.\.a\.canvasProps\}\s+role="img"/);
    assert.match(q, /aria-label=\{hatBild \? t\.canvasWithImage : t\.canvasEmpty\}/);
    assert.match(q, /type="range"\s+\{\.\.\.a\.regler\}/);
    assert.match(q, /onClick=\{a\.zuruecksetzen\}/);
  });

  it("der Regler hält auf groben Zeigern 44 px (SPK-079) — auch nach der Umstellung", () => {
    const q = src(MASKE);
    const start = q.indexOf('type="range"');
    const regler = q.slice(start, q.indexOf("/>", start));
    assert.match(regler, /className="[^"]*\bpointer-coarse:h-11\b/);
  });

  it("das Porträt bleibt im Browser: kein Upload, Export über die Leinwand als PNG mit dem Namensvorschlag", () => {
    const q = ohneKommentare(src(MASKE));
    assert.doesNotMatch(q, /\.upload\(|uploadToSignedUrl|fetch\(|FormData|postJson|sendBeacon/);
    assert.match(q, /a\.canvasProps\.ref\.current/);
    assert.match(q, /toBlob\(/);
    assert.match(q, /"image\/png"/);
    assert.match(q, /link\.download = `\$\{vorschlag\}\.png`/);
  });

  it("Dateien über 10 MB und andere Formate als JPEG, PNG und WebP weist die Maske vor dem Laden ab", () => {
    const q = ohneKommentare(src(MASKE));
    assert.match(q, /const MAX_BYTES = 10 \* 1024 \* 1024;/);
    assert.match(q, /const MIME = \["image\/jpeg", "image\/png", "image\/webp"\];/);
    assert.match(q, /gewaehlt\.size > MAX_BYTES/);
    assert.match(q, /!MIME\.includes\(gewaehlt\.type\)/);
    assert.match(q, /if \(a\.ladefehler\) toast\("error", t\.loadFailed\)/);
  });

  it("alle Texte der Maske gibt es auf Deutsch und Englisch", () => {
    for (const key of ["tooBig", "wrongType", "loadFailed", "exportFailed", "downloaded", "canvasEmpty", "canvasWithImage", "dragHint", "zoom", "reset", "download"]) {
      assert.ok((de.speakerGraphic as Record<string, string>)[key], `de ${key}`);
      assert.ok((en.speakerGraphic as Record<string, string>)[key], `en ${key}`);
    }
  });
});
