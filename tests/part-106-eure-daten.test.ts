import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { EureDatenEntwurf } from "@/components/partner/EureDaten";
import {
  BLOCK_IDS,
  anzahlFertig,
  blockStaende,
  ersterOffener,
  gesamtFehlt,
  kurzfassung,
  marke,
  weichtAb,
} from "@/app/(partner)/partner/onboarding/bloecke";

/**
 * PART-106 (Konrad 08.10.2026, K-73): „Eure Daten“ sind vier Abschnitte einer Seite mit Stand und Kurzfassung in der Zeile,
 * oben die Zahl, wie weit alles ist — kein Wizard mit einer Linie und vier Stationen mehr. Die vier sind unabhängig;
 * gespeichert wird gesammelt über eine Leiste, die nur bei Ungespeichertem erscheint. Was die Abschnitte als Stand zeigen,
 * wird aus dem Entwurf gelesen (`bloecke.ts`) und hier ausgeführt; die Ansicht ist Quelltext — einen DOM-Testlauf gibt es im
 * Repo nicht, Bild und Maße stehen in der PR-Beschreibung.
 */

const src = (p: string) => readFileSync(p, "utf8");
const ohneKommentare = (quelle: string) => quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const partnerWb = (sprache: "de" | "en") => JSON.parse(src(`lib/i18n/${sprache}.json`)).partner as Record<string, string>;

const ansicht = ohneKommentare(src("app/(partner)/partner/onboarding/EureDatenView.tsx"));
const seite = ohneKommentare(src("app/(partner)/partner/onboarding/page.tsx"));

const LEER: EureDatenEntwurf = {
  legal_name: "",
  communication_name: "",
  address_street: "",
  address_extra: "",
  address_zip: "",
  address_city: "",
  address_country: "",
  website: "",
  industry: "",
  description_de: "",
  description_en: "",
  invoice_email: "",
  invoice_name: "",
  vat_id: "",
  po_number: "",
};
const FIRMA = {
  legal_name: "Muster GmbH",
  communication_name: "Muster",
  address_street: "Musterstraße 1",
  address_zip: "80331",
  address_city: "München",
};
const entwurf = (teil: Partial<EureDatenEntwurf> = {}): EureDatenEntwurf => ({ ...LEER, ...teil });
const KEINE = { da: 0, gesamt: 2 };

const NAMEN = {
  legal_name: "Firmenname",
  communication_name: "Kommunikationsname",
  address_street: "Straße",
  address_zip: "PLZ",
  address_city: "Ort",
  description_de: "Beschreibung (Deutsch)",
  invoice_email: "Rechnungs-E-Mail",
};
const KURZ = {
  fehlt: "Es fehlt: {liste}",
  zeichen: "{n} Zeichen",
  branche: "Branche {name}",
  logoDa: "{format} da",
  logoFehlt: "{format} fehlt",
};
const MARKEN = { fertig: "Fertig", offen: "Offen", anzahl: "{n} von {total}" };
const stand = (d: EureDatenEntwurf, logos = KEINE) => blockStaende(d, logos);
const quelle = (d: EureDatenEntwurf, logos: { format: string; da: boolean }[] = []) => ({
  draft: d,
  feldNamen: NAMEN,
  logos,
  branchen: { automotive: "Automobil" },
});
const von = (s: ReturnType<typeof stand>, id: string) => s.find((b) => b.id === id)!;

