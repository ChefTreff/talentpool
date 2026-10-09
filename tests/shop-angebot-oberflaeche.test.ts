import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { cartOf, type ShopOrder } from "@/app/(partner)/partner/types";
import { mitAblauf } from "@/app/(admin)/admin/partner/bestellungen/angebote";
import { ANGEBOT_NETZWERK, angebotAnfordern, anfrageMailto } from "@/lib/partner/angebot-anfordern";

/**
 * PART-116 (K-81), Teil 2 — die Oberfläche zum Angebot: der Aufruf im Warenkorb, der Warenkorb als „festgesetzt“, die Übersicht „Offene Angebote“ im Admin.
 * Komponenten lädt der Testlader nicht (JSX); geprüft wird deshalb, was reine Funktionen leisten, und an den Quelltexten, dass die Teile zusammenhängen:
 * der Knopf nur beim offenen Entwurf, erst die Rückfrage, dann der Aufruf, die Knöpfe auf der Akzentfläche als `onAccent`, jeder Text in beiden Sprachen.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(quelle(`lib/i18n/${sprache}.json`)) as {
    partnerShop: Record<string, string>;
    adminPartner: Record<string, string>;
    rpc: Record<string, string>;
  };

const WARENKORB = quelle("app/(partner)/partner/shop/warenkorb/Warenkorb.tsx");
const ADD_TO_CART = quelle("app/(partner)/partner/shop/AddToCart.tsx");
const LOAD = quelle("app/(partner)/partner/shop/load.ts");
const ORDERS_VIEW = quelle("app/(admin)/admin/partner/bestellungen/OrdersView.tsx");
const ORDERS_PAGE = quelle("app/(admin)/admin/partner/bestellungen/page.tsx");

// ---- Aufruf der Route -------------------------------------------------------------------------------------------------------------------

type Aufruf = { url: string; init: RequestInit };
const mitAntwort = (status: number, body: unknown, aufrufe: Aufruf[] = []): typeof fetch =>
  (async (url: string, init: RequestInit) => {
    aufrufe.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;

describe("angebotAnfordern: was die Route antwortet, wird zum Ergebnis", () => {
  it("schickt nur die Bestellnummer — die Organisation kommt aus der Sitzung, nie aus dem Request", async () => {
    const aufrufe: Aufruf[] = [];
    await angebotAnfordern("11111111-1111-4111-8111-111111111111", mitAntwort(200, { ok: true, number: "AN-1", validUntil: "2026-11-10", probe: false }, aufrufe));
    assert.equal(aufrufe.length, 1);
    assert.equal(aufrufe[0].url, "/api/partner/shop/angebot");
    assert.equal(aufrufe[0].init.method, "POST");
    assert.deepEqual(JSON.parse(String(aufrufe[0].init.body)), { orderId: "11111111-1111-4111-8111-111111111111" });
  });

  it("Erfolg: Nummer, Frist, Probe-Kennzeichen", async () => {
    assert.deepEqual(await angebotAnfordern("x", mitAntwort(200, { ok: true, number: "AN-2026-0042", validUntil: "2026-11-10", probe: false })), {
      ok: true,
      number: "AN-2026-0042",
      validUntil: "2026-11-10",
      probe: false,
    });
    const probe = await angebotAnfordern("x", mitAntwort(200, { ok: true, number: "AN-PROBE-0001", validUntil: "2026-11-10", probe: true }));
    assert.equal(probe.ok && probe.probe, true);
    // ohne Angabe ist es kein Probeangebot — nur ein ausdrückliches `true` macht eines daraus
    assert.deepEqual(await angebotAnfordern("x", mitAntwort(200, { ok: true, number: "AN-1", validUntil: "2026-11-10" })), {
      ok: true,
      number: "AN-1",
      validUntil: "2026-11-10",
      probe: false,
    });
  });

  it("Fehler: der Schlüssel der Route, den die Oberfläche in `rpc.*` nachschlägt — mit Detail, wenn es eines gibt", async () => {
    assert.deepEqual(await angebotAnfordern("x", mitAntwort(409, { ok: false, error: "quote_limit_reached" })), { ok: false, key: "quote_limit_reached" });
    assert.deepEqual(await angebotAnfordern("x", mitAntwort(422, { ok: false, error: "quote_failed", detail: "422" })), { ok: false, key: "quote_failed", detail: "422" });
  });

  it("eine Antwort, die nicht nach unserer Route aussieht, wird zu „unknown“ — nie zu einem halben Erfolg", async () => {
    assert.deepEqual(await angebotAnfordern("x", mitAntwort(502, "<html>Bad Gateway</html>")), { ok: false, key: "unknown" });
    assert.deepEqual(await angebotAnfordern("x", mitAntwort(200, { ok: true })), { ok: false, key: "unknown" }, "ohne Nummer und Frist ist es kein Angebot");
    assert.deepEqual(await angebotAnfordern("x", mitAntwort(200, { ok: true, number: "AN-1" })), { ok: false, key: "unknown" }, "ohne Frist ebenso");
    assert.deepEqual(await angebotAnfordern("x", mitAntwort(200, { ok: true, validUntil: "2026-11-10" })), { ok: false, key: "unknown" }, "ohne Nummer ebenso");
    assert.deepEqual(await angebotAnfordern("x", mitAntwort(200, { number: "AN-1", validUntil: "2026-11-10" })), { ok: false, key: "unknown" }, "ohne `ok: true` ebenso");
    assert.deepEqual(
      await angebotAnfordern("x", mitAntwort(200, { ok: false, number: "AN-1", validUntil: "2026-11-10", error: "quote_failed" })),
      { ok: false, key: "quote_failed" },
      "ein ausdrückliches `ok: false` ist ein Fehler, auch wenn Nummer und Frist dabeistehen",
    );
    assert.deepEqual(await angebotAnfordern("x", mitAntwort(500, { ok: true, number: "AN-1", validUntil: "2026-11-10" })), { ok: false, key: "unknown" }, "ein Fehlerstatus ist nie ein Erfolg");
    assert.deepEqual(await angebotAnfordern("x", mitAntwort(500, { ok: false, error: "" })), { ok: false, key: "unknown" });
  });

  it("Die Verbindung reißt ab: eigener Schlüssel, damit die Oberfläche sagt, dass das Angebot trotzdem entstanden sein kann", async () => {
    const kaputt = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    assert.deepEqual(await angebotAnfordern("x", kaputt), { ok: false, key: ANGEBOT_NETZWERK });
  });
});

describe("anfrageMailto: „Angebot beim Team anfragen“", () => {
  const text = "Hallo Partner-Team,\n\nOrganisation: Müller & Söhne\nSumme netto: 1.234,50 €";
  const link = anfrageMailto({ mailbox: "partner@chef-treff.de", subject: "Angebot anfragen – Müller & Söhne", body: text });

  it("ist ein mailto an das Partner-Postfach mit Betreff und Text", () => {
    assert.match(link, /^mailto:partner@chef-treff\.de\?subject=.+&body=.+$/);
  });

  it("Umlaute, kaufmännisches Und und Zeilenumbrüche überstehen den Link", () => {
    const query = new URLSearchParams(link.slice(link.indexOf("?") + 1));
    assert.equal(query.get("subject"), "Angebot anfragen – Müller & Söhne");
    assert.equal(query.get("body"), text);
    assert.ok(!link.includes("\n") && !link.includes(" "), "kein rohes Leerzeichen oder Zeilenende im Link");
  });
});

// ---- Warenkorb und Liste ------------------------------------------------------------------------------------------------------------------

const bestellung = (id: string, status: ShopOrder["status"], editable = true) =>
  ({
    id,
    order_no: id,
    phase: 1,
    status,
    note: null,
    po_number: null,
    confirmed_at: null,
    completed_at: null,
    cancelled_at: null,
    net_cents: 0,
    vat_cents: 0,
    gross_cents: 0,
    lines: [],
    editable,
    created_at: "",
    updated_at: "",
  }) satisfies ShopOrder;

describe("Der festgesetzte Warenkorb ist weiter der Warenkorb", () => {
  it("ein Angebot ist der Warenkorb — dort steht es, dort wird bestellt oder zurückgezogen (die Datenbank sagt `editable: false`)", () => {
    assert.equal(cartOf([bestellung("a", "completed", false), bestellung("q", "quoted", false)])?.id, "q");
  });

  it("der Entwurf geht vor, das Angebot vor der wieder geöffneten Bestellung", () => {
    assert.equal(cartOf([bestellung("q", "quoted", false), bestellung("d", "draft")])?.id, "d");
    assert.equal(cartOf([bestellung("e", "editing"), bestellung("q", "quoted", false)])?.id, "q");
  });

  it("bestellte, abgeschlossene und stornierte Bestellungen bleiben in der Historie", () => {
    for (const status of ["pending", "completed", "cancelled"] as const) assert.equal(cartOf([bestellung("a", status)]), null, status);
  });

  it("eine wieder geöffnete Bestellung, die nicht mehr bearbeitbar ist (frühere Phase), ist kein Warenkorb", () => {
    assert.equal(cartOf([bestellung("e", "editing", false)]), null);
  });
});

describe("mitAblauf: das Team sieht, welches Angebot schon verfallen ist", () => {
  const zeile = (id: string, validUntil: string | null) => ({
    order_id: id,
    order_no: id,
    org_id: "o",
    org_name: "Beispiel GmbH",
    edition_id: "e",
    quote_number: validUntil ? "AN-1" : null,
    valid_until: validUntil,
    net_cents: 1000,
    probe: false,
    started_at: null,
  });
  const jetzt = Date.parse("2026-11-10T12:00:00Z");

  it("vorbei = verfallen, danach nicht; ohne Frist (Erstellung läuft) nie", () => {
    const r = mitAblauf([zeile("alt", "2026-11-09T22:59:59Z"), zeile("heute", "2026-11-10T22:59:59Z"), zeile("laeuft", null)], jetzt);
    assert.deepEqual(r.map((x) => [x.order_id, x.expired]), [["alt", true], ["heute", false], ["laeuft", false]]);
  });

  it("verändert die übrigen Felder nicht", () => {
    const [r] = mitAblauf([zeile("a", "2026-11-09T00:00:00Z")], jetzt);
    assert.equal(r.net_cents, 1000);
    assert.equal(r.org_name, "Beispiel GmbH");
  });
});

// ---- Verdrahtung der Oberfläche (Quelltext) ------------------------------------------------------------------------------------------------

describe("Warenkorb: „Angebot erstellen“ steht dort, wo es durchgeht — und erst nach der Rückfrage", () => {
  it("der Knopf gehört zu einem offenen Entwurf mit Bestellrecht und zu einem möglichen Angebot (nicht bei Limit, nicht ohne Weg)", () => {
    assert.match(WARENKORB, /const canQuote = canOrder && cart\.status === "draft" && cart\.editable;/);
    assert.match(WARENKORB, /\{canQuote && angebot\.ok && !limitReached && \(\s*<Button\s+variant="secondary"/);
  });

  it("der Knopf öffnet die Rückfrage; der Aufruf an die Route steht nur in deren Bestätigung", () => {
    assert.match(WARENKORB, /onClick=\{\(\) => setAskQuote\(true\)\}/);
    const aufrufe = WARENKORB.match(/\bvoid createQuote\(\)|\bawait createQuote\(\)|(?<!function )\bcreateQuote\(\)/g) ?? [];
    assert.equal(aufrufe.length, 1, "createQuote() wird genau einmal aufgerufen");
    const dialog = WARENKORB.slice(WARENKORB.indexOf("{askQuote && ("), WARENKORB.indexOf("{askReopen && ("));
    assert.match(dialog, /onConfirm=\{\(\) => \{\s*setAskQuote\(false\);\s*void createQuote\(\);/);
  });

  it("nach dem Aufruf wird immer neu geladen — auch nach einem Fehler, denn bei abgerissener Verbindung kann das Angebot schon dastehen", () => {
    const fn = WARENKORB.slice(WARENKORB.indexOf("async function createQuote()"), WARENKORB.indexOf("return (", WARENKORB.indexOf("async function createQuote()")));
    assert.match(fn, /await angebotAnfordern\(cart\.id\)/);
    assert.match(fn, /\n\s*router\.refresh\(\);\s*\}\s*$/, "refresh ist die letzte Anweisung, allein auf der Zeile — nicht in einem if oder else");
    assert.match(fn, /res\.key === ANGEBOT_NETZWERK \? t\.quoteNetwork : message\(res\.key\)/);
    assert.ok(!/res\.detail/.test(fn), "Einzelheiten aus SevDesk gehören nicht in eine Meldung an Partner");
  });

  it("die Kasse bleibt beim festgesetzten Warenkorb offen, solange das Angebot gilt — sonst nur beim bearbeitbaren", () => {
    assert.match(WARENKORB, /const quoteOrderable = quoteStanding && !quoteExpired;/);
    assert.match(WARENKORB, /const checkoutOpen = canOrder && \(cart\.editable \|\| quoteOrderable\);/);
    assert.match(WARENKORB, /\{checkoutOpen && \(\s*<section aria-labelledby="h-checkout">/);
  });

  it("ohne `valid_until` läuft die Erstellung noch: kein Bestellen, nur „Aktualisieren“", () => {
    assert.match(WARENKORB, /const quoteBuilding = quoted && quote\?\.valid_until == null;/);
    assert.match(WARENKORB, /const quoteStanding = quoted && quote\?\.valid_until != null;/);
  });

  it("die Knöpfe auf der Akzentfläche sind `onAccent` (accent-strong auf accent-soft käme nur auf 4,4:1), und nirgends steht dort secondary oder ghost", () => {
    const start = WARENKORB.indexOf('<div role="note"');
    const ende = WARENKORB.indexOf("\n      )}", start);
    const hinweis = WARENKORB.slice(start, ende);
    assert.ok(start > 0 && hinweis.length > 500, "der Hinweis ist gefunden");
    assert.equal((hinweis.match(/variant="onAccent"/g) ?? []).length, 3, "Aktualisieren, PDF, Wieder bearbeiten (nach Ablauf)");
    assert.ok(!/variant="(secondary|ghost|primary)"/.test(hinweis));
  });

  it("das PDF gibt es nicht im Probebetrieb und nicht nach Ablauf", () => {
    assert.match(WARENKORB, /\{!quote\?\.probe && !quoteExpired && \(\s*<div className="mt-3">\s*<ButtonDownload[^>]*href=\{`\/api\/partner\/shop\/angebot\/\$\{cart\.id\}\/pdf`\}/);
  });

  it("„Warenkorb wieder bearbeiten“ steht neben „Verbindlich bestellen“, und nach Ablauf im Hinweis (dort gibt es keine Kasse mehr)", () => {
    assert.match(WARENKORB, /\{quoted && \(\s*<Button variant="ghost" disabled=\{pending\} onClick=\{\(\) => setAskReopen\(true\)\}>/);
    assert.match(WARENKORB, /\{quoteExpired && canOrder && \(/);
  });

  it("kein Angebot möglich: der Grund steht da, mit dem Weg zum Team als Mailto — nie ein Knopf, der stumm fehlt", () => {
    assert.match(WARENKORB, /\{canQuote && warumNicht && \(/);
    assert.match(WARENKORB, /href=\{anfrage\}/);
    // jeder Grund hat seinen eigenen Text — ein vertauschter Text wäre eine falsche Auskunft an die Partnerin
    const text: Record<string, string> = { kundennummer: "Kundennummer", land: "Land", adresse: "Adresse", abgeschaltet: "Aus" };
    for (const [grund, wort] of Object.entries(text)) {
      assert.ok(new RegExp(`${grund}: t\\.quoteWhy${wort},`).test(WARENKORB), `Grund ${grund} hat den Text quoteWhy${wort}`);
    }
    assert.match(WARENKORB, /const warumNicht = limitReached\s*\?\s*t\.quoteLimit\s*:/, "das Limit hat vor allen anderen Gründen seinen Text");
    assert.match(WARENKORB, /const limitReached = \(quote\?\.quotes_used \?\? 0\) >= quotesMax;/, "drei Angebote sind das Limit, nicht vier");
  });

  it("die Anfrage ans Team geht an das Partner-Postfach und trägt Organisation, Kundennummer, Positionen und Netto-Summe", () => {
    assert.match(WARENKORB, /const PARTNER_MAILBOX = "partner@chef-treff\.de";/);
    assert.match(WARENKORB, /\.replace\("\{org\}", orgName\)/);
    assert.match(WARENKORB, /\.replace\("\{customerNumber\}", org\?\.customer_number \?\? "—"\)/);
    assert.match(WARENKORB, /\.replace\("\{positions\}", String\(cart\.lines\.length\)\)/);
    assert.match(WARENKORB, /\.replace\("\{net\}", money\(cart\.net_cents, dateLocale\)\)/);
  });

  it("während das Angebot entsteht, lässt sich der Warenkorb nicht stornieren", () => {
    assert.match(WARENKORB, /disabled=\{pending \|\| creating\} onClick=\{\(\) => setAskCancel\(true\)\}/);
  });

  it("zurückziehen geht über die Server-Aktion und fragt vorher", () => {
    assert.match(WARENKORB, /run\(shopQuoteWithdraw\(cart\.id\), t\.quoteWithdrawn\)/);
    const dialog = WARENKORB.slice(WARENKORB.indexOf("{askReopen && ("), WARENKORB.indexOf("{askCancel && ("));
    assert.match(dialog, /onConfirm=\{\(\) => \{\s*setAskReopen\(false\);\s*run\(shopQuoteWithdraw/);
  });

  it("im Testbetrieb sagt die Rückfrage vorher, dass es kein echtes Angebot gibt", () => {
    assert.match(WARENKORB, /const simuliert = angebot\.ok && angebot\.weg !== "sevdesk-live";/);
    assert.match(WARENKORB, /\{simuliert && <p className="ct-help mt-2">\{t\.quoteSimulatedNote\}<\/p>\}/);
  });

  it("bei festgesetztem Warenkorb sind Menge, Konfiguration und Entfernen aus (sie hängen an `cart.editable`)", () => {
    assert.equal((WARENKORB.match(/canOrder && cart\.editable/g) ?? []).length >= 3, true);
  });
});

describe("Katalog: mit einem Angebot gibt es kein „In den Warenkorb“", () => {
  it("AddToCart sperrt nach der Rollenprüfung und verweist auf den Warenkorb; Anfrage-Produkte bleiben möglich", () => {
    const reihenfolge = [ADD_TO_CART.indexOf("if (product.request_only)"), ADD_TO_CART.indexOf("if (!canOrder)"), ADD_TO_CART.indexOf("if (quoted)")];
    assert.ok(reihenfolge.every((i) => i > 0) && reihenfolge[0] < reihenfolge[1] && reihenfolge[1] < reihenfolge[2], "Anfrage, Rolle, Angebot");
    assert.match(ADD_TO_CART, /href="\/partner\/shop\/warenkorb"/);
  });

  it("Katalog und Produktseite geben den Stand weiter", () => {
    for (const datei of ["app/(partner)/partner/shop/page.tsx", "app/(partner)/partner/shop/[sku]/page.tsx"]) {
      assert.match(quelle(datei), /quoted=\{cart\?\.status === "quoted"\}/, datei);
    }
  });
});

describe("Lader: das Angebot kommt vom Server, und die Verfügbarkeit folgt denselben Regeln wie die Datenbank", () => {
  it("`shop_quote_info` wird nur für den Warenkorb gefragt", () => {
    assert.match(LOAD, /cart\s*\?\s*await supabase\.rpc\("shop_quote_info", \{ p_order_id: cart\.id \}\)/);
  });

  it("Modus aus der Umgebung, Token nur als Ja/Nein, Adresse aus den Stammdaten", () => {
    assert.match(LOAD, /modus: angebotModus\(process\.env\.SHOP_ANGEBOT_SEVDESK\)/);
    assert.match(LOAD, /hatToken: hasSevdeskToken\(\)/);
    for (const feld of ["customer_number", "address\\.country", "address\\.street", "address\\.zip", "address\\.city"]) {
      assert.match(LOAD, new RegExp(`org\\?\\.${feld}`), feld);
    }
  });

  it("verfallen heißt: aktiv, mit Frist, und die Frist liegt hinter uns", () => {
    assert.match(LOAD, /quote\?\.active === true && quote\.valid_until != null && new Date\(quote\.valid_until\)\.getTime\(\) < Date\.now\(\)/);
  });
});

describe("Admin: „Offene Angebote“ unter /admin/partner/bestellungen", () => {
  it("die Seite lädt `shop_quotes_admin` für die gewählte Edition und markiert Verfallenes auf dem Server", () => {
    assert.match(ORDERS_PAGE, /supabase\.rpc\("shop_quotes_admin", \{ p_edition_id: current\.id \}\)/);
    assert.match(ORDERS_PAGE, /quotes=\{mitAblauf\(/);
  });

  it("die Übersicht zeigt Organisation, Angebot, Frist und Netto — und Zurückziehen und Stornieren je Zeile, beides mit Rückfrage", () => {
    for (const spalte of ["quotesColOrg", "quotesColQuote", "quotesColValid", "quotesColNet"]) assert.match(ORDERS_VIEW, new RegExp(`t\\.${spalte}`), spalte);
    assert.match(ORDERS_VIEW, /onClick=\{\(\) => setAskWithdraw\(q\)\}/);
    assert.match(ORDERS_VIEW, /onClick=\{\(\) => setAskCancelQuote\(q\)\}/);
    assert.match(ORDERS_VIEW, /run\(adminQuoteWithdraw\(q\.order_id\), t\.quotesWithdrawn\)/);
    assert.match(ORDERS_VIEW, /run\(adminSetOrderStatus\(q\.order_id, "cancelled", ""\), t\.saved\)/);
  });

  it("Probe, laufende Erstellung und Verfall sind in Worten sichtbar, nicht nur in Farbe", () => {
    assert.match(ORDERS_VIEW, /\{q\.probe && <Badge tone="warning">\{t\.quotesProbe\}<\/Badge>\}/);
    assert.match(ORDERS_VIEW, /<Badge tone="neutral">\{t\.quotesInProgress\}<\/Badge>/);
    assert.match(ORDERS_VIEW, /\{q\.expired && <Badge tone="error">\{t\.quotesExpired\}<\/Badge>\}/);
  });

  it("ein festgesetzter Warenkorb in der Bestellliste hat keinen frei wählbaren Stand und keine bearbeitbaren Positionen", () => {
    assert.match(ORDERS_VIEW, /\{o\.status === "quoted" \? \(\s*<p className="ct-help max-w-80">/);
    assert.match(ORDERS_VIEW, /disabled=\{o\.status === "quoted"\}/);
    assert.match(ORDERS_VIEW, /disabled=\{pending \|\| o\.status === "quoted"\}/);
    assert.match(ORDERS_VIEW, /ORDER_TONE[^;]*quoted: "warning"/s);
  });

  it("die Aktionen rufen genau die Datenbankfunktionen der Partner auf (Rechte prüft die Datenbank)", () => {
    const admin = quelle("app/(admin)/admin/partner/actions.ts");
    const partner = quelle("app/(partner)/partner/actions.ts");
    assert.match(admin, /export async function adminQuoteWithdraw\(orderId: string\)[\s\S]*?supabase\.rpc\("shop_quote_withdraw", \{ p_order_id: orderId \}\)/);
    assert.match(partner, /export async function shopQuoteWithdraw\(orderId: string\)[\s\S]*?supabase\.rpc\("shop_quote_withdraw", \{ p_order_id: orderId \}\)/);
  });
});

// ---- Wörterbücher ---------------------------------------------------------------------------------------------------------------------------

/** Sie-Ansprache: „Sie“ und „Ihre/Ihrem/Ihren/Ihrer/Ihres“. Ein einzelnes „Ihr“ ist ein Satzanfang in der Ihr-Ansprache („Ihr bestellt …“). */
const SIEZEN = /\bSie\b|\bIhre[mnrs]?\b/;
const platzhalter = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const schluessel = (text: string, muster: RegExp) => [...new Set([...text.matchAll(muster)].map((m) => m[1]))].sort();

