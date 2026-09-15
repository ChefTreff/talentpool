import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  PARTNER_LOGO_TYPE, UNRANKED, partnerLogoChanged, partnerLogoDocId, partnerLogoDocument, partnerLogoRefMeta, sponsoringLevelKey,
} from "@/lib/sanity/mapping";

const row = {
  org_id: "org1", org_edition_id: "oe1", edition_slug: "fls27", name: " Expo ", website: "expo.example",
  sponsoring_level: "Premium", sponsoring_key: "premium", sponsoring_rank: 40, partner_category: "talent",
  logo_svg_path: "ed/org1/logo_vector/abc-logo.svg", logo_png_path: "ed/org1/logo_png/def-logo.png", logo_png_asset_id: "a1",
};

describe("Sanity: Partner-Logo-Dokument (Kontrakt v2)", () => {
  it("eine feste ID je Org ohne Punkt (Punkt = privater Pfad in Sanity), nur unser Typ, nur mit freigegebenem SVG", () => {
    assert.equal(partnerLogoDocId("org1"), "portalPartnerLogo-org1");
    assert.ok(!partnerLogoDocId("org1").includes("."));
    const doc = partnerLogoDocument(row, { svgAssetId: "image-abc-svg", pngUrl: "https://cdn/x.png", transparent: true, now: new Date("2026-09-11T20:00:00Z") });
    assert.deepEqual(doc, {
      _id: "portalPartnerLogo-org1", _type: PARTNER_LOGO_TYPE, orgId: "org1", editionSlug: "fls27", name: "Expo", website: "https://expo.example",
      sponsoringLevel: "premium", sponsoringRank: 40, partnerCategory: "talent", logoSvg: { _type: "image", asset: { _type: "reference", _ref: "image-abc-svg" } },
      logoSvgPath: "ed/org1/logo_vector/abc-logo.svg", logoTransparent: true, logoPngUrl: "https://cdn/x.png", publishedAt: "2026-09-11T20:00:00.000Z",
    });
    assert.equal(partnerLogoDocument({ ...row, logo_svg_path: null }, { transparent: true }), null);
    assert.equal(partnerLogoDocument(row, { transparent: true })?.logoSvg, undefined);
  });

  it("Rang aus dem Vokabular, unbekanntes Level normalisiert mit Rang 999, ohne Level kein sponsoringLevel", () => {
    const doc = partnerLogoDocument(row, { transparent: false });
    assert.equal(doc?.logoTransparent, false);
    const unknown = partnerLogoDocument({ ...row, sponsoring_level: "Main Stage Loge", sponsoring_key: null, sponsoring_rank: null }, { transparent: true });
    assert.equal(unknown?.sponsoringLevel, "main_stage_loge");
    assert.equal(unknown?.sponsoringRank, UNRANKED);
    const none = partnerLogoDocument({ ...row, sponsoring_level: null, sponsoring_key: null, sponsoring_rank: null }, { transparent: true });
    assert.equal(none?.sponsoringLevel, undefined);
    assert.equal(none?.sponsoringRank, UNRANKED);
    assert.equal(sponsoringLevelKey(" Start Up "), "start_up");
    assert.equal(sponsoringLevelKey("Start-Up"), "start_up");
    assert.equal(sponsoringLevelKey("25qm+ Signature"), "25qm_signature");
    assert.equal(sponsoringLevelKey(""), null);
    assert.equal(sponsoringLevelKey(null), null);
  });

  it("veröffentlicht nur, wenn Fassung, Name, Level oder Rang sich geändert haben", () => {
    const meta = partnerLogoRefMeta(row, "image-abc-svg", true, new Date("2026-09-11T20:00:00Z"));
    assert.equal(meta.logo_transparent, true);
    assert.equal(meta.sponsoring_key, "premium");
    assert.equal(partnerLogoChanged(meta, row), false);
    assert.equal(partnerLogoChanged(null, row), true);
    assert.equal(partnerLogoChanged(meta, { ...row, logo_svg_path: "ed/org1/logo_vector/new.svg" }), true);
    assert.equal(partnerLogoChanged(meta, { ...row, logo_png_asset_id: "a2" }), true);
    assert.equal(partnerLogoChanged(meta, { ...row, sponsoring_level: "Signature", sponsoring_key: "signature", sponsoring_rank: 20 }), true);
    assert.equal(partnerLogoChanged(meta, { ...row, sponsoring_rank: 41 }), true);
    assert.equal(partnerLogoChanged(meta, { ...row, website: "other.example" }), false);
  });
});
