import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { PARTNER_LOGO_TYPE, partnerLogoChanged, partnerLogoDocId, partnerLogoDocument, partnerLogoRefMeta } from "@/lib/sanity/mapping";

const row = {
  org_id: "org1", org_edition_id: "oe1", edition_slug: "fls27", name: " Expo ", website: "expo.example", sponsoring_level: "Premium", partner_category: "talent",
  logo_svg_path: "ed/org1/logo_vector/abc-logo.svg", logo_png_path: "ed/org1/logo_png/def-logo.png", logo_png_asset_id: "a1",
};

describe("Sanity: Partner-Logo-Dokument", () => {
  it("eine feste ID je Org, nur unser Typ, nur mit freigegebenem SVG", () => {
    assert.equal(partnerLogoDocId("org1"), "portalPartnerLogo.org1");
    const doc = partnerLogoDocument(row, { svgAssetId: "image-abc-svg", pngUrl: "https://cdn/x.png", now: new Date("2026-09-11T20:00:00Z") });
    assert.deepEqual(doc, {
      _id: "portalPartnerLogo.org1", _type: PARTNER_LOGO_TYPE, orgId: "org1", editionSlug: "fls27", name: "Expo", website: "https://expo.example",
      sponsoringLevel: "Premium", partnerCategory: "talent", logoSvg: { _type: "image", asset: { _type: "reference", _ref: "image-abc-svg" } },
      logoSvgPath: "ed/org1/logo_vector/abc-logo.svg", logoPngUrl: "https://cdn/x.png", publishedAt: "2026-09-11T20:00:00.000Z",
    });
    assert.equal(partnerLogoDocument({ ...row, logo_svg_path: null }), null);
    assert.equal(partnerLogoDocument(row)?.logoSvg, undefined);
  });

  it("veröffentlicht nur, wenn Fassung, Name oder Level sich geändert haben", () => {
    const meta = partnerLogoRefMeta(row, "image-abc-svg", new Date("2026-09-11T20:00:00Z"));
    assert.equal(partnerLogoChanged(meta, row), false);
    assert.equal(partnerLogoChanged(null, row), true);
    assert.equal(partnerLogoChanged(meta, { ...row, logo_svg_path: "ed/org1/logo_vector/new.svg" }), true);
    assert.equal(partnerLogoChanged(meta, { ...row, logo_png_asset_id: "a2" }), true);
    assert.equal(partnerLogoChanged(meta, { ...row, sponsoring_level: "Signature" }), true);
    assert.equal(partnerLogoChanged(meta, { ...row, website: "other.example" }), false);
  });
});
