import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { APPLICATION_FORMATS, isApplicationFormat } from "@/app/(talent)/programm/types";
import { STORE_LINK_SCHLUESSEL, storeLinksAus } from "@/lib/event-app/store-links";
import { migrationText } from "@/tests/migration-datei";

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

  // Seit PART-072 pflegt das Team die Store-Links im Admin (`portal_link`); die Startwerte stehen
  // in der Migration, die Seiten lesen über `loadStoreLinks`.
  it("verlinkt beide Stores über https", () => {
    const sql = migrationText("v6_portal_links");
    assert.match(sql, /'event_app_app_store', 'App Store', 'App Store',\s*'https:\/\/apps\.apple\.com\//);
    assert.match(sql, /'event_app_google_play', 'Google Play', 'Google Play',\s*'https:\/\/play\.google\.com\/[^']*cheftreffdeutsch'/);
    const links = storeLinksAus([
      { key: STORE_LINK_SCHLUESSEL.appStore, url: "https://apps.apple.com/de/app/x" },
      { key: STORE_LINK_SCHLUESSEL.googlePlay, url: "http://unsicher.example" },
    ]);
    assert.equal(links.appStore, "https://apps.apple.com/de/app/x");
    assert.equal(links.googlePlay, null, "nur https");
  });
});