describe("PART-106: Eure Daten — wie weit jeder Abschnitt ist (aus dem Entwurf)", () => {
  it("vier Abschnitte in fester Reihenfolge: Unternehmen, Beschreibung, Logo, Rechnungsdaten", () => {
    assert.deepEqual([...BLOCK_IDS], ["unternehmen", "beschreibung", "logo", "rechnung"]);
    assert.deepEqual(stand(LEER).map((b) => b.id), ["unternehmen", "beschreibung", "logo", "rechnung"]);
  });

  it("Unternehmen ist fertig mit Firmenname, Kommunikationsname und der Anschrift (Straße, PLZ, Ort) — kein Feld darf fehlen", () => {
    assert.equal(von(stand(entwurf(FIRMA)), "unternehmen").fertig, true);
    for (const feld of Object.keys(FIRMA) as (keyof typeof FIRMA)[]) {
      const s = von(stand(entwurf({ ...FIRMA, [feld]: "" })), "unternehmen");
      assert.equal(s.fertig, false, feld);
      assert.deepEqual(s.fehlt, [feld], feld);
    }
  });

  it("Leerzeichen sind kein Inhalt: ein Feld nur aus Leerzeichen gilt als leer", () => {
    assert.equal(von(stand(entwurf({ ...FIRMA, address_city: "   " })), "unternehmen").fertig, false);
    assert.equal(von(stand(entwurf({ description_de: " \n " })), "beschreibung").fertig, false);
    assert.equal(von(stand(entwurf({ invoice_email: "  " })), "rechnung").fertig, false);
  });

  it("Beschreibung hängt an der deutschen Fassung, Rechnungsdaten an der Rechnungs-E-Mail — die englische Fassung und das Übrige zählen nicht", () => {
    assert.equal(von(stand(entwurf({ description_en: "English only" })), "beschreibung").fertig, false);
    assert.equal(von(stand(entwurf({ description_de: "Deutsch" })), "beschreibung").fertig, true);
    assert.equal(von(stand(entwurf({ invoice_name: "X", vat_id: "DE1" })), "rechnung").fertig, false);
    assert.equal(von(stand(entwurf({ invoice_email: "a@b.de" })), "rechnung").fertig, true);
  });

  it("das Logo ist fertig, wenn alle Dateien da sind — und nie, wenn es gar keine Pflicht dazu gibt", () => {
    assert.equal(von(stand(LEER, { da: 2, gesamt: 2 }), "logo").fertig, true);
    assert.equal(von(stand(LEER, { da: 1, gesamt: 2 }), "logo").fertig, false);
    assert.equal(von(stand(LEER, { da: 0, gesamt: 0 }), "logo").fertig, false);
  });

  it("die Abschnitte sind unabhängig: Rechnungsdaten fertig, Beschreibung offen — der Stand folgt dem Inhalt, nicht der Position", () => {
    const s = stand(entwurf({ ...FIRMA, invoice_email: "a@b.de" }));
    assert.deepEqual(s.map((b) => b.fertig), [true, false, false, true]);
    assert.equal(anzahlFertig(s), 2);
    assert.equal(ersterOffener(s), "beschreibung");
  });

  it("beim Laden steht der erste Abschnitt offen, der noch etwas braucht; ist alles da, bleibt alles zu", () => {
    assert.equal(ersterOffener(stand(LEER)), "unternehmen");
    assert.equal(ersterOffener(stand(entwurf(FIRMA))), "beschreibung");
    assert.equal(ersterOffener(stand(entwurf({ ...FIRMA, description_de: "x" }), { da: 1, gesamt: 2 })), "logo");
    const alles = stand(entwurf({ ...FIRMA, description_de: "x", invoice_email: "a@b.de" }), { da: 2, gesamt: 2 });
    assert.equal(anzahlFertig(alles), 4);
    assert.equal(ersterOffener(alles), null);
  });

  it("ungespeichert ist, was von der Aufbereitung zum Speichern abweicht: ein Feld, ein fehlender Schlüssel — gleiche Werte nicht", () => {
    assert.equal(weichtAb({ a: "1", b: "2" }, { a: "1", b: "2" }), false);
    assert.equal(weichtAb({ a: "1", b: "2" }, { a: "1", b: "3" }), true);
    assert.equal(weichtAb({ a: "1" }, { a: "1", b: "" }), true);
    assert.equal(weichtAb({ a: "1", b: "" }, { a: "1" }), true);
  });
});

