import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { loomEmbedUrl } from "@/components/video/loom";

/**
 * Der CHECK in der Datenbank erlaubt `loom.com` und `www.loom.com`, die CSP
 * kennt nur `www.loom.com`. Ohne Normalisierung bliebe der Rahmen leer und
 * niemand wüsste, warum.
 */
describe("Loom-Einbettung", () => {
  it("macht aus dem Freigabelink eine Einbettungsadresse", () => {
    assert.equal(
      loomEmbedUrl("https://www.loom.com/share/abc123"),
      "https://www.loom.com/embed/abc123",
    );
  });

  it("ergänzt fehlendes www — sonst greift die CSP", () => {
    assert.equal(
      loomEmbedUrl("https://loom.com/share/abc123"),
      "https://www.loom.com/embed/abc123",
    );
  });

  it("wirft die Abfrage weg", () => {
    assert.equal(
      loomEmbedUrl("https://loom.com/share/abc123?t=42&sid=x"),
      "https://www.loom.com/embed/abc123",
    );
  });

  it("lässt eine schon eingebettete Adresse in Ruhe", () => {
    assert.equal(
      loomEmbedUrl("https://www.loom.com/embed/abc123"),
      "https://www.loom.com/embed/abc123",
    );
  });
});
