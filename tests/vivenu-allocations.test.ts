import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { couponCode, undershopName, undershopUrl } from "@/lib/vivenu/allocations";

describe("vivenu-Kontingente", () => {
  it("bildet Undershop-Namen und Coupon-Codes aus Edition und Org", () => {
    assert.equal(undershopName("fls27", "Erfolg GmbH"), "FLS27 · Erfolg GmbH");
    const code = couponCode("fls27", "erfolg-gmbh", "Erfolg GmbH", "partner");
    assert.match(code, /^FLS27-ERFOLGGMBH-PART-[0-9A-F]{6}$/);
    assert.match(couponCode("fls27", null, "Ümläut & Co", "startup"), /^FLS27-MLUTCO-STAR-[0-9A-F]{6}$/);
  });

  it("nimmt den Link aus der vivenu-Antwort, sonst den Kandidaten", () => {
    assert.equal(undershopUrl("evt1", { _id: "us1", name: "x", shopUrl: "https://vivenu.dev/e/abc" }), "https://vivenu.dev/e/abc");
    assert.equal(undershopUrl("evt1", { _id: "us1", name: "x" }), "https://vivenu.dev/e/evt1/us1");
    assert.equal(undershopUrl("evt1", { name: "x" }), null);
  });
});
