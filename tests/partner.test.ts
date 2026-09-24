import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { acceptAttribute, checkFileRules, extensionOf } from "@/lib/partner/file-rules";
import { visibleNavKeys, type NavInput } from "@/app/(partner)/partner/nav";
import type { PartnerProduct } from "@/app/(partner)/partner/types";
import { toRpcFailure } from "@/lib/rpc-error";
import { canPublishSessions } from "@/components/programme/permissions";
import { CONTACT_ROLES, toggleContactRole } from "@/components/partner/contacts";
import { ccPersonIds } from "@/lib/mail/cc";
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
  format_key: null,
  ...p,
});

const nav = (input: Partial<NavInput>) =>
  visibleNavKeys({
    products: [],
    sessions_count: 0,
    has_stage: false,
    has_booth: false,
    has_allocations: false,
    ...input,
  });

describe("Menü folgt den gebuchten Leistungen", () => {
  it("zeigt ohne Produkte nur das, was jede Org hat", () => {
    const keys = nav({});
    assert.equal(keys.includes("tickets"), false);
    assert.equal(keys.includes("stage"), false);
    assert.equal(keys.includes("applicants"), false);
    // Seit PART-037 gehört der Messeshop zum Messestand.
    assert.equal(keys.includes("shop"), false);
    for (const always of ["dashboard", "onboarding", "contacts", "checklist", "files"]) {
      assert.ok(keys.includes(always as never), `fehlt: ${always}`);
    }
  });

  /**
   * PART-037, Konrads Antwort vom 17.09.: Der Messeshop verkauft Mobiliar,
   * Technik und Gastronomie für die Standfläche. Als Stand zählen die
   * Standflächen-Pakete und die Standbühne — der Hackathon-Stand nicht.
   * Das Lunch-Paket bleibt trotzdem für alle bestellbar, aber über die
   * Checkliste (PART-049), nicht über den Katalog.
   */
  it("öffnet den Messeshop nur mit Messestand", () => {
    assert.equal(
      nav({ products: [product({ sku: "I-50131", format_key: "booth" })] }).includes("shop"),
      true,
      "Standfläche öffnet den Shop",
    );
    assert.equal(
      nav({ products: [product({ sku: "I-79895", format_key: "stage" })] }).includes("shop"),
      true,
      "Standbühne öffnet den Shop",
    );
    assert.equal(
      nav({ products: [product({ sku: "I-10729", format_key: "hackathon" })] }).includes("shop"),
      false,
      "Hackathon-Stand öffnet den Shop nicht",
    );
    // Ein vom Team zugewiesener Stand zählt wie ein gebuchtes Produkt.
    assert.equal(nav({ has_booth: true }).includes("shop"), true);
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
    assert.equal(
      nav({ products: [product({ sku: "I-79895", format_key: "stage" })] }).includes("stage"),
      true,
    );
    assert.equal(
      nav({
        products: [product({ sku: "I-50131", category: "standflaeche", format_key: "booth" })],
      }).includes("stage"),
      false,
    );
  });

  /**
   * Seit Migration 0110 entscheidet `product.format_key`, welche Format-Seite
   * ein Produkt öffnet — nicht mehr eine SKU-Liste im Code. Der Test hält
   * genau das fest: der Schlüssel am Produkt wirkt, und ohne ihn passiert
   * nichts.
   */
  it("öffnet Format-Seiten über format_key des gebuchten Produkts", () => {
    for (const key of [
      "masterclass",
      "company_tour",
      "side_event",
      "interview_table",
      "hackathon",
      "branding",
      "talk",
      "booth",
    ] as const) {
      assert.equal(
        nav({ products: [product({ format_key: key })] }).includes(key),
        true,
        `format_key ${key} öffnet die Seite nicht`,
      );
    }
  });

  it("zeigt keine Format-Seite ohne das passende Produkt", () => {
    // Ein Partner mit Mobiliar im Warenkorb hat kein Format gebucht.
    const keys = nav({ products: [product({ category: "mobiliar", format_key: null })] });
    for (const key of [
      "masterclass",
      "company_tour",
      "side_event",
      "interview_table",
      "hackathon",
      "branding",
      "talk",
      "booth",
      "stage",
    ] as const) {
      assert.equal(keys.includes(key), false, `${key} darf ohne Produkt nicht auftauchen`);
    }
  });

  /**
   * Dieselbe Kategorie, drei Seiten: `stage_products` trägt Talk, Masterclass
   * und Standbühne. Eine Regel über die Kategorie hätte alle drei vermischt —
   * der Grund, warum der Schlüssel am Artikel steht und nicht an der Kategorie.
   */
  it("trennt Talk, Masterclass und Standbühne trotz gleicher Kategorie", () => {
    const talk = nav({
      products: [product({ sku: "I-87007", category: "stage_products", format_key: "talk" })],
    });
    assert.equal(talk.includes("talk"), true);
    assert.equal(talk.includes("masterclass"), false);
    assert.equal(talk.includes("stage"), false);
  });

  /**
   * Der Interview Table hat 2027 noch keinen Artikel. Bis der Produktstamm ihn
   * anlegt, darf die Seite bei niemandem erscheinen.
   */
  it("zeigt den Interview Table nur mit Produkt", () => {
    assert.equal(nav({}).includes("interview_table"), false);
    assert.equal(
      nav({ products: [product({ format_key: "interview_table" })] }).includes("interview_table"),
      true,
    );
  });

  it("zeigt Media Kit jedem Partner, ohne Produktbindung", () => {
    assert.equal(nav({}).includes("media"), true);
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
    // Volunteers (0065)
    { code: "P0001", message: "too_young", key: "too_young" },
    { code: "P0001", message: "consent_required", key: "consent_required" },
    { code: "P0001", message: "shift_full", key: "shift_full" },
    { code: "P0001", message: "shift_overlap", key: "shift_overlap" },
    { code: "P0001", message: "not_accepted", key: "not_accepted" },
    { code: "P0001", message: "not_assigned", key: "not_assigned" },
    { code: "22023", message: "birthdate_required", key: "birthdate_required" },
    { code: "22023", message: "invalid_shirt_size", key: "invalid_shirt_size" },
    { code: "22023", message: "invalid_area", key: "invalid_area" },
    { code: "P0002", message: "profile_not_found", key: "profile_not_found" },
    { code: "P0002", message: "shift_not_found", key: "shift_not_found" },
    { code: "P0002", message: "day_not_found", key: "day_not_found" },
    { code: "P0001", message: "merch_incomplete", key: "merch_incomplete" },
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
    // Kontakte bearbeiten (PART-062)
    { code: "P0001", message: "contact_not_editable", key: "contact_not_editable" },
    { code: "P0001", message: "email_in_use", key: "email_in_use" },
    { code: "22023", message: "position_required", key: "position_required" },
    { code: "22023", message: "name_required", key: "name_required" },
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

describe("Messestand im Menü (F10)", () => {
  /**
   * Seit Migration 0110 entscheidet `format_key`, nicht die Kategorie. Für den
   * Bestand ändert sich nichts — der Seed setzt `booth` auf jedes Produkt der
   * Kategorie `standflaeche`. Neue Artikel bekommen den Schlüssel im
   * Produktstamm; die Kategorie allein reicht bewusst nicht mehr, sonst gäbe
   * es zwei Wahrheiten darüber, was eine Seite öffnet.
   */
  it("erscheint bei gebuchter Standfläche", () => {
    assert.ok(
      nav({
        products: [product({ category: "standflaeche", format_key: "booth" })],
      }).includes("booth"),
    );
  });

  it("erscheint nicht bei einer Standfläche ohne gepflegten Formatschlüssel", () => {
    assert.ok(!nav({ products: [product({ category: "standflaeche" })] }).includes("booth"));
  });

  it("erscheint auch ohne Produkt, wenn das Team einen Stand zugeordnet hat", () => {
    assert.ok(nav({ has_booth: true }).includes("booth"));
  });

  it("fehlt, wenn es weder Standfläche noch Stand gibt", () => {
    assert.ok(!nav({ products: [product({ category: "tickets" })] }).includes("booth"));
  });
});

describe("Rollen der Kontaktliste (PART-062/063)", () => {
  it("bietet den CC-Kontakt an und hat für jede Rolle eine Erklärung", () => {
    assert.ok((CONTACT_ROLES as readonly string[]).includes("cc"));
    for (const r of CONTACT_ROLES) {
      assert.ok(de.partnerContacts[`roleHelp_${r}` as keyof typeof de.partnerContacts], `DE fehlt: ${r}`);
      assert.ok(en.partnerContacts[`roleHelp_${r}` as keyof typeof en.partnerContacts], `EN fehlt: ${r}`);
    }
  });

  it("schliesst CC und operative Rollen gegenseitig aus", () => {
    assert.deepEqual(toggleContactRole(["additional", "signing"], "cc"), ["signing", "cc"]);
    assert.deepEqual(toggleContactRole(["cc"], "additional"), ["additional"]);
    assert.deepEqual(toggleContactRole(["cc"], "primary_ops"), ["primary_ops"]);
  });

  it("lässt andere Rollen stehen und nimmt eine gesetzte wieder weg", () => {
    assert.deepEqual(toggleContactRole(["cc"], "event_app_member"), ["cc", "event_app_member"]);
    assert.deepEqual(toggleContactRole(["cc", "accounting"], "cc"), ["accounting"]);
  });
});

describe("Kopie einer Mail: Personen statt Adressen (PART-063)", () => {
  const A = "0a1b2c3d-0000-4000-8000-00000000000a";
  const B = "0a1b2c3d-0000-4000-8000-00000000000b";

  it("liest die Personen aus meta.cc_person_ids", () => {
    assert.deepEqual(ccPersonIds({ cc_person_ids: [A] }, B), [A]);
  });

  it("lässt den Empfänger selbst, Doppelte und Nicht-Kennungen weg", () => {
    assert.deepEqual(ccPersonIds({ cc_person_ids: [A, A.toUpperCase(), B, "lead@firma.de", 42] }, B), [A]);
  });

  it("gibt ohne Liste nichts zurück — auch nicht für alte Adresslisten", () => {
    assert.deepEqual(ccPersonIds(null, A), []);
    assert.deepEqual(ccPersonIds({ vars: {} }, A), []);
    assert.deepEqual(ccPersonIds({ cc: ["lead@firma.de"] }, A), []);
  });
});
