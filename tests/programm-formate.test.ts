import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { APPLICATION_FORMATS, isApplicationFormat } from "@/app/(talent)/programm/types";
import { EVENT_APP_STORE_LINKS } from "@/lib/event-app/store-links";

describe("Teilnehmer-Programm zeigt nur Formate mit Bewerbung (TAL-014)", () => {
  it("lässt die vier Bewerbungsformate durch", () => {
    for (const f of ["masterclass", "company_tour", "interview_table", "side_event"]) {
      assert.equal(isApplicationFormat(f), true, f);
    }
    assert.equal(APPLICATION_FORMATS.length, 4);
  });

  it("hält Bühnenformate und Sessions ohne Format heraus", () => {
    for (const f of ["keynote", "panel", "talk", "fireside_chat", "workshop", "break", "", null, undefined]) {
      assert.equal(isApplicationFormat(f), false, String(f));
    }
  });

  it("verlinkt beide Stores über https", () => {
    assert.match(EVENT_APP_STORE_LINKS.appStore, /^https:\/\/apps\.apple\.com\//);
    assert.match(EVENT_APP_STORE_LINKS.googlePlay, /^https:\/\/play\.google\.com\/.*cheftreffdeutsch$/);
  });
});
