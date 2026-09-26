import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { VIDEO_SCHLUESSEL } from "@/components/video/schluessel";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
type Woerterbuch = Record<string, Record<string, unknown>>;
const wb = (sprache: string) => JSON.parse(src(`lib/i18n/${sprache}.json`)) as Woerterbuch;
const block = (sprache: string, name: string) => wb(sprache)[name] as Record<string, unknown>;

/** Alle .ts/.tsx unter einem Ordner, relativ zum Repo. */
function dateien(ordner: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(ordner)) {
    const p = join(ordner, name);
    if (statSync(p).isDirectory()) out.push(...dateien(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("QS-029: Partner-Team statt Bereichsleitung", () => {
  it("der Hinweis im Partner-Admin nennt das Team", () => {
    const de = block("de", "adminPartner").noAccessBody as string;
    const en = block("en", "adminPartner").noAccessBody as string;
    assert.doesNotMatch(de, /Bereichsleitung/);
    assert.match(de, /Partner-Team/);
    assert.doesNotMatch(en, /area lead/i);
    assert.match(en, /partner team/);
  });
});

describe("PART-073: Event-App, API- gegen manuelle Anlage", () => {
  // Die Markierung von Schritt 4 (Badge „Wichtig“, aufgeklappt) kommt mit #242 aus dem
  // Design-Chat, der `Schritte.tsx` umbaut — hier nur die Erklärung im Text.
  it("Schritte 2 und 4 erklären den Unterschied in beiden Sprachen, Schritt 4 bleibt als wichtig markiert", () => {
    for (const [sprache, wort, praefix] of [["de", /Schnittstelle/, "Wichtig: "], ["en", /interface/, "Important: "]] as const) {
      const steps = block(sprache, "partnerEventApp").steps as { key: string; body: string; important?: boolean }[];
      const team = steps.find((s) => s.key === "team");
      const teilen = steps.find((s) => s.key === "leads_teilen");
      assert.ok(team && teilen);
      assert.match(team.body, wort, `${sprache}: Schritt 2`);
      assert.match(teilen.body, wort, `${sprache}: Schritt 4`);
      assert.ok(teilen.body.startsWith(praefix), `${sprache}: Schritt 4 beginnt mit „${praefix.trim()}“`);
      assert.equal(teilen.important, true);
      assert.equal(steps.indexOf(teilen), 3, "das Teilen ist Checkpunkt 4");
    }
  });
});

describe("PART-076: Warenkorb", () => {
  it("das Häkchen „Rechnungsdaten stimmen so“ steht offen auf einer Akzentfläche, bestätigt auf Grün", () => {
    const s = src("app/(partner)/partner/shop/warenkorb/Warenkorb.tsx");
    const teil = s.slice(s.indexOf("PART-076"), s.indexOf("{t.invoiceConfirm}"));
    assert.match(teil, /"border-accent bg-accent-soft"/);
    assert.match(teil, /"border-success-soft bg-success-soft"/);
    assert.match(teil, /min-h-11/, "Ziel mindestens 44 px");
    assert.match(teil, /disabled=\{!adresseVollstaendig\}/);
  });

  it("die Frist der Bestellphase ist der Countdown der Ticketseite", () => {
    const banner = src("app/(partner)/partner/shop/PhaseBanner.tsx");
    assert.match(banner, /<DeadlineCard\s+prominent/);
    assert.match(banner, /new Date\(phase\.ends_at\) > new Date\(\)/, "abgelaufen entscheidet der Server");
    const layout = src("app/(partner)/partner/shop/layout.tsx");
    for (const k of ["countdownDays", "countdownHours", "countdownSoon", "unitDays", "unitHours", "unitHour"]) {
      assert.match(layout, new RegExp(`t\\.partnerTickets\\.${k}`), `dieselben Texte wie die Ticketseite: ${k}`);
    }
  });
});

describe("PART-039 + PART-075: Anleitungen", () => {
  it("Messeshop: Pop-up nur beim ersten Besuch und nur mit Video, „Anleitung & Support“ immer", () => {
    const e = src("app/(partner)/partner/shop/ShopEinstieg.tsx");
    assert.match(e, /useSyncExternalStore/);
    assert.match(e, /window\.localStorage\.getItem\(key\)/);
    assert.match(e, /\(\) => "1",\s*\);/, "serverseitig gilt „schon gesehen“ — kein Sprung beim Hydrieren");
    assert.match(e, /\{video && \(ersterBesuch \|\| offen\) && \(/);
    assert.match(e, /<aside aria-labelledby="h-shop-hilfe"/);
    const layout = src("app/(partner)/partner/shop/layout.tsx");
    assert.match(layout, /loadVideo\("partner_shop", "partner", editionId\)/);
    assert.match(layout, /<ShopEinstieg/);
  });

  it("Event-App: die Sektion steht auch ohne Video und sagt, wann es kommt", () => {
    const p = src("app/(partner)/partner/event-app/page.tsx");
    assert.match(p, /<section aria-labelledby="h-anleitung"/);
    assert.match(p, /\{video \? \(\s*<EmbedGate/);
    assert.match(p, /\{s\.videoPending\}/);
    assert.match(p, /const WIKI_EVENT_APP = "\/partner\/wiki#event-app";/);
  });

  it("jeder Video-Schlüssel einer Seite steht in der Liste für /admin/videos", () => {
    const bekannt = new Set<string>(VIDEO_SCHLUESSEL.map((v) => v.key));
    const gefunden = new Set<string>();
    for (const datei of dateien("app")) {
      for (const m of readFileSync(datei, "utf8").matchAll(/loadVideo\("([a-z_]+)"/g)) gefunden.add(m[1]);
    }
    // Ohne Fundstelle prüfte der Test nichts.
    assert.ok(gefunden.size >= 3, `zu wenige Fundstellen: ${[...gefunden].join(", ")}`);
    for (const key of gefunden) assert.ok(bekannt.has(key), `${key} fehlt in components/video/schluessel.ts`);
    const admin = src("app/(admin)/admin/videos/page.tsx");
    assert.match(admin, /VIDEO_SCHLUESSEL\.map/);
  });

  it("Texte in beiden Sprachen", () => {
    for (const sprache of ["de", "en"]) {
      const shop = block(sprache, "partnerShop");
      for (const k of ["guideTitle", "guideBody", "guideVideo", "guideVideoTitle", "guideWiki", "introTitle", "introBody", "introStart"]) {
        assert.ok((shop[k] as string)?.trim(), `${sprache}: partnerShop.${k}`);
      }
      const app = block(sprache, "partnerEventApp");
      assert.ok((app.videoSectionTitle as string)?.trim() && (app.videoPending as string)?.trim(), `${sprache}: partnerEventApp.video*`);
      const videos = block(sprache, "videos");
      for (const k of ["expectedTitle", "expectedLead", "expectedSet", "expectedMissing"]) {
        assert.ok((videos[k] as string)?.trim(), `${sprache}: videos.${k}`);
      }
    }
  });
});
