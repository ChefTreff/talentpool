import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { FREIGABE_ARTEN, freigabeNavigation, reiterMitZahl, type FreigabeArt } from "@/lib/freigaben";

/**
 * ADM-070, Minimalweg (Plan 09./10.10.2026, Feedbackrunde Konrad und Paulina 05.10.: „Kalender, Tabelle und Freigabe als drei Unterpunkte sauber ins Untermenü — Freigabe ist
 * heute schwer zu finden“): die drei Reiter stehen seit ADM-072 über Board und Tabelle; „Freigabe“ springt aber zur zentralen Freigabe-Übersicht und trug keine Zahl. Jetzt
 * trägt der Reiter die Zahl der wartenden Slots — derselbe Wert wie der Unterpunkt „Slots“ unter „Freigaben“ im Menü (`freigabe_zaehler().slots`), je Anfrage einmal geladen.
 * **Keine Shell- und Navigationsänderung** (Konrads Go zur Admin-Struktur, K-95, steht aus): das Untermenü in der Seitenleiste bleibt dort. Keine Datenbankänderung.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const TABS = "components/programme/TableTabs.tsx";

describe("ADM-070: die Zahl am Reiter (ausgeführt)", () => {
  it("mit bekannter Zahl: „Freigabe (3)“, auch bei 0; ohne sie bleibt der Name", () => {
    assert.equal(reiterMitZahl("Freigabe", 3), "Freigabe (3)");
    assert.equal(reiterMitZahl("Freigabe", 0), "Freigabe (0)");
    assert.equal(reiterMitZahl("Release", 12), "Release (12)");
    assert.equal(reiterMitZahl("Freigabe", undefined), "Freigabe");
  });

  it("eine Zahl, die keine ist (negativ, gebrochen, NaN, unendlich), steht nie am Reiter — lieber keine als eine falsche", () => {
    for (const n of [-1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(reiterMitZahl("Freigabe", n), "Freigabe", String(n));
  });

  it("derselbe Wert wie im Menü: der Unterpunkt „Slots“ und der Reiter lesen `zaehler.slots`", () => {
    const zaehler = { inhalte: 1, slots: 3, reisekosten: 0 };
    const tab = Object.fromEntries(FREIGABE_ARTEN.map((a) => [a, a])) as Record<FreigabeArt, string>;
    const menue = freigabeNavigation(zaehler, { tab, offen: "offen" });
    assert.ok(menue?.kinder, "Unterpunkte fehlen");
    const slots = menue.kinder.find((k) => k.param?.value === "slots");
    assert.equal(slots?.count, 3);
    assert.equal(reiterMitZahl("Freigabe", zaehler.slots), "Freigabe (3)");
    // wer die Art Slots nicht entscheiden darf, hat keinen Eintrag — Menü und Reiter zeigen dann beide keine Zahl
    const ohne = { inhalte: 1 } as Partial<Record<FreigabeArt, number>>;
    assert.equal(freigabeNavigation(ohne, { tab, offen: "offen" })?.kinder?.some((k) => k.param?.value === "slots"), false);
    assert.equal(reiterMitZahl("Freigabe", ohne.slots), "Freigabe");
  });
});

describe("ADM-070: der Reiter im Programm", () => {
  it("`TableTabs` lädt den Zähler nur mit dem Reiter (`withRelease`) und beschriftet „Freigabe“ mit `zaehler.slots`; Ziel und Zustand des Reiters bleiben", () => {
    const q = quelle(TABS);
    assert.match(q, /import \{ reiterMitZahl, type FreigabeZaehler \} from "@\/lib\/freigaben";/);
    assert.match(q, /import \{ ladeFreigabeZaehler \} from "@\/lib\/freigaben-server";/);
    assert.match(q, /const zaehler: FreigabeZaehler = withRelease \? await ladeFreigabeZaehler\(\) : \{\};/);
    assert.match(q, /\{ href: "\/admin\/einreichungen\?art=slots", label: reiterMitZahl\(t\.admin\.programmeRelease\.tab, zaehler\.slots\), aktiv: false \}/);
    // die beiden anderen Reiter tragen keine Zahl
    assert.match(q, /\{ href: basePath, label: t\.admin\.programmeTable\.tabBoard, exact: true \},\s+\{ href: `\$\{basePath\}\/tabelle`, label: t\.admin\.programmeTable\.tabTable \},/);
  });

  it("alle Admin-Ansichten des Programms zeigen den Reiter mit Zahl, das Board der Stage Leads bleibt ohne und fragt nichts", () => {
    const board = quelle("app/(admin)/admin/programm/page.tsx");
    assert.equal((board.match(/<TableTabs basePath=\{PATH\} withRelease \/>/g) ?? []).length, 2, "Board und leerer Zustand");
    assert.match(quelle("app/(admin)/admin/programm/tabelle/page.tsx"), /<TableTabs basePath=\{BASE\} withRelease \/>/);
    for (const leads of ["app/(speaker-leads)/speaker-leads/board/page.tsx", "app/(speaker-leads)/speaker-leads/board/tabelle/page.tsx"]) {
      const l = quelle(leads);
      assert.match(l, /<TableTabs basePath=\{(PATH|BASE)\} locale="de" \/>/, leads);
      assert.doesNotMatch(l, /withRelease/, leads);
    }
  });

  it("der Zähler wird je Anfrage einmal geladen (Layout und Reiter teilen sich die Antwort) und bleibt eine Zugabe: Fehler ergeben {}", () => {
    const s = quelle("lib/freigaben-server.ts");
    assert.match(s, /^import "server-only";/m);
    assert.match(s, /import \{ cache \} from "react";/);
    assert.match(s, /export const ladeFreigabeZaehler = cache\(async \(\): Promise<FreigabeZaehler> => \{/);
    assert.match(s, /supabase\.rpc\("freigabe_zaehler"\)/);
    assert.match(s, /return error \? \{\} : parseFreigabeZaehler\(data\);/);
    assert.match(s, /\} catch \{\s+return \{\};\s+\}\s+\}\);/);
    // das Layout ruft sie weiter genau so auf
    assert.match(quelle("app/(admin)/layout.tsx"), /await ladeFreigabeZaehler\(\)/);
  });
});

describe("ADM-070: keine Shell- und Navigationsänderung (K-95)", () => {
  it("die Seitenleiste kennt „Programm“ genau einmal, ohne Unterpunkte für Kalender, Tabelle oder Freigabe", () => {
    const nav = quelle("lib/admin-navigation.ts");
    assert.equal((nav.match(/href: "\/admin\/programm/g) ?? []).length, 1);
    assert.match(nav, /\{ section: "programme", href: "\/admin\/programm", label: "programme" \},/);
    assert.doesNotMatch(nav, /\/admin\/programm\/tabelle|\/admin\/programm\/freigabe/);
    // die Freigabe-Unterpunkte im Menü gehören der Freigabe-Übersicht (ADM-080/081), nicht dem Programm
    assert.match(nav, /href: "\/admin\/einreichungen", label: "submissions"/);
  });

  it("die Texte der Reiter sind unverändert („Kalender“, „Tabelle“, „Freigabe“), die Zahl kommt aus der Beschriftung, nicht aus dem Wörterbuch", () => {
    const de = JSON.parse(quelle("lib/i18n/de.json")) as { admin: { programmeTable: Record<string, string>; programmeRelease: Record<string, string> } };
    const en = JSON.parse(quelle("lib/i18n/en.json")) as { admin: { programmeRelease: Record<string, string> } };
    assert.equal(de.admin.programmeTable.tabBoard, "Kalender");
    assert.equal(de.admin.programmeTable.tabTable, "Tabelle");
    assert.equal(de.admin.programmeRelease.tab, "Freigabe");
    assert.equal(en.admin.programmeRelease.tab, "Release");
  });
});

describe("ADM-070: Doku", () => {
  it("Testleitfaden: eine Zeile zu den Programm-Reitern nennt die Zahl, ihre Herkunft, das Leads-Board ohne Reiter und das Untermenü bei K-95", () => {
    const zeile = quelle("docs/team-testleitfaden.md").split("\n").find((l) => l.includes("Reiter „Freigabe“ mit Zahl (ADM-070)"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /„Freigabe \(n\)“/);
    assert.match(zeile, /Unterpunkt „Slots“ unter „Freigaben“ im Menü/);
    assert.match(zeile, /`\/speaker-leads\/board`\) hat den Reiter nicht/);
    assert.match(zeile, /K-95/);
  });

  it("Backlog: ADM-070 trägt die PR-Nummer, steht auf „gebaut minimal“ und lässt das Untermenü bei K-95", () => {
    const zeile = quelle("docs/feedback/admin.md").split("\n").find((l) => l.startsWith("| ADM-070 |"));
    assert.ok(zeile && /\| P1 \| (geplant|gebaut|abgenommen) #\d+/.test(zeile), "ADM-070 trägt keine PR-Nummer");
    assert.match(zeile, /Untermenü offen \(K-95\)/);
    assert.match(zeile, /keine Migration/);
    assert.match(zeile, /freigabe_zaehler/);
  });
});
