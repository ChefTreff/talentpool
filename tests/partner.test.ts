import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { acceptAttribute, checkFileRules, extensionOf } from "@/lib/partner/file-rules";
import { visibleNavKeys, STAGE_SKU, type NavInput } from "@/app/(partner)/partner/nav";
import type { PartnerProduct } from "@/app/(partner)/partner/types";
import { toRpcFailure } from "@/lib/rpc-error";
import { canPublishSessions } from "@/components/programme/permissions";
import de from "@/lib/i18n/de.json" with { type: "json" };
import en from "@/lib/i18n/en.json" with { type: "json" };

const LOGO_RULES = {
  ext: ["svg", "eps", "ai", "pdf"],
  mime: ["image/svg+xml", "application/postscript", "application/pdf"],
  max_bytes: 20 * 1024 * 1024,
};

const file = (name: string, type = "", size = 1000) => ({ name, type, size });

describe("Datei-Regeln der Uploads", () => {
  it("nimmt, was die Endung erlaubt", () => {
    assert.equal(checkFileRules(file("logo.svg", "image/svg+xml"), LOGO_RULES), null);
    assert.equal(checkFileRules(file("LOGO.SVG", "image/svg+xml"), LOGO_RULES), null);
    assert.equal(checkFileRules(file("logo.pdf", "application/pdf"), LOGO_RULES), null);
  });

  it("weist das PNG-Logo ab (B2-Akzeptanz)", () => {
    const bad = checkFileRules(file("logo.png", "image/png"), LOGO_RULES);
    assert.equal(bad?.reason, "ext");
    assert.equal(bad?.detail, ".png");
  });

  it("lässt EPS durch, auch wenn der Browser den Typ nicht kennt", () => {
    // Browser melden EPS oft als octet-stream oder gar nichts — die Endung
    // entscheidet, sonst schiebe man gültige Dateien ins Leere.
    assert.equal(checkFileRules(file("logo.eps", ""), LOGO_RULES), null);
    assert.equal(
      checkFileRules(file("logo.eps", "application/octet-stream"), LOGO_RULES),
      null,
    );
  });

  it("meldet einen MIME-Typ, der der Endung widerspricht", () => {
    const bad = checkFileRules(file("logo.svg", "image/png"), LOGO_RULES);
    assert.equal(bad?.reason, "mime");
  });

  it("achtet auf die Größe", () => {
    const bad = checkFileRules(file("logo.svg", "image/svg+xml", 21 * 1024 * 1024), LOGO_RULES);
    assert.equal(bad?.reason, "size");
    assert.equal(bad?.detail, "20 MB");
  });

  it("lässt ohne Regeln alles zu", () => {
    assert.equal(checkFileRules(file("irgendwas.xyz"), null), null);
  });

  it("liest die Endung auch aus schwierigen Namen", () => {
    assert.equal(extensionOf("a.b.svg"), "svg");
    assert.equal(extensionOf("ohnepunkt"), "");
    assert.equal(extensionOf(".gitignore"), "");
    assert.equal(extensionOf("endetmitpunkt."), "");
  });

  it("baut ein `accept` aus Endungen und MIME-Typen", () => {
    assert.equal(
      acceptAttribute({ ext: ["svg"], mime: ["image/svg+xml"], max_bytes: null }),
      ".svg,image/svg+xml",
    );
    assert.equal(acceptAttribute(null), undefined);
  });
});

const product = (p: Partial<PartnerProduct>): PartnerProduct => ({
  sku: "I-00000",
  name_de: null,
  name_en: null,
  category: null,
  type: "addon",
  qty: 1,
  unit_price_cents: null,
  status: "booked",
  ...p,
});

const nav = (input: Partial<NavInput>) =>
  visibleNavKeys({
    products: [],
    sessions_count: 0,
    has_stage: false,
    has_allocations: false,
    ...input,
  });

describe("Menü folgt den gebuchten Leistungen", () => {
  it("zeigt ohne Produkte nur das, was jede Org hat", () => {
    const keys = nav({});
    assert.equal(keys.includes("tickets"), false);
    assert.equal(keys.includes("stage"), false);
    assert.equal(keys.includes("applicants"), false);
    for (const always of ["dashboard", "onboarding", "contacts", "checklist", "files", "shop"]) {
      assert.ok(keys.includes(always as never), `fehlt: ${always}`);
    }
  });

  it("blendet Tickets nur mit Ticket-Produkt ein", () => {
    assert.equal(
      nav({ products: [product({ sku: "I-32776", category: "tickets" })] }).includes("tickets"),
      true,
    );
    assert.equal(nav({ products: [product({ category: "standflaeche" })] }).includes("tickets"), false);
    // Das Team kann ein Kontingent auch ohne passendes Produkt eintragen.
    assert.equal(nav({ has_allocations: true }).includes("tickets"), true);
  });

  /**
   * Review PR #14: Bewerber hängen nicht an Produktkategorien. `stage_products`
   * enthält auch reine Speaking-Slots ohne Bewerbungsverfahren, und die
   * Kategorien hießen im Code ohnehin anders als im Vokabular.
   */
  it("blendet Bewerber an den Sessions der Org ein, nicht an Kategorien", () => {
    assert.equal(nav({ sessions_count: 1 }).includes("applicants"), true);
    assert.equal(nav({ sessions_count: 0 }).includes("applicants"), false);
    assert.equal(
      nav({ products: [product({ category: "stage_products" })] }).includes("applicants"),
      false,
      "Kategorie allein reicht nicht",
    );
    assert.equal(
      nav({ products: [product({ category: "company_tours" })] }).includes("applicants"),
      false,
    );
  });

  it("blendet die Bühne bei eigener Bühne oder Bühnenprodukt ein", () => {
    assert.equal(nav({ has_stage: true }).includes("stage"), true);
    assert.equal(nav({ products: [product({ sku: STAGE_SKU })] }).includes("stage"), true);
    assert.equal(
      nav({ products: [product({ sku: "I-50131", category: "standflaeche" })] }).includes("stage"),
      false,
    );
  });
});

