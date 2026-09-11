import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { exhibitorChanged, exhibitorDescription, exhibitorType, matchRemote, normalizeWebsite, toExhibitorUpsert } from "@/lib/event-app/mapping";
import { toSwapcardInput } from "@/lib/event-app/swapcard/queries";
import type { ExhibitorRow } from "@/lib/event-app/types";

const row: ExhibitorRow = {
  org_edition_id: "oe1", org_id: "org1", edition_id: "ed1", edition_slug: "fls27", swapcard_event_id: "evt1",
  name: " Expo ", legal_name: "Expo GmbH", slug: "expo", description_de: "Wir bauen Messen.", description_en: "We build fairs.", website: "expo.example",
  sponsoring_level: "Premium", partner_category: null, org_type: "corporate", booth_number: "A12", onboarding_status: "filled",
  logo_path: null, logo_mime: null, swapcard_exhibitor_id: null, members: [],
};

describe("Event-App-Abbildung", () => {
  it("bildet die Org auf einen Aussteller ab: clientId = Org-ID, Typ = Sponsoring-Level, Website mit https", () => {
    const item = toExhibitorUpsert(row);
    assert.deepEqual(item, { clientId: "org1", name: "Expo", description: "Wir bauen Messen.", websiteUrl: "https://expo.example", type: "Premium", booth: "A12" });
    assert.equal(toExhibitorUpsert(row, { locale: "en" }).description, "We build fairs.");
    assert.equal(exhibitorDescription({ description_de: "  ", description_en: "EN" }), "EN");
    assert.equal(exhibitorType(row), "Premium");
    assert.equal(normalizeWebsite("https://a.b"), "https://a.b");
    assert.equal(normalizeWebsite("  "), undefined);
  });

  it("kürzt lange Beschreibungen", () => {
    const long = "x".repeat(2500);
    assert.equal(exhibitorDescription({ description_de: long, description_en: null })?.length, 2000);
  });

  it("findet bestehende Aussteller über clientId, dann App-ID, dann Namen", () => {
    const remotes = [
      { id: "r1", name: "Anders", clientIds: ["org1"] },
      { id: "r2", name: "expo", clientIds: [] },
      { id: "r3", name: "Dritte" },
    ];
    assert.equal(matchRemote(remotes, row)?.id, "r1");
    assert.equal(matchRemote(remotes.slice(1), row)?.id, "r2");
    assert.equal(matchRemote(remotes.slice(2), { ...row, swapcard_exhibitor_id: "r3" })?.id, "r3");
    assert.equal(matchRemote(remotes.slice(2), row), undefined);
  });

  it("schreibt nur, wenn sich etwas geändert hat; Logo zählt nur mit eigenem Wert", () => {
    const wanted = toExhibitorUpsert(row);
    const same = { id: "r1", name: "Expo", description: "Wir bauen Messen.", websiteUrl: "https://expo.example", logoUrl: "https://cdn/x.png" };
    assert.equal(exhibitorChanged(same, wanted), false);
    assert.equal(exhibitorChanged({ ...same, description: "alt" }, wanted), true);
    assert.equal(exhibitorChanged(same, { ...wanted, logoUrl: "https://cdn/y.png" }), true);
  });

  it("gibt an Swapcard nur bekannte Felder weiter (keine Standnummer)", () => {
    assert.deepEqual(toSwapcardInput(toExhibitorUpsert(row)), {
      clientId: "org1", name: "Expo", description: "Wir bauen Messen.", websiteUrl: "https://expo.example", type: "Premium",
    });
  });
});

