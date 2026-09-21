import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { exhibitorChanged, exhibitorDescription, exhibitorTier, matchRemote, normalizeWebsite, publicLogoPath, toExhibitorUpsert } from "@/lib/event-app/mapping";
import { toSwapcardInput } from "@/lib/event-app/swapcard/queries";
import type { ExhibitorRow } from "@/lib/event-app/types";

const row: ExhibitorRow = {
  org_edition_id: "oe1", org_id: "org1", edition_id: "ed1", edition_slug: "fls27", swapcard_event_id: "evt1",
  name: " Expo ", legal_name: "Expo GmbH", slug: "expo", description_de: "Wir bauen Messen.", description_en: "We build fairs.", website: "expo.example",
  sponsoring_level: "Premium", sponsoring_key: "premium", sponsoring_rank: 40,
  level_key: "premium", level_rank: 40, level_source: "product", categories: ["standflaeche", "hackathon"],
  partner_category: null, org_type: "corporate", booth_number: "A12", onboarding_status: "filled",
  logo_svg_path: null, logo_png_path: null, logo_png_asset_id: null, swapcard_exhibitor_id: null, members: [],
};

describe("Event-App-Abbildung", () => {
  it("bildet die Org auf einen Aussteller ab: clientId = Org-ID, Beschreibung DE + EN, Website mit https — ohne `type`", () => {
    const item = toExhibitorUpsert(row);
    assert.deepEqual(item, {
      clientId: "org1", name: "Expo", description: "Wir bauen Messen.", descriptionEn: "We build fairs.", websiteUrl: "https://expo.example", booth: "A12",
    });
    assert.equal(toExhibitorUpsert({ ...row, description_en: null }).descriptionEn, undefined);
    assert.equal(exhibitorDescription({ description_de: "  ", description_en: "EN" }), "EN");
    assert.equal(normalizeWebsite("https://a.b"), "https://a.b");
    assert.equal(normalizeWebsite("  "), undefined);
  });

  it("gibt Level und Kategorien aus der Ableitung weiter — in Swapcard ist `type` die Branche, nicht das Level", () => {
    assert.deepEqual(exhibitorTier(row), { level: "premium", source: "product", categories: ["standflaeche", "hackathon"] });
    assert.deepEqual(exhibitorTier({ ...row, level_key: null, level_source: null, categories: [] }), { level: null, source: null, categories: [] });
    // Das Level darf nie als `type` mitgehen: 2026 stand dort die Branche, und dabei bleibt es.
    assert.equal("type" in toExhibitorUpsert(row), false);
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

  it("schreibt nur, wenn sich etwas geändert hat; Logo zählt nur mit eigenem Wert, type (Branche) gar nicht", () => {
    const wanted = toExhibitorUpsert(row);
    const same = { id: "r1", name: "Expo", description: "Wir bauen Messen.", websiteUrl: "https://expo.example", logoUrl: "https://cdn/x.png", type: "Tech" };
    assert.equal(exhibitorChanged(same, wanted), false);
    assert.equal(exhibitorChanged({ ...same, description: "alt" }, wanted), true);
    assert.equal(exhibitorChanged(same, { ...wanted, logoUrl: "https://cdn/y.png" }), true);
  });

  it("hält einen mehrzeiligen Text nicht für geändert, nur weil Swapcard ihn als HTML zurückgibt", () => {
    const mehrzeilig = { ...row, description_de: "Absatz A\n\nAbsatz B", description_en: null };
    const wanted = toExhibitorUpsert(mehrzeilig);
    // So kommt der Text zurück: Tags entfernt, ohne Trennzeichen (Probe an den 191 Ausstellern der Community, 21.09.2026).
    const remote = { id: "r1", name: "Expo", description: "Absatz AAbsatz B", websiteUrl: "https://expo.example" };
    assert.equal(exhibitorChanged(remote, wanted), false);
    assert.equal(exhibitorChanged({ ...remote, description: "<p>Absatz A</p><p>Absatz B</p>" }, wanted), false);
    assert.equal(exhibitorChanged({ ...remote, description: "Absatz A" }, wanted), true);
  });

  it("vergleicht die Standnummer nur, wenn wir sie kennen — sie hängt am Event, nicht am Aussteller", () => {
    const wanted = toExhibitorUpsert(row);
    const base = { id: "r1", name: "Expo", description: "Wir bauen Messen.", websiteUrl: "https://expo.example", logoUrl: null };
    // Aus der Community gelesen: keine Standnummern bekannt ⇒ kein Grund zu schreiben.
    assert.equal(exhibitorChanged({ ...base, logoUrl: undefined }, { ...wanted, logoUrl: undefined }), false);
    // Im Event gelesen: falsche oder fehlende Standnummer ⇒ schreiben.
    assert.equal(exhibitorChanged({ ...base, booths: ["A12"] }, { ...wanted, logoUrl: undefined }), false);
    assert.equal(exhibitorChanged({ ...base, booths: ["B03"] }, { ...wanted, logoUrl: undefined }), true);
    assert.equal(exhibitorChanged({ ...base, booths: [] }, { ...wanted, logoUrl: undefined }), true);
  });

  it("gibt an Swapcard nur geprüfte Felder weiter: inputId = clientId, EN als Übersetzung, Standnummer, bestehende ID, kein type", () => {
    assert.deepEqual(toSwapcardInput(toExhibitorUpsert(row)), {
      inputId: "org1", clientId: "org1", name: "Expo", description: "Wir bauen Messen.",
      descriptionTranslations: [{ language: "en_US", value: "We build fairs." }], websiteUrl: "https://expo.example", booth: "A12",
    });
    assert.equal(toSwapcardInput({ ...toExhibitorUpsert(row), existingId: "RXhoaWJpdG9y" }).id, "RXhoaWJpdG9y");
  });

  it("legt die öffentliche Logo-Kopie je Fassung ab", () => {
    assert.equal(publicLogoPath(row), null);
    assert.equal(publicLogoPath({ ...row, logo_png_asset_id: "a1" }), "fls27/org1/a1.png");
  });
});
