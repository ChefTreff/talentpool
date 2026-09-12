import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { couponCode, undershopName, undershopUrl } from "@/lib/vivenu/naming";

describe("vivenu-Kontingente", () => {
  it("bildet Undershop-Namen und Coupon-Codes aus Edition und Org", () => {
    assert.equal(undershopName("fls27", "Erfolg GmbH"), "FLS27 · Erfolg GmbH");
    const code = couponCode("fls27", "erfolg-gmbh", "Erfolg GmbH", "partner");
    assert.match(code, /^FLS27-ERFOLGGMBH-PART-[0-9A-F]{6}$/);
    assert.match(couponCode("fls27", null, "Ümläut & Co", "startup"), /^FLS27-MLUTCO-STAR-[0-9A-F]{6}$/);
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
