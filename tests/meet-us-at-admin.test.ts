import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import de from "@/lib/i18n/de.json" with { type: "json" };
import en from "@/lib/i18n/en.json" with { type: "json" };

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ohneKommentare = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const SEITE = "app/(admin)/admin/grafiken/meet-us-at/page.tsx";

describe("Meet us at im Admin: der Weg ohne neues Recht (PART-097)", () => {
  it("die Seite zieht das Gate des Abschnitts Grafiken und liest nur die Partnerliste des Marketings", () => {
    const q = ohneKommentare(src(SEITE));
    assert.match(q, /requireAdminSection\("graphics"/);
    assert.match(q, /rpc\("partner_graphics_admin"/);
    // Logo und Kontakte eines Partners darf das Marketing nicht lesen (Plan 04.10.): `is_partner_team()`
    // kennt die Rolle nicht, und eine Lesefunktion öffnete Kontakte und Bestellungen aller Partner.
    for (const verboten of ["my_partner_assets", "partner_contacts", "partner_overview", "createSignedUrl", "service"]) {
      assert.ok(!q.includes(verboten), `die Seite benutzt ${verboten}`);
    }
  });

  it("die Seite ruft den Generator ohne Logo und ohne Kontakte auf, mit dem Ablegen in die Liste zurück", () => {
    const q = ohneKommentare(src(SEITE));
    assert.match(q, /logo=\{null\}/);
    assert.match(q, /kontakte=\{\[\]\}/);
    assert.match(q, /ablegen=\{\{ orgId: partner\.org_id, editionId: edition\.id, zurueck: "\/admin\/grafiken" \}\}/);
  });

  it("ohne Edition, ohne Organisation oder mit einer fremden Organisation gibt es 404", () => {
    const q = ohneKommentare(src(SEITE));
    assert.match(q, /if \(!edition \|\| !org\) notFound\(\)/);
    assert.match(q, /if \(!partner\) notFound\(\)/);
    // gesucht wird in der Liste der Edition, nicht blind nach der Adresse
    assert.match(q, /\.find\(\(z\) => z\.org_id === org\)/);
  });

  it("die Liste der Partnergrafiken verweist je Partner auf den Generator", () => {
    const q = src("app/(admin)/admin/grafiken/PartnergrafikenAdmin.tsx");
    assert.match(q, /href=\{`\/admin\/grafiken\/meet-us-at\?org=\$\{z\.org_id\}`\}/);
    assert.match(src("app/(admin)/admin/grafiken/page.tsx"), /generate: g\.partnerGraphicsGenerate/);
  });

  it("der Upload steht an einer Stelle: Liste und Generator rufen `partnergrafikAblegen`", () => {
    const liste = src("app/(admin)/admin/grafiken/PartnergrafikenAdmin.tsx");
    const generator = src("components/partner/MeetUsAt.tsx");
    const helfer = src("components/partner/partnergrafik-upload.ts");
    assert.match(liste, /partnergrafikAblegen\(orgId, editionId, file\)/);
    assert.match(generator, /partnergrafikAblegen\(ablegen\.orgId, ablegen\.editionId, datei\)/);
    assert.doesNotMatch(liste, /uploadToSignedUrl|api\/admin\/partnergrafik/, "keine zweite Kopie in der Liste");
    assert.doesNotMatch(generator, /uploadToSignedUrl|api\/admin\/partnergrafik/, "keine Kopie im Generator");
    assert.match(helfer, /api\/admin\/partnergrafik\?step=url/);
    assert.match(helfer, /uploadToSignedUrl/);
  });

  it("der Generator legt nur mit `ablegen` ab; dann ist das Ablegen die Hauptaktion, das Herunterladen die zweite", () => {
    const q = src("components/partner/MeetUsAt.tsx");
    assert.match(q, /if \(!ablegen\) return;/);
    assert.match(q, /\{ablegen && \(\s*<Button[^>]*onClick=\{\(\) => void alsPartnergrafikAblegen\(\)\}/);
    assert.match(q, /variant=\{ablegen \? "secondary" : "primary"\}/);
  });

  it("das Partner-Portal ruft den Generator ohne `ablegen` auf: dort wird nichts abgelegt", () => {
    assert.doesNotMatch(src("app/(partner)/partner/media/grafik/page.tsx"), /ablegen/);
  });
});

describe("Meet us at im Admin: Wörterbücher", () => {
  it("DE und EN haben dieselben Schlüssel", () => {
    assert.deepEqual(Object.keys(de.adminMeetUs).sort(), Object.keys(en.adminMeetUs).sort());
    assert.ok(de.adminGrafiken.partnerGraphicsGenerate && en.adminGrafiken.partnerGraphicsGenerate);
  });

  it("jeder Schlüssel des Admins ersetzt einen des Partner-Portals oder gehört zum Ablegen", () => {
    const partner = new Set(Object.keys(de.partnerMeetUs));
    const neu = new Set(["store", "storing", "storeHint", "stored", "storeFailed", "storeNotAllowed"]);
    for (const k of Object.keys(de.adminMeetUs)) {
      assert.ok(partner.has(k) || neu.has(k), `adminMeetUs.${k} gehört weder zu den Ersetzungen noch zum Ablegen`);
    }
    for (const k of neu) assert.ok(k in de.adminMeetUs, `adminMeetUs.${k} fehlt`);
  });

  it("die Lead-Zeile nennt den Partner über den Platzhalter {org}", () => {
    assert.match(de.adminMeetUs.lead, /\{org\}/);
    assert.match(en.adminMeetUs.lead, /\{org\}/);
  });
});

describe("partnergrafikAblegen: prüft vor dem Netz und wirft nie", () => {
  it("lehnt ein falsches Format und eine zu große Datei ab, ohne eine Anfrage zu stellen", async () => {
    const { partnergrafikAblegen } = await import("@/components/partner/partnergrafik-upload");
    const falsch = await partnergrafikAblegen("org", "edition", new File(["x"], "a.txt", { type: "text/plain" }));
    assert.deepEqual(falsch, { ok: false, key: "wrong_type" });
    const gross = new File(["x"], "a.png", { type: "image/png" });
    Object.defineProperty(gross, "size", { value: 26 * 1024 * 1024 });
    assert.deepEqual(await partnergrafikAblegen("org", "edition", gross), { ok: false, key: "too_large" });
  });

  it("ein Netzfehler ist ein Ergebnis, kein Absturz", async () => {
    const { partnergrafikAblegen } = await import("@/components/partner/partnergrafik-upload");
    const echt = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError("Netz weg");
    }) as typeof fetch;
    try {
      const r = await partnergrafikAblegen("org", "edition", new File(["x"], "a.png", { type: "image/png" }));
      assert.equal(r.ok, false);
    } finally {
      globalThis.fetch = echt;
    }
  });
});