describe("Texte: jeder Schlüssel der Oberfläche steht in beiden Sprachen, mit denselben Platzhaltern", () => {
  const de = woerterbuch("de");
  const en = woerterbuch("en");

  it("Partner-Shop: alles, was Warenkorb und AddToCart als `t.quote…` lesen", () => {
    const verwendet = [...schluessel(WARENKORB, /\bt\.(quote[A-Za-z]+)\b/g), ...schluessel(ADD_TO_CART, /\bt\.(quote[A-Za-z]+)\b/g)];
    assert.ok(verwendet.length >= 30, `es wurden ${verwendet.length} Schlüssel gefunden`);
    for (const k of verwendet) {
      assert.ok(de.partnerShop[k], `de.partnerShop.${k}`);
      assert.ok(en.partnerShop[k], `en.partnerShop.${k}`);
      assert.equal(platzhalter(de.partnerShop[k]), platzhalter(en.partnerShop[k]), `Platzhalter von ${k}`);
    }
  });

  it("Admin: alles, was die Übersicht als `t.quotes…` oder `t.orderQuoted…` liest", () => {
    const verwendet = [...schluessel(ORDERS_VIEW, /\bt\.(quotes[A-Za-z]+|orderQuoted[A-Za-z]*)\b/g)];
    assert.ok(verwendet.length >= 18, `es wurden ${verwendet.length} Schlüssel gefunden`);
    for (const k of verwendet) {
      assert.ok(de.adminPartner[k], `de.adminPartner.${k}`);
      assert.ok(en.adminPartner[k], `en.adminPartner.${k}`);
      assert.equal(platzhalter(de.adminPartner[k]), platzhalter(en.adminPartner[k]), `Platzhalter von ${k}`);
    }
  });

  it("der Stand „quoted“ hat in beiden Wörterbüchern ein Wort (die Listen schlagen `order_<status>` nach)", () => {
    for (const d of [de, en]) {
      assert.ok(d.partnerShop.order_quoted, "partnerShop.order_quoted");
      assert.ok(d.adminPartner.order_quoted, "adminPartner.order_quoted");
    }
  });

  it("jeder Platzhalter, den der Code ersetzt, steht auch im Text", () => {
    const ersetzt: Array<[string, string]> = [
      ["quoteTitle", "number"],
      ["quoteValidUntil", "date"],
      ["quoteExpiredOn", "date"],
      ["quoteReopenBody", "n"],
      ["quoteOrderHint", "number"],
      ["quoteMailSubject", "org"],
      ["quoteMailBody", "org"],
      ["quoteMailBody", "customerNumber"],
      ["quoteMailBody", "positions"],
      ["quoteMailBody", "net"],
    ];
    for (const [k, p] of ersetzt) {
      for (const d of [de, en]) assert.ok(d.partnerShop[k].includes(`{${p}}`), `${k} enthält {${p}}`);
      assert.match(WARENKORB, new RegExp(`replace\\(\\s*"\\{${p}\\}"`), `der Code ersetzt {${p}}`);
    }
  });

  it("die Fehlermeldungen der Route stehen unter `rpc.*` — deutsch in der Ihr-Ansprache, englisch nicht gleich", () => {
    const rpc = quelle("lib/rpc-error.ts");
    for (const k of ["quote_unavailable", "quote_failed", "quote_record_failed", "quote_contact_ambiguous", "quote_limit_reached", "quote_expired", "quote_in_progress", "order_quoted", "not_quoted"]) {
      assert.match(rpc, new RegExp(`"${k}",`), `BUSINESS_KEYS: ${k}`);
      assert.ok(de.rpc[k] && en.rpc[k], `rpc.${k} in beiden Sprachen`);
      assert.notEqual(de.rpc[k], en.rpc[k], `rpc.${k} nicht in beiden gleich`);
      assert.ok(!SIEZEN.test(de.rpc[k]), `rpc.${k}: ihr, nicht Sie`);
    }
  });

  it("deutsche Partnertexte sprechen ihr/euch, nicht Sie", () => {
    const partner = Object.keys(de.partnerShop).filter((x) => x.startsWith("quote"));
    assert.ok(partner.length >= 30);
    for (const k of partner) assert.ok(!SIEZEN.test(de.partnerShop[k]), `partnerShop.${k}`);
  });
});