describe("PART-106: Eure Daten — Stand und Kurzfassung in der Zeile", () => {
  it("fertig: Fertig in Grün; offen: Offen in Gelb; beim Logo „1 von 2“, sobald eine Datei da ist", () => {
    assert.deepEqual(marke(von(stand(entwurf(FIRMA)), "unternehmen"), MARKEN), { text: "Fertig", ton: "success" });
    assert.deepEqual(marke(von(stand(LEER), "beschreibung"), MARKEN), { text: "Offen", ton: "warning" });
    assert.deepEqual(marke(von(stand(LEER, { da: 1, gesamt: 2 }), "logo"), MARKEN), { text: "1 von 2", ton: "warning" });
    assert.deepEqual(marke(von(stand(LEER, { da: 0, gesamt: 2 }), "logo"), MARKEN), { text: "Offen", ton: "warning" });
    assert.deepEqual(marke(von(stand(LEER, { da: 2, gesamt: 2 }), "logo"), MARKEN), { text: "Fertig", ton: "success" });
  });

  it("Unternehmen: was drinsteht — Name und Anschrift; ohne Kommunikationsnamen der Firmenname; sonst, was fehlt", () => {
    const fertig = entwurf(FIRMA);
    assert.equal(kurzfassung(von(stand(fertig), "unternehmen"), quelle(fertig), KURZ), "Muster · Musterstraße 1, 80331 München");
    const ohneKomm = entwurf({ ...FIRMA, communication_name: "" });
    assert.equal(kurzfassung(von(stand(ohneKomm), "unternehmen"), quelle(ohneKomm), KURZ), "Es fehlt: Kommunikationsname");
    const luecke = entwurf({ legal_name: "Muster GmbH", address_city: "München" });
    assert.equal(
      kurzfassung(von(stand(luecke), "unternehmen"), quelle(luecke), KURZ),
      "Es fehlt: Kommunikationsname · Straße · PLZ",
    );
  });

  it("Beschreibung: Zeichen und Branche; eine unbekannte Branche bleibt weg; ohne Text steht, dass er fehlt", () => {
    const text = "x".repeat(110);
    const mit = entwurf({ description_de: text, industry: "automotive" });
    assert.equal(kurzfassung(von(stand(mit), "beschreibung"), quelle(mit), KURZ), "110 Zeichen · Branche Automobil");
    const unbekannt = entwurf({ description_de: `  ${text}  `, industry: "gibtsnicht" });
    assert.equal(kurzfassung(von(stand(unbekannt), "beschreibung"), quelle(unbekannt), KURZ), "110 Zeichen");
    assert.equal(kurzfassung(von(stand(LEER), "beschreibung"), quelle(LEER), KURZ), "Es fehlt: Beschreibung (Deutsch)");
  });

  it("Logo: je Datei „SVG da · PNG fehlt“ — auch ganz ohne Datei; ohne Pflicht dazu gibt es nichts zu sagen", () => {
    const logos = [
      { format: "SVG", da: true },
      { format: "PNG", da: false },
    ];
    assert.equal(kurzfassung(von(stand(LEER, { da: 1, gesamt: 2 }), "logo"), quelle(LEER, logos), KURZ), "SVG da · PNG fehlt");
    assert.equal(
      kurzfassung(von(stand(LEER), "logo"), quelle(LEER, logos.map((l) => ({ ...l, da: false }))), KURZ),
      "SVG fehlt · PNG fehlt",
    );
    assert.equal(kurzfassung(von(stand(LEER, { da: 0, gesamt: 0 }), "logo"), quelle(LEER, []), KURZ), undefined);
  });

  it("Rechnungsdaten: die Rechnungs-E-Mail; ohne sie, dass sie fehlt", () => {
    const mit = entwurf({ invoice_email: " rechnung@muster.example " });
    assert.equal(kurzfassung(von(stand(mit), "rechnung"), quelle(mit), KURZ), "rechnung@muster.example");
    assert.equal(kurzfassung(von(stand(LEER), "rechnung"), quelle(LEER), KURZ), "Es fehlt: Rechnungs-E-Mail");
  });

  it("die Zeile „Zum Abschluss fehlt noch“ führt auf, was insgesamt fehlt — in der Reihenfolge der Seite, das Logo als ein Wort", () => {
    const s = stand(entwurf({ legal_name: "Muster GmbH", communication_name: "Muster" }));
    assert.deepEqual(gesamtFehlt(s, NAMEN, "Logo"), ["Straße", "PLZ", "Ort", "Beschreibung (Deutsch)", "Logo", "Rechnungs-E-Mail"]);
    const alles = stand(entwurf({ ...FIRMA, description_de: "x", invoice_email: "a@b.de" }), { da: 2, gesamt: 2 });
    assert.deepEqual(gesamtFehlt(alles, NAMEN, "Logo"), []);
  });
});

