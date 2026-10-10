import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { instanzSuffix, stoppWahl, stoppWahlMitTexten, vorgabeStopp } from "@/lib/partner/instanz";

/**
 * QS-079, dritter Einsatz (Company Tour): ab zwei Stopps wählt der Umschalter (`?instanz=<Stopp>`) den Stopp, darunter steht genau einer mit Kopfkarte, Tour Lead
 * und dem Formular, und Bewerbungen und Teilnehmende zeigen nur den gewählten. Die Regeln als Verhalten, die Verdrahtung am Quelltext — Komponenten lädt der
 * Testlader nicht. Dazu der Admin-Weg: `/admin/partner/[org]` führt dieselbe Leiste.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ohneKommentare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const tour = (p: string) => ohneKommentare(quelle(`app/(partner)/partner/company-tour/${p}`));

// Wie die echten Zeilen: ein Stopp trägt seine eigene Kennung und die seiner Tour — der Umschalter darf nur die erste nehmen.
const stopp = (stop_id: string, sort_order: number, tour_name: string, filled_at: string | null = "2026-10-01T10:00:00Z") => ({
  stop_id,
  tour_id: `tour-${stop_id}`,
  sort_order,
  tour_name,
  filled_at,
});
const titel = (x: { sort_order: number; tour_name: string }) => `Stopp ${x.sort_order} · ${x.tour_name}`;
const nummer = (n: number) => `Stopp ${n}`;

describe("Vorgabe Stopp: der, zu dem noch nichts gespeichert ist", () => {
  it("der erste Stopp ohne Eintrag; sind alle ausgefüllt, keiner (dann gilt der erste)", () => {
    assert.equal(vorgabeStopp([stopp("a", 1, "A"), stopp("b", 1, "B", null), stopp("c", 1, "C", null)])?.stop_id, "b");
    assert.equal(vorgabeStopp([stopp("a", 1, "A"), stopp("b", 1, "B")]), undefined);
    assert.equal(vorgabeStopp([]), undefined);
  });
});

describe("Stoppwahl: gewählter Stopp und Umschalter", () => {
  const zwei = [stopp("a", 1, "Tour A"), stopp("b", 1, "Tour B")];

  it("der Wunsch gewinnt, der Reiter trägt den Titel „Stopp 1 · Tour A“", () => {
    const w = stoppWahl(zwei, "b", titel, nummer);
    assert.equal(w.gewaehlt?.stop_id, "b");
    assert.deepEqual(w.instanzen, {
      items: [{ id: "a", label: "Stopp 1 · Tour A" }, { id: "b", label: "Stopp 1 · Tour B" }],
      gewaehlt: "b",
    });
  });

  it("ohne Wunsch oder mit unbekannter Kennung: der Stopp ohne Eintrag, sonst der erste — kein Fehler", () => {
    const mitLuecke = [stopp("a", 1, "Tour A"), stopp("b", 1, "Tour B", null)];
    assert.equal(stoppWahl(mitLuecke, undefined, titel, nummer).gewaehlt?.stop_id, "b");
    assert.equal(stoppWahl(mitLuecke, "gibt-es-nicht", titel, nummer).gewaehlt?.stop_id, "b");
    assert.equal(stoppWahl(zwei, undefined, titel, nummer).gewaehlt?.stop_id, "a", "alle ausgefüllt: der erste");
    assert.equal(stoppWahl(mitLuecke, "a", titel, nummer).gewaehlt?.stop_id, "a", "der Wunsch schlägt die Vorgabe");
  });

  it("gleiche Titel werden „Stopp 1“ und „Stopp 2“ — sonst sähen die Reiter gleich aus", () => {
    const w = stoppWahl([stopp("a", 1, "Tour"), stopp("b", 1, "Tour")], undefined, titel, nummer);
    assert.deepEqual(w.instanzen?.items.map((x) => x.label), ["Stopp 1", "Stopp 2"]);
  });

  it("einen Umschalter gibt es erst ab zwei Stopps; ohne Stopp gibt es keinen gewählten", () => {
    const einer = stoppWahl([stopp("a", 1, "Tour A")], undefined, titel, nummer);
    assert.equal(einer.gewaehlt?.stop_id, "a");
    assert.equal(einer.instanzen, null, "bei einem Stopp ist die Seite wie vorher");
    const keiner = stoppWahl([], "a", titel, nummer);
    assert.equal(keiner.gewaehlt, null);
    assert.equal(keiner.instanzen, null);
  });

  it("der Adressanhang der Reiter trägt die Kennung des Stopps", () => {
    assert.equal(instanzSuffix(stoppWahl(zwei, "b", titel, nummer).instanzen), "?instanz=b");
    assert.equal(instanzSuffix(stoppWahl(zwei.slice(0, 1), undefined, titel, nummer).instanzen), "");
  });

  it("mit den Texten des Wörterbuchs: die Zahl im Reiter ist die Reihenfolge in der Tour, bei gleichen Titeln die Stelle in der Leiste", () => {
    const texte = { instanceStop: "Stopp {n} · {tour}", instanceNumber: "Stopp {n}" };
    // Die Zahl ist `sort_order` und nicht die Stelle in der Leiste: hier steht der Stopp 2 der ersten Tour vor dem Stopp 1 der zweiten.
    const w = stoppWahlMitTexten([stopp("a", 2, "Tour A"), stopp("b", 1, "Tour B")], "b", texte);
    assert.equal(w.gewaehlt?.stop_id, "b");
    assert.deepEqual(w.instanzen?.items.map((x) => x.label), ["Stopp 2 · Tour A", "Stopp 1 · Tour B"]);
    // Gleiche Titel: „Stopp 1“ und „Stopp 2“ nach der Stelle in der Liste, nicht nach `sort_order` (beide Stopps haben hier 3).
    const gleich = stoppWahlMitTexten([stopp("a", 3, "Tour"), stopp("b", 3, "Tour")], undefined, texte);
    assert.deepEqual(gleich.instanzen?.items.map((x) => x.label), ["Stopp 1", "Stopp 2"]);
    // Sonst keine eigene Regel: Wahl, Vorgabe und Umschalter wie bei `stoppWahl` mit denselben beiden Beschriftungen.
    assert.deepEqual(stoppWahlMitTexten(zwei, "b", texte), stoppWahl(zwei, "b", titel, nummer));
    assert.equal(stoppWahlMitTexten([stopp("a", 1, "Tour A"), stopp("b", 1, "Tour B", null)], undefined, texte).gewaehlt?.stop_id, "b");
    assert.equal(stoppWahlMitTexten([stopp("a", 1, "Tour A")], undefined, texte).instanzen, null);
  });
});

describe("Company Tour: ein Stopp, drei Sichten, die Wahl reist mit", () => {
  it("der Lader nimmt `?instanz`, wählt für alle Reiter nach derselben Regel und liefert den Umschalter", () => {
    const d = tour("daten.ts");
    assert.match(d, /export async function ladeTour\(instanz\?: string \| string\[\]\)/);
    assert.match(d, /stoppWahlMitTexten\(stopps, instanzKennung\(instanz\), t\.partnerTour\)/);
    assert.match(d, /return \{[\s\S]*?\bgewaehlt,\s*instanzen,/);
  });

  it("die Stoppseite zeichnet nur den gewählten Stopp, mit `key`, Kopfkarte, Tour Lead und Formular — keine Schleife über alle", () => {
    const s = tour("page.tsx");
    assert.match(s, /\{ searchParams \}: \{ searchParams: Promise<\{ instanz\?: string \| string\[\] \}> \}/);
    assert.match(s, /await ladeTour\(instanz\)/);
    assert.match(s, /\{gewaehlt && \(\s*<section\s+key=\{gewaehlt\.stop_id\}/);
    assert.match(s, /<TourStopp\s+stopp=\{gewaehlt\}/);
    assert.doesNotMatch(s, /stopps\.map\(/);
    assert.equal((s.match(/<TourStopp\b/g) ?? []).length, 1);
    assert.match(s, /<TourKopf [^>]*instanzen=\{instanzen\}/);
    // Tour Lead und Zeitfenster gehören zum gewählten Stopp: die Bedingung der Karte und die Karte lesen denselben, nirgends wird in die Liste gegriffen.
    for (const feld of ["gewaehlt.arrival_at", "gewaehlt.meeting_point", "gewaehlt.tour_starts_at", "gewaehlt.lead_name", "gewaehlt.lead_photo_path"]) assert.ok(s.includes(feld), feld);
    assert.match(s, /\{gewaehlt\.lead_name && gewaehlt\.lead_email && gewaehlt\.lead_phone && \(/, "die Karte erscheint nur, wenn der gewählte Stopp einen vollständigen Tour Lead hat");
    assert.doesNotMatch(s, /stopps\[|stopps\.(?:find|at|map|filter|slice|flatMap)\(/, "kein Zugriff auf einen anderen Stopp der Liste");
  });

  it("der Umschalter steht über den Sichten, die Sichten nehmen die Wahl mit, ohne Umschalter bleiben ihre Adressen", () => {
    const k = tour("TourKopf.tsx");
    assert.match(k, /<InstanzWahl leiste=\{instanzen\} label=\{t\.instanceLabel\} \/>/);
    assert.ok(k.indexOf("<InstanzWahl") < k.indexOf("<TourTabs"), "Umschalter vor den Sichten");
    assert.match(k, /suffix=\{instanzSuffix\(instanzen\)\}/);
    const tabs = tour("TourTabs.tsx");
    assert.match(tabs, /suffix = ""/);
    for (const ziel of ["`${BASE}${suffix}`", "`${BASE}/bewerbungen${suffix}`", "`${BASE}/teilnehmende${suffix}`"]) assert.ok(tabs.includes(ziel), ziel);
    assert.equal((tabs.match(/\$\{suffix\}/g) ?? []).length, 3);
  });

  for (const [datei, teilnehmende] of [["bewerbungen/page.tsx", false], ["teilnehmende/page.tsx", true]] as const) {
    it(`${datei}: nur der gewählte Stopp, derselbe Umschalter darüber`, () => {
      const s = tour(datei);
      assert.match(s, /\{ searchParams \}: \{ searchParams: Promise<\{ instanz\?: string \| string\[\] \}> \}/);
      assert.match(s, /await ladeTour\(instanz\)/);
      assert.match(s, /\{gewaehlt && \(\s*<TourBewerbungen/);
      assert.match(s, /stopps=\{\[gewaehlt\]\}/);
      assert.doesNotMatch(s, /stopps=\{stopps\}/, "nicht mehr alle Stopps untereinander");
      assert.match(s, /<TourKopf [^>]*instanzen=\{instanzen\}/);
      assert.match(s, teilnehmende ? /\bnurTeilnehmende\b(?!=)/ : /nurTeilnehmende=\{false\}/);
    });
  }
});

describe("Admin: /admin/partner/[org] führt dieselbe Leiste", () => {
  const seite = ohneKommentare(quelle("app/(admin)/admin/partner/[org]/page.tsx"));
  const detail = ohneKommentare(quelle("app/(admin)/admin/partner/[org]/OrgDetail.tsx"));

  it("die Seite liest `?instanz`, wählt nach derselben Regel wie das Partnerportal und reicht nur den gewählten Stopp samt Leiste weiter", () => {
    assert.match(seite, /searchParams: Promise<\{ instanz\?: string \| string\[\] \}>;/);
    assert.match(seite, /const \{ instanz \} = await searchParams;/);
    assert.match(seite, /stoppWahlMitTexten\(\(tourZeilen \?\? \[\]\) as TourStopp\[\], instanzKennung\(instanz\), t\.partnerTour\)/);
    assert.match(seite, /tourStopp=\{tour\.gewaehlt\}\s+tourInstanzen=\{tour\.instanzen\}/);
    assert.doesNotMatch(seite, /tourStopps/, "nicht mehr alle Stopps");
    // Dieselbe RPC wie das Partnerportal, ohne Umweg.
    assert.match(seite, /rpc\("partner_company_tour", \{ p_org_id: org \}\)/);
  });

  it("unter der Organisation steht genau ein Stopp mit `key` und der Maske des Portals; die Leiste steht darüber und lässt die Seite, wo sie ist", () => {
    assert.match(detail, /\{tourStopp && \(\s*<div id="tour">/);
    assert.match(detail, /<InstanzWahl leiste=\{tourInstanzen\} label=\{tourTexts\.instanceLabel\} scroll=\{false\} \/>/);
    assert.match(detail, /<Card key=\{tourStopp\.stop_id\}>/);
    assert.match(detail, /<TourStopp\s+stopp=\{tourStopp\}\s+felder=\{tourFelder\}\s+canEdit\s+save=\{adminUpdateTourStop\}/);
    assert.equal((detail.match(/<TourStopp\b/g) ?? []).length, 1);
    assert.doesNotMatch(detail, /tourStopps/, "keine Schleife über alle Stopps");
    assert.ok(detail.indexOf("<InstanzWahl") !== -1 && detail.indexOf("<InstanzWahl") < detail.indexOf("<TourStopp"), "Leiste vor der Maske");
    // Der Kopf der Karte nennt den gewählten Stopp mit der Zahl in der Tour, wie der Reiter.
    assert.match(detail, /title=\{tourTexts\.stopTitle\.replace\("\{n\}", String\(tourStopp\.sort_order\)\)\.replace\("\{tour\}", tourStopp\.tour_name\)\}/);
    // Die Karte ist jetzt ein Abschnitt der Seite (`h2`), kein Eintrag einer Liste mehr — `cardheader-ebene.test.ts` kennt keine Ausnahme mehr dafür.
    assert.match(detail, /<Card key=\{tourStopp\.stop_id\}>\s*<CardHeader\s+ebene="h2"/);
  });

  it("`scroll` geht von der Seite über `InstanzWahl` und `SectionTabs` bis an den Link; ohne Angabe bleibt der Standard", () => {
    const wahl = ohneKommentare(quelle("components/layout/InstanzWahl.tsx"));
    assert.match(wahl, /\{ leiste, label, scroll \}: \{ leiste: InstanzLeiste \| null; label: string; scroll\?: boolean \}/);
    assert.match(wahl, /aktiv: x\.id === leiste\.gewaehlt, scroll \}/);
    const reiter = ohneKommentare(quelle("components/layout/SectionTabs.tsx"));
    assert.match(reiter, /\n\s+scroll\?: boolean;/);
    assert.match(reiter, /<ChipLink key=\{item\.href\} href=\{item\.href\} aktiv=\{active\} scroll=\{item\.scroll\}>/);
    // Die Leiste der Partnerseite steht oben und braucht es nicht.
    assert.doesNotMatch(tour("TourKopf.tsx"), /scroll=/);
  });
});

describe("Testdaten: Konrads Konto sieht den Umschalter", () => {
  it("der Schritt `tourstopp` legt eine zweite Tour mit einem Stopp der Test-Organisation an — ein zweiter Stopp an derselben Tour ginge nicht", () => {
    // Je Tour besetzt ein Partner höchstens einen Stopp (Index der Migration) — deshalb eine eigene Tour.
    assert.match(
      quelle("supabase/migrations/20260921115332_v6_company_tours.sql"),
      /create unique index if not exists company_tour_stop_org_idx\s+on company_tour_stop \(tour_id, host_org_id\) where host_org_id is not null;/,
    );
    const skript = quelle("scripts/testdaten-konrad.mjs");
    assert.match(skript, /const TOUR_B = `\$\{PREFIX\}Company Tour B`;/);
    assert.match(skript, /tourstopp: tourStoppZwei,/);
    assert.match(skript, /tour_id: tour\.id, sort_order: 1, host_org_id: org\.id/);
    // Nichts gespeichert: dort wartet die Frage, und die Seite öffnet ohne Wunsch zuerst bei einem solchen Stopp.
    const schritt = skript.slice(skript.indexOf("async function tourStoppZwei"), skript.indexOf("async function tourStoppZwei") + 2500);
    assert.doesNotMatch(schritt, /filled_at/);
    // `--remove` nimmt die zweite Tour mit; ihr Stopp geht über ON DELETE CASCADE.
    assert.match(skript, /admin\.from\("company_tour"\)\.delete\(\)\.eq\("name", TOUR_B\)/);
  });
});

describe("Texte: Stopp-Umschalter in beiden Sprachen", () => {
  it("`instanceLabel`, `instanceNumber` und `instanceStop` stehen in DE und EN mit ihren Platzhaltern; deutsch in der Ihr-Ansprache", () => {
    for (const sprache of ["de", "en"] as const) {
      const t = (JSON.parse(quelle(`lib/i18n/${sprache}.json`)) as { partnerTour: Record<string, string> }).partnerTour;
      assert.equal(typeof t.instanceLabel, "string", `${sprache}: instanceLabel`);
      assert.ok(t.instanceLabel.length >= 5);
      assert.match(t.instanceNumber, /\{n\}/, `${sprache}: instanceNumber trägt {n}`);
      assert.match(t.instanceStop, /\{n\}/, `${sprache}: instanceStop trägt {n}`);
      assert.match(t.instanceStop, /\{tour\}/, `${sprache}: instanceStop trägt {tour}`);
      assert.ok(!/\bSie\b|\bIhre[mnrs]?\b/.test(t.instanceLabel), `${sprache}: keine Sie-Ansprache`);
    }
  });
});