/**
 * Übersetzungen nützen nichts, wenn der Schlüssel nie ankommt: `toRpcFailure`
 * kennt einen P0001-Schlüssel nur, wenn er in `BUSINESS_KEYS` steht. Genau
 * das ist beim Bau einmal durchgerutscht.
 */
describe("Fehlerschlüssel des Partner-Kontrakts", () => {
  const CASES: { code: string; message: string; key: string }[] = [
    { code: "P0001", message: "primary_exists", key: "primary_exists" },
    { code: "P0001", message: "primary_required", key: "primary_required" },
    { code: "P0001", message: "suppressed", key: "suppressed" },
    { code: "P0001", message: "not_editable", key: "not_editable" },
    { code: "22023", message: "invalid_email", key: "invalid_email" },
    { code: "22023", message: "invalid_pass_type", key: "invalid_pass_type" },
    { code: "22023", message: "roles_required", key: "roles_required" },
    { code: "22023", message: "invalid_role", key: "invalid_role" },
    { code: "22023", message: "invalid_kind", key: "invalid_kind" },
    { code: "22023", message: "path_mismatch", key: "path_mismatch" },
    { code: "22023", message: "file_rules", key: "file_rules" },
    { code: "22023", message: "asset_required", key: "asset_required" },
    { code: "22023", message: "answers_required", key: "answers_required" },
    { code: "P0002", message: "org_edition_not_found", key: "org_edition_not_found" },
    { code: "P0002", message: "object_not_found", key: "object_not_found" },
    { code: "P0002", message: "deliverable_not_found", key: "deliverable_not_found" },
    { code: "P0002", message: "asset_not_found", key: "asset_not_found" },
    { code: "P0002", message: "org_not_found", key: "org_not_found" },
    { code: "42501", message: "not allowed", key: "not_allowed" },
    { code: "28000", message: "not authenticated", key: "not_authenticated" },
    // Messeshop
    { code: "P0001", message: "phase_closed", key: "phase_closed" },
    { code: "P0001", message: "late_only", key: "late_only" },
    { code: "P0001", message: "not_available", key: "not_available" },
    { code: "P0001", message: "order_pending", key: "order_pending" },
    { code: "P0001", message: "out_of_stock", key: "out_of_stock" },
    { code: "22023", message: "empty_order", key: "empty_order" },
    { code: "22023", message: "request_only", key: "request_only" },
    { code: "22023", message: "unknown_sku", key: "unknown_sku" },
    { code: "22023", message: "text_required", key: "text_required" },
    { code: "P0002", message: "order_not_found", key: "order_not_found" },
    { code: "P0001", message: "answers_incomplete", key: "answers_incomplete" },
    { code: "P0001", message: "fulfilled_by_order", key: "fulfilled_by_order" },
    { code: "22023", message: "quantity_required", key: "quantity_required" },
    // Partner-Admin (B9)
    { code: "22023", message: "invalid_status", key: "invalid_status" },
    { code: "22023", message: "invalid_quantity", key: "invalid_quantity" },
    { code: "22023", message: "invalid_sku", key: "invalid_sku" },
    { code: "22023", message: "invalid_category", key: "invalid_category" },
    { code: "22023", message: "fields_required", key: "fields_required" },
    { code: "22023", message: "note_required", key: "note_required" },
    { code: "P0001", message: "not_pending", key: "not_pending" },
    { code: "P0002", message: "allocation_not_found", key: "allocation_not_found" },
    { code: "P0002", message: "request_not_found", key: "request_not_found" },
    { code: "P0002", message: "edition_not_found", key: "edition_not_found" },
    { code: "P0002", message: "template_not_found", key: "template_not_found" },
    { code: "P0002", message: "sync_error_not_found", key: "sync_error_not_found" },
  ];

  for (const c of CASES) {
    it(`${c.message} wird zu ${c.key} und hat einen Text`, () => {
      const f = toRpcFailure({ code: c.code, message: c.message } as never);
      assert.equal(f.key, c.key);
      assert.ok(de.rpc[c.key as keyof typeof de.rpc], `Text fehlt in de.json: ${c.key}`);
      assert.ok(en.rpc[c.key as keyof typeof en.rpc], `Text fehlt in en.json: ${c.key}`);
    });
  }
});

/**
 * `publish_session` verlangt `is_programme_editor()` — Admin oder
 * Programm-Team. Staff allein genügt nicht, ein Bühnen-Editor schon gar nicht.
 */
describe("Wer im Board veröffentlichen darf", () => {
  it("Admin und Programm-Team", () => {
    assert.equal(canPublishSessions(["admin"]), true);
    assert.equal(canPublishSessions(["programme_team"]), true);
    assert.equal(canPublishSessions(["programme_team", "speaker_manager"]), true);
  });

  it("sonst niemand", () => {
    for (const roles of [
      [],
      ["standbuehne_editor"],
      ["partner_contact"],
      ["speaker_manager"],
      ["area_lead_speaker"],
      ["area_lead_partner"],
      ["production_team"],
    ]) {
      assert.equal(canPublishSessions(roles), false, `darf nicht: ${roles.join(",") || "ohne Rolle"}`);
    }
  });
});
