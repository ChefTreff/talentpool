import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * TAL-016 (Porträt in der Dreiecksform) und TAL-017 (Upload in einem Schritt).
 *
 * Beides sind Bauweisen, die man dem Ergebnis nicht ansieht, bis ein Bild mit
 * dem falschen Seitenverhältnis kommt — deshalb halten die Tests die Bauweise
 * fest, nicht die Pixel. Gemessen wurde es im Browser (PR-Beschreibung): ein
 * Hochformat von 600×900 ragte vorher 96 px aus der Form.
 */
const lies = (datei: string) => readFileSync(datei, "utf8");

describe("Porträt in der Dreiecksform (TAL-016)", () => {
  const src = lies("components/ui/PortraitShape.tsx");
  // Das echte Bild-Element, nicht das Wort „<img>“ in einem Kommentar.
  const bild = src.match(/<img\s[^>]*src=\{photoUrl\}[^>]*\/>/)?.[0] ?? "";

  it("das Bild füllt einen Rahmen und positioniert sich nicht selbst", () => {
    assert.ok(bild, "kein <img src={photoUrl} …/> gefunden");
    // `absolute` mit Abständen streckt ein ersetztes Element nicht: es nähme
    // seine eigene Höhe an und ragte bei Hochformat heraus.
    assert.ok(!/\babsolute\b|\binset-|\btop-|\bbottom-/.test(bild), `das Bild positioniert sich selbst: ${bild}`);
    assert.ok(/\bsize-full\b/.test(bild) && /\bobject-cover\b/.test(bild), "füllt den Rahmen nicht");
    // Köpfe sitzen oben im Bild — beschnitten wird von unten.
    assert.ok(/\bobject-top\b/.test(bild), "Kopf nach oben fehlt");
  });

  it("der Rahmen beschneidet und trägt die Soft-Fläche für freigestellte Bilder", () => {
    const rahmen = src.match(/<span\s+className=\{cn\(\s*"absolute bg-accent-soft"[\s\S]*?<\/span>/)?.[0] ?? "";
    assert.ok(rahmen.includes("--ct-shape-triangle"), "Rahmen beschneidet nicht");
    assert.ok(rahmen.includes(bild), "das Bild liegt nicht im Rahmen");
  });

  it("der Beschnitt gilt auch für ältere Safari-Versionen", () => {
    const stellen = src.match(/clipPath:/g)?.length ?? 0;
    const webkit = src.match(/WebkitClipPath:/g)?.length ?? 0;
    assert.ok(stellen > 0 && stellen === webkit, `${stellen} clipPath, ${webkit} WebkitClipPath`);
  });
});

describe("Upload in einem Schritt (TAL-017)", () => {
  it("Porträt und Einzelfotos laden mit der Auswahl hoch (sofort)", () => {
    for (const datei of [
      "app/(talent)/profil/PortraitUpload.tsx",
      "components/speaker/PhotoUpload.tsx",
      "app/(admin)/admin/ansprechpartner/KontakteAdmin.tsx",
      "components/partner/Gaesteliste.tsx",
    ]) {
      assert.match(lies(datei), /<FileButton\s+sofort\b/, `${datei}: FileButton ohne sofort`);
    }
  });

  it("Dokumente behalten die Prüfung vor dem Hochladen", () => {
    // Lebenslauf, Präsentation, Beleg: die falsche Datei ist dort teuer.
    for (const datei of [
      "app/(talent)/profil/CvUpload.tsx",
      "components/speaker/PraesentationenListe.tsx",
      "app/(speaker)/speaker/reisekosten/ExpenseWizard.tsx",
    ]) {
      assert.ok(!/<FileButton[^>]*\bsofort\b/.test(lies(datei)), `${datei}: Dokument lädt sofort hoch`);
    }
  });

  it("FileButton ruft onFile bei „sofort“ gleich auf und hält die Datei sonst", () => {
    const src = lies("components/ui/FileButton.tsx");
    // `onFile` ist seit TAL-010 optional (Mehrfachauswahl über `onFiles`); das Verhalten bleibt.
    assert.match(src, /if \(sofort\) onFile\??\.?\(file\);\s*else setGewaehlt\(file\);/);
    // Mehrfachauswahl startet gleich und nur, wenn `onFiles` gesetzt ist.
    assert.match(src, /multiple=\{Boolean\(onFiles\)\}/);
    // Der Zwischenzustand: Ring, Status für Vorlesesoftware.
    assert.match(src, /laedt \? <Spinner \/>/);
    assert.match(src, /role="status"/);
  });
});
