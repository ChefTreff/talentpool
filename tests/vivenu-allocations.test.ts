import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { gruppenCode, undershopName, undershopUrl } from "@/lib/vivenu/naming";

describe("vivenu-Kontingente", () => {
  it("bildet Undershop-Namen und den Code einer Gruppe aus Edition und Org — ohne Kategorie (PART-111)", () => {
    assert.equal(undershopName("fls27", "Erfolg GmbH"), "FLS27 · Erfolg GmbH");
    const code = gruppenCode("fls27", "erfolg-gmbh", "Erfolg GmbH");
    assert.match(code, /^FLS27-ERFOLGGMBH-[0-9A-F]{6}$/);
    assert.match(gruppenCode("fls27", null, "Ümläut & Co"), /^FLS27-MLUTCO-[0-9A-F]{6}$/);
    // Die Rabattstufe steht im Code, damit ein Mensch den Code des Rabattkontingents erkennt.
    assert.match(gruppenCode("fls27", "erfolg", "Erfolg GmbH", 50), /^FLS27-ERFOLG-50-[0-9A-F]{6}$/);
    // Zwei Aufrufe ergeben zwei verschiedene Codes: eindeutig ist der Code durch den Zufallsteil.
    assert.notEqual(gruppenCode("fls27", "erfolg", "x"), gruppenCode("fls27", "erfolg", "x"));
  });

  it("baut den Undershop-Link aus VIVENU_SHOP_BASE", () => {
    // Form am 12.09. gegen die Sandbox geprüft: <shop>/event/<eventId>/<underShopId>.
    const vorher = process.env.VIVENU_SHOP_BASE;
    process.env.VIVENU_SHOP_BASE = "https://cheftreff-idbu.vivenushop.dev/";
    try {
      assert.equal(
        undershopUrl("evt1", { _id: "us1", name: "x" }),
        "https://cheftreff-idbu.vivenushop.dev/event/evt1/us1",
      );
      // Ein von vivenu geliefertes Feld hat Vorrang.
      assert.equal(undershopUrl("evt1", { _id: "us1", name: "x", shopUrl: "https://vivenu.dev/e/abc" }), "https://vivenu.dev/e/abc");
      assert.equal(undershopUrl("evt1", { name: "x" }), null);

      // Lieber kein Link als ein erfundener.
      delete process.env.VIVENU_SHOP_BASE;
      assert.equal(undershopUrl("evt1", { _id: "us1", name: "x" }), null);
      process.env.VIVENU_SHOP_BASE = "cheftreff-idbu.vivenushop.dev";
      assert.equal(undershopUrl("evt1", { _id: "us1", name: "x" }), null);
    } finally {
      if (vorher === undefined) delete process.env.VIVENU_SHOP_BASE;
      else process.env.VIVENU_SHOP_BASE = vorher;
    }
  });
});