describe("PART-106: Eure Daten — die Ansicht", () => {
  it("kein Wizard mehr: keine `StepBar`, kein Schritt-Zustand, kein Zurück und Weiter — die `StepBar` bleibt für echte Abläufe im Kit", () => {
    assert.doesNotMatch(ansicht, /StepBar/);
    assert.doesNotMatch(ansicht, /\bsetStep\b|useState\(0\)/);
    assert.doesNotMatch(ansicht, /common\.(back|next)\b/);
    assert.match(src("app/(speaker)/speaker/reisekosten/ExpenseWizard.tsx"), /<StepBar\b/);
    assert.ok(src("components/ui/StepBar.tsx").length > 0);
  });

  it("vier `Block` in der Reihenfolge der Stände: Karte, `h2`, Marke und Kurzfassung aus dem Entwurf, der erste offene steht offen", () => {
    assert.match(ansicht, /\{staende\.map\(\(stand\) => \(\s*<Block\s+key=\{stand\.id\}\s+id=\{stand\.id\}\s+karte\s+ebene="h2"/);
    assert.match(ansicht, /titel=\{titel\[stand\.id\]\}\s+marke=\{marke\(stand, markenTexte\)\}/);
    assert.match(ansicht, /kurz=\{kurzfassung\(\s*stand,\s*\{ draft, feldNamen, logos: logoFormate, branchen: industries \},\s*kurzTexte,\s*\)\}/);
    assert.match(ansicht, /offen=\{startOffen === stand\.id\}/);
    // Nur beim Laden festgelegt: ein Abschnitt springt nicht zu, weil er beim Tippen fertig wurde.
    assert.match(
      ansicht,
      /const \[startOffen\] = useState<BlockId \| null>\(\(\) =>\s*ersterOffener\(blockStaende\(entwurfAus\(overview\), \{ da: logosDa, gesamt: logos\.length \}\)\),\s*\);/,
    );
  });

  it("in jedem Abschnitt stehen seine Felder: Unternehmen, Beschreibung, Logo (Kacheln und Einwilligung), Rechnungsdaten", () => {
    for (const [id, inhalt] of [
      ["unternehmen", /<KundennummerInfo\b[\s\S]*<UnternehmenFelder\b/],
      ["beschreibung", /<BeschreibungFelder\b/],
      ["logo", /<UploadKachel\b[\s\S]*<LogoWandEinwilligung\b/],
      ["rechnung", /<RechnungFelder\b/],
    ] as const) {
      const von = ansicht.indexOf(`stand.id === "${id}"`);
      assert.ok(von > 0, id);
      const bis = [...ansicht.matchAll(/\{stand\.id === "(\w+)"/g)].map((m) => m.index!).find((i) => i > von) ?? ansicht.indexOf("</Block>");
      assert.match(ansicht.slice(von, bis), inhalt, id);
    }
  });

  it("oben die Zahl (Balken mit Wort), „Auf dieser Seite“ mit den vier Abschnitten; der Gesamtstand bleibt als Marke", () => {
    assert.match(ansicht, /<Fortschritt\s+wert=\{fertig\}\s+gesamt=\{BLOCK_IDS\.length\}\s+label=\{t\.onboardingProgress\.replace\("\{n\}", String\(fertig\)\)\.replace\("\{total\}", String\(BLOCK_IDS\.length\)\)\}/);
    assert.match(ansicht, /<AbschnittsNavigation\s+label=\{common\.onThisPage\}\s+items=\{BLOCK_IDS\.map\(\(id\) => \(\{ id, label: titel\[id\] \}\)\)\}/);
    assert.match(ansicht, /<Badge tone=\{done \? "success" : "warning"\}>/);
    assert.match(ansicht, /\{t\.stillMissing\}: \{fehlt\.join\(" · "\)\}/);
  });

  it("die Leiste „Änderungen speichern · Verwerfen“ klebt unten und erscheint nur bei Ungespeichertem; `useUngesichert` warnt beim Verlassen", () => {
    assert.match(ansicht, /const dirty = weichtAb\(speicherDaten\(draft\), speicherDaten\(gespeichert\)\);/);
    assert.match(ansicht, /const warnung = useUngesichert\(dirty, unsaved\);/);
    assert.match(ansicht, /\{dirty && \(\s*<div className="sticky bottom-0 /);
    assert.match(ansicht, /<Button\s+variant="ghost"\s+disabled=\{pending\}\s+onClick=\{\(\) => \{\s*setDraft\(gespeichert\);\s*setFehler\(null\);\s*\}\}\s*>\s*\{t\.onboardingDiscard\}/);
    assert.match(ansicht, /<Button disabled=\{pending\} onClick=\{onSave\}>\s*\{t\.onboardingSave\}/);
    assert.match(ansicht, /\{warnung\}/);
  });

  it("gespeichert wird gesammelt wie bisher; der gespeicherte Stand wandert mit, und ein Fehler steht neben dem Knopf statt im Toast", () => {
    assert.match(ansicht, /const res = await saveOnboarding\(orgId, speicherDaten\(draft\)\);/);
    assert.match(ansicht, /toast\("success", t\.saved\);\s*setGespeichert\(draft\);\s*router\.refresh\(\);/);
    assert.match(ansicht, /setFehler\(message\(res\.key\) \+ \(res\.detail \? ` \(\$\{res\.detail\}\)` : ""\)\);/);
    assert.doesNotMatch(ansicht, /toast\("error"/);
    assert.match(ansicht, /\{fehler && \(\s*<p role="alert" className="ct-small basis-full text-right text-error-ink">/);
  });

  it("Upload und Einwilligung wirken wie bisher sofort und stehen nicht im Entwurf", () => {
    assert.match(ansicht, /usePflichtUpload\(\{\s*orgId,\s*editionId,/);
    assert.match(ansicht, /onFile=\{\(file\) => void hochladen\(logo, file\)\}/);
    assert.match(ansicht, /await setLogoWhiteningConsent\(\{ orgId, granted, editionId \}\)/);
  });

  it("die Seite benutzt die neue Ansicht und gibt ihr die Texte für „Auf dieser Seite“ und die Rückfrage beim Verlassen", () => {
    assert.match(seite, /import \{ EureDatenView \} from "\.\/EureDatenView";/);
    assert.match(seite, /<EureDatenView\s+orgId=/);
    assert.match(seite, /onThisPage: t\.common\.onThisPage,/);
    assert.match(seite, /unsaved=\{t\.common\.unsaved\}/);
    assert.doesNotMatch(seite, /OnboardingWizard|back: t\.common\.back|next: t\.common\.next/);
  });
});

describe("PART-106: Eure Daten — die Texte", () => {
  const NEU = [
    "blockChars", "blockCount", "blockDone", "blockIndustry", "blockLogoMissing", "blockLogoThere",
    "blockMissing", "blockOpen", "onboardingDiscard", "onboardingProgress", "onboardingSave", "onboardingUnsaved",
  ];
  const TOT = [
    "onboardingStepCompanyHint", "onboardingStepDescriptionHint", "onboardingStepInvoiceHint", "onboardingStepLogoHint",
    "logoCount", "stepperLabel",
  ];

  it("jeder Text, den die Ansicht und `bloecke.ts` ansprechen, steht in DE und EN", () => {
    const gebraucht = new Set([...ansicht.matchAll(/\bt\.(\w+)/g)].map((m) => m[1]));
    for (const sprache of ["de", "en"] as const) {
      const w = partnerWb(sprache);
      assert.deepEqual([...gebraucht].filter((k) => !(k in w)), [], `${sprache}: fehlt in partner`);
      for (const k of NEU) assert.ok(typeof w[k] === "string" && w[k].length > 0, `${sprache}: ${k}`);
    }
  });

  it("die Platzhalter stehen in beiden Sprachen: {n} und {total}, {liste}, {format}, {name}", () => {
    for (const sprache of ["de", "en"] as const) {
      const w = partnerWb(sprache);
      assert.match(w.onboardingProgress, /\{n\}.*\{total\}/, sprache);
      assert.match(w.blockCount, /\{n\}.*\{total\}/, sprache);
      assert.match(w.blockMissing, /\{liste\}/, sprache);
      assert.match(w.blockChars, /\{n\}/, sprache);
      assert.match(w.blockIndustry, /\{name\}/, sprache);
      assert.match(w.blockLogoThere, /\{format\}/, sprache);
      assert.match(w.blockLogoMissing, /\{format\}/, sprache);
    }
  });

  it("der Satz über dem Stand sagt nicht mehr „Zwischenstand wird gespeichert“ — die Leiste speichert, nicht „Weiter“", () => {
    assert.match(partnerWb("de").onboardingStepsHint, /speichert ihr unten/);
    assert.doesNotMatch(partnerWb("de").onboardingStepsHint, /Zwischenstand/);
    assert.match(partnerWb("en").onboardingStepsHint, /save what you changed at the bottom/);
    assert.doesNotMatch(partnerWb("en").onboardingStepsHint, /Progress is saved/);
  });

  it("die Texte der Stationen (Hinweise unter den Sechsecken, Beschriftung der Linie, Zähler im Logo-Kopf) sind weg", () => {
    for (const sprache of ["de", "en"] as const) {
      for (const k of TOT) assert.equal(k in partnerWb(sprache), false, `${sprache}: ${k}`);
    }
  });
});
