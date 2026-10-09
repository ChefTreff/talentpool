import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  HOCHLADBAR,
  dateiFormat,
  dateiName,
  dateiReihenfolge,
  einzigesFormat,
} from "@/app/(partner)/partner/dateien/zeilen";

/**
 * PART-109 (Konrad 08.10.2026, K-73): die Dateien-Seite ist eine Tabelle mit **einer Zeile je Datei** — Name, Stand,
 * Frist, Aktion —; Beschreibung, Regeln, Vorschau und Upload liegen hinter dem Namen im Schubfach. Angebot und
 * Rechnungen sind je eine Zeile mit „Herunterladen“. Die Reihenfolge („Offenes zuerst“), der Name in der Zeile und das
 * Format werden hier ausgeführt (`zeilen.ts`); die Ansicht ist Quelltext — einen DOM-Testlauf gibt es im Repo nicht,
 * Maße und Bild stehen in der PR-Beschreibung.
 */

const src = (p: string) => readFileSync(p, "utf8");
const ohneKommentare = (quelle: string) => quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const wb = (sprache: "de" | "en") => JSON.parse(src(`lib/i18n/${sprache}.json`)).partnerFiles as Record<string, string>;

const ansicht = ohneKommentare(src("app/(partner)/partner/dateien/DateienView.tsx"));
const seite = ohneKommentare(src("app/(partner)/partner/dateien/page.tsx"));
const kachel = ohneKommentare(src("app/(partner)/partner/UploadKachel.tsx"));

type Status = "open" | "submitted" | "accepted" | "rejected" | "overdue";
const datei = (id: string, status: Status, tag: number | null, extra: { key?: string; sort?: number } = {}) => ({
  id,
  status,
  due_at: tag === null ? null : new Date(Date.UTC(2026, 9, tag, 12)).toISOString(),
  key: extra.key ?? id,
  sort: extra.sort ?? 0,
});
const ids = (liste: { id: string }[]) => liste.map((d) => d.id).join(" ");

describe("PART-109: Dateien — Offenes zuerst", () => {
  it("überfällig, offen und zurückgewiesen (hier darf hochgeladen werden) vor eingereicht, das vor angenommen", () => {
    const rein = [
      datei("angenommen", "accepted", 1),
      datei("eingereicht", "submitted", 1),
      datei("zurueck", "rejected", 20),
      datei("offen", "open", 20),
      datei("ueberfaellig", "overdue", 20),
    ];
    const raus = dateiReihenfolge(rein).map((d) => d.id);
    assert.deepEqual(raus.slice(0, 3).sort(), ["offen", "ueberfaellig", "zurueck"]);
    assert.deepEqual(raus.slice(3), ["eingereicht", "angenommen"]);
  });

  it("innerhalb einer Gruppe die früheste Frist zuerst, ohne Frist zuletzt", () => {
    const rein = [
      datei("ohne", "open", null),
      datei("spaet", "open", 28),
      datei("frueh", "overdue", 3),
      datei("mitte", "rejected", 15),
    ];
    assert.equal(ids(dateiReihenfolge(rein)), "frueh mitte spaet ohne");
  });

  it("zwei Dateien ohne Frist sind gleich früh: dann entscheidet die Reihenfolge der Pflicht (kein NaN im Vergleich)", () => {
    const rein = [datei("b", "open", null, { sort: 20 }), datei("a", "open", null, { sort: 10 })];
    assert.equal(ids(dateiReihenfolge(rein)), "a b");
  });

  it("bei gleicher Frist die Logos zuerst, dann `sort`, dann der Schlüssel", () => {
    const rein = [
      datei("z", "open", 10, { key: "rueckwand", sort: 5 }),
      datei("y", "open", 10, { key: "beachflag", sort: 5 }),
      datei("x", "open", 10, { key: "digital", sort: 1 }),
      datei("logo", "open", 10, { key: "logo_png", sort: 99 }),
    ];
    assert.equal(ids(dateiReihenfolge(rein)), "logo x y z");
  });

  it("verändert die übergebene Liste nicht", () => {
    const rein = [datei("b", "accepted", 1), datei("a", "open", 1)];
    const kopie = JSON.stringify(rein);
    dateiReihenfolge(rein);
    assert.equal(JSON.stringify(rein), kopie);
  });

  it("hochladen darf man bei offen, zurückgewiesen und überfällig — wie `submit_deliverable` —, sonst nicht", () => {
    assert.deepEqual([...HOCHLADBAR].sort(), ["open", "overdue", "rejected"]);
  });
});

describe("PART-109: Dateien — der Name in der Zeile", () => {
  it("das Format in Klammern, wenn die Regeln genau eines erlauben", () => {
    assert.equal(dateiName("Rückwand-Druckdatei", { ext: ["pdf"] }), "Rückwand-Druckdatei (PDF)");
    assert.equal(dateiName("Logo als Vektordatei", { ext: ["svg"] }), "Logo als Vektordatei (SVG)");
  });

  it("nennt der Name das Format schon, wird es nicht noch einmal angehängt („Logo als PNG“)", () => {
    assert.equal(dateiName("Logo als PNG", { ext: ["png"] }), "Logo als PNG");
    assert.equal(dateiName("Logo as png", { ext: ["png"] }), "Logo as png");
    // Nur ganze Wörter zählen: „PNGs“ nennt das Format nicht.
    assert.equal(dateiName("Alle PNGs", { ext: ["png"] }), "Alle PNGs (PNG)");
  });

  it("erlauben die Regeln mehrere Formate, steht keines da — das erste zu nennen hieße, den Rest zu verschweigen", () => {
    assert.equal(
      dateiName("Digital-Branding-Dateien", { ext: ["pdf", "png", "svg", "jpg", "jpeg", "zip"] }),
      "Digital-Branding-Dateien",
    );
    assert.equal(dateiName("Präsentation", { ext: ["pdf", "pptx"] }), "Präsentation");
  });

  it("ohne Regeln steht nur der Name; jpg und jpeg zählen als ein Format", () => {
    assert.equal(dateiName("Foto", null), "Foto");
    assert.equal(dateiName("Foto", { ext: [] }), "Foto");
    assert.equal(dateiName("Foto", { ext: ["jpg", "jpeg"] }), "Foto (JPG)");
    assert.equal(einzigesFormat({ ext: ["jpeg"] }), "JPG");
    assert.equal(einzigesFormat({ ext: ["PNG", "png"] }), "PNG");
    assert.equal(einzigesFormat({ ext: ["pdf", "png"] }), null);
  });

  it("das Format der hochgeladenen Datei kommt aus ihrem Namen; ohne Endung bleibt es leer", () => {
    assert.equal(dateiFormat({ filename: "logo-weiss.PNG", storage_path: "a/b/c" }), "PNG");
    assert.equal(dateiFormat({ filename: null, storage_path: "org/logo/v2.svg" }), "SVG");
    assert.equal(dateiFormat({ filename: "README", storage_path: "a/README" }), "");
  });
});

describe("PART-109: Dateien — eine Zeile je Datei", () => {
  it("die Uploads sind eine Tabelle, die am Handy stapelt: Datei, Stand, Frist, Aktion — der Name führt die Spalten an", () => {
    assert.equal((ansicht.match(/<Table stapeln>/g) ?? []).length, 2);
    assert.match(
      ansicht,
      /<Th className="w-1\/3">\{t\.colFile\}<\/Th>\s*<Th>\{t\.colState\}<\/Th>\s*<Th>\{t\.colDeadline\}<\/Th>\s*<Th>\s*<span className="sr-only">\{t\.colAction\}<\/span>\s*<\/Th>/,
    );
    // Die Zellen tragen ihre Beschriftung für die gestapelte Ansicht; der Name und die Aktion bleiben ohne.
    assert.match(ansicht, /<Td label=\{t\.colState\}>/);
    assert.match(ansicht, /<Td label=\{t\.colDeadline\}>/);
    assert.match(ansicht, /\{geordnet\.map\(\(d\) => \{/);
    assert.match(ansicht, /const geordnet = dateiReihenfolge\(pflichten\);/);
  });

  it("die Spalte der Aktion hat einen Namen für Vorlesesoftware — als Text, nicht als `aria-label` (das `Th` nicht weitergibt)", () => {
    assert.doesNotMatch(ansicht, /<Th aria-label/);
    assert.equal((ansicht.match(/<span className="sr-only">\{t\.colAction\}<\/span>/g) ?? []).length, 2);
  });

  it("der Name öffnet das Schubfach: Knopf in `ct-link`, `ct-ziel` macht die ganze Zelle zum Ziel; darunter die Leistung", () => {
    assert.match(
      ansicht,
      /<Td className="relative">\s*<button type="button" onClick=\{\(\) => setOffenId\(d\.id\)\} className="ct-link ct-ziel text-left font-medium">\s*\{name\}\s*<\/button>\s*<span className="ct-help mt-0\.5 block">\{kontext\[d\.id\]\}<\/span>/,
    );
  });

  it("der Stand steht in Wort und Farbe: fünf Stände, jeder mit seiner Marke; die Begründung nur bei Zurückgewiesen", () => {
    const m = /const STAND_TON: Record<Deliverable\["status"\], BadgeTone> = \{([^}]*)\}/.exec(ansicht);
    assert.ok(m, "STAND_TON");
    const ton = Object.fromEntries([...m[1].matchAll(/(\w+): "(\w+)"/g)].map((x) => [x[1], x[2]]));
    assert.deepEqual(ton, { open: "warning", overdue: "error", submitted: "accent", accepted: "success", rejected: "error" });
    assert.match(ansicht, /<Badge tone=\{STAND_TON\[d\.status\]\}>\{statusText\[d\.status\] \?\? d\.status\}<\/Badge>/);
    assert.match(ansicht, /\{d\.status === "rejected" && d\.review_note && \(/);
  });

  it("die Frist als `FristMarke kompakt`, wie bisher: nicht bei angenommenen Dateien; ohne Frist bleibt die Zelle leer", () => {
    assert.match(ansicht, /\{d\.due_at && d\.status !== "accepted" \? \(\s*<FristMarke\s+kompakt\b/);
    assert.match(ansicht, /vorbei=\{d\.status === "overdue"\}/);
    assert.match(ansicht, /vorbei=\{d\.status === "overdue"\}\s*t=\{fristTexte\}\s*\/>\s*\) : null\}\s*<\/Td>/);
  });

  it("die Aktion: Hochladen (öffnet das Schubfach), wo der Partner hochladen darf; sonst Öffnen der Datei; ohne Datei nichts", () => {
    assert.match(ansicht, /const darfHochladen = canEdit && HOCHLADBAR\.has\(d\.status\);/);
    assert.match(ansicht, /const name = dateiName\(label\(d\), d\.file_rules\);/);
    assert.match(
      ansicht,
      /\{darfHochladen \? \(\s*<Button\s+size="sm"\s+variant="secondary"\s+aria-label=\{`\$\{common\.upload\}: \$\{name\}`\}\s+onClick=\{\(\) => setOffenId\(d\.id\)\}\s*>\s*\{common\.upload\}\s*<\/Button>\s*\) : current \? \(\s*<Button\s+size="sm"\s+variant="secondary"\s+aria-label=\{`\$\{t\.actionOpen\}: \$\{name\}`\}\s+onClick=\{\(\) => void oeffnen\(current\.storage_path\)\}\s*>\s*\{t\.actionOpen\}\s*<\/Button>\s*\) : null\}/,
    );
  });

  it("der Zähler „n von total da“ bleibt am Kopf; ohne Pflichten steht der Satz, nicht eine leere Tabelle", () => {
    assert.match(ansicht, /t\.uploadsCount\s*\.replace\("\{n\}", String\(pflichten\.filter\(\(d\) => aktuelleFassung\(d\) !== null\)\.length\)\)\s*\.replace\("\{total\}", String\(pflichten\.length\)\)/);
    assert.match(ansicht, /pflichten\.length === 0 \? \(\s*<p className="ct-help">\{t\.uploadsNone\}<\/p>/);
  });

  it("keine Kacheln mehr auf dieser Seite: kein Raster, keine `UploadKachel`; sie bleibt im Logo-Abschnitt von „Eure Daten“", () => {
    assert.doesNotMatch(ansicht, /<UploadKachel\b/);
    assert.doesNotMatch(ansicht, /import \{[^}]*\bUploadKachel\b[^}]*\}/);
    assert.doesNotMatch(ansicht, /md:grid-cols-[23]/);
    assert.doesNotMatch(ansicht, /border-dashed/);
    assert.match(src("app/(partner)/partner/onboarding/EureDatenView.tsx"), /<UploadKachel\b/);
  });
});

describe("PART-109: Dateien — Angebot und Rechnungen", () => {
  it("eine Zeile je Beleg mit Datum, Größe und „Herunterladen“; die Größe ist eine Zahlenspalte", () => {
    assert.match(
      ansicht,
      /<Th>\{t\.docColDoc\}<\/Th>\s*<Th>\{t\.docColDate\}<\/Th>\s*<Th numeric>\{t\.docColSize\}<\/Th>/,
    );
    assert.match(ansicht, /<Td label=\{t\.docColDate\} className="text-muted">/);
    assert.match(ansicht, /<Td label=\{t\.docColSize\} numeric className="text-muted">/);
    assert.match(ansicht, /\{b\.size_bytes != null \? formatBytes\(b\.size_bytes\) : "—"\}/);
    // Jeder Knopf nennt seine Datei: „Hochladen“ allein stünde sechsmal untereinander (Vorlesesoftware).
    assert.match(
      ansicht,
      /<Button\s+size="sm"\s+variant="secondary"\s+aria-label=\{`\$\{t\.docDownload\}: \$\{t\[`doc_\$\{art\}`\]\}, \$\{datum\}`\}\s+onClick=\{\(\) => void oeffnen\(b\.storage_path\)\}\s*>\s*\{t\.docDownload\}/,
    );
  });

  it("gibt es zwei Rechnungen, sind es zwei Zeilen; eine Belegart ohne Datei steht als eine gedämpfte Zeile mit dem Satz, wann sie kommt", () => {
    assert.match(ansicht, /const BELEGARTEN = \["angebot", "rechnung", "messeshop_rechnung"\] as const;/);
    assert.match(ansicht, /return liste\.map\(\(b\) => \{\s*const datum = dateOnly\.format\(new Date\(b\.created_at\)\);\s*return \(\s*<Tr key=\{b\.id\}>/);
    assert.match(ansicht, /if \(liste\.length === 0\) \{\s*return \[\s*<Tr key=\{art\}>/);
    assert.match(ansicht, /<Td colSpan=\{3\} className="ct-small text-muted">\s*\{t\[`docEmpty_\$\{art\}`\]\}\s*<\/Td>/);
  });

  it("die Belege werden wie bisher beim Klick geholt (`useDateiOeffnen`, Adresse eine Minute), nicht beim Laden der Seite", () => {
    assert.match(ansicht, /const oeffnen = useDateiOeffnen\(t\.downloadFailed\);/);
    assert.doesNotMatch(ansicht, /createSignedUrl/);
  });
});

describe("PART-109: Dateien — Beschreibung, Vorschau und Upload im Schubfach", () => {
  it("das Schubfach ist ein `Drawer` mit dem Namen als Titel und der Fehlerzeile neben dem Knopf (ADM-062)", () => {
    assert.match(ansicht, /\{offen && \(\s*<Drawer\s+open\s+onClose=\{schliessen\}\s+title=\{label\(offen\)\}\s+closeLabel=\{common\.close\}\s+error=\{meldung\?\.art === "fehler" \? meldung\.text : null\}\s*>/);
    assert.match(ansicht, /const schliessen = \(\) => \{\s*setOffenId\(null\);\s*setMeldung\(null\);\s*\};/);
  });

  it("derselbe Upload an der Pflicht (PART-035): dieselben Haken, nur die Meldungen gehen ins Schubfach statt in einen Toast", () => {
    assert.match(ansicht, /usePflichtUpload\(\{[\s\S]*?meldung: \{\s*fehler: \(text\) => setMeldung\(\{ art: "fehler", text \}\),\s*erfolg: \(text\) => setMeldung\(\{ art: "erfolg", text \}\),\s*\},\s*\}\);/);
    assert.match(ansicht, /const vorschau = useVorschau\(pflichten\);/);
    assert.match(ansicht, /onFile=\{\(file\) => \{\s*setMeldung\(null\);\s*void hochladen\(offen, file\);\s*\}\}/);
    // Die anderen Stellen (Aufgabe in der Checkliste, Logo in „Eure Daten“) rufen den Haken ohne `meldung` und behalten den Toast.
    assert.match(kachel, /meldung\?: \{ fehler: \(text: string\) => void; erfolg: \(text: string\) => void \};/);
    assert.match(kachel, /const fehler = \(text: string\) => \(meldung \? meldung\.fehler\(text\) : toast\("error", text\)\);/);
    assert.match(kachel, /const erfolg = \(text: string\) => \(meldung \? meldung\.erfolg\(text\) : toast\("success", text\)\);/);
    const hochladen = kachel.slice(kachel.indexOf("async function hochladen"), kachel.indexOf("return { laedt, hochladen };"));
    assert.ok(hochladen.length > 200, "Rumpf von hochladen gefunden");
    assert.doesNotMatch(hochladen, /toast\(/);
    for (const stelle of ["checkliste/ChecklistView.tsx", "onboarding/EureDatenView.tsx"]) {
      const q = ohneKommentare(src(`app/(partner)/partner/${stelle}`));
      const aufruf = /usePflichtUpload\(\{[\s\S]*?\}\);/.exec(q);
      assert.ok(aufruf, stelle);
      assert.doesNotMatch(aufruf[0], /meldung:/, stelle);
    }
  });

  it("das Schubfach trägt Beschreibung, was wir brauchen, die aktuelle Datei samt Vorschau und die Rückmeldung der Prüfung", () => {
    assert.match(ansicht, /\{kontext && <p className="ct-eyebrow text-muted">\{kontext\}<\/p>\}/);
    assert.match(ansicht, /\{beschreibung && <p className="ct-small mt-1">\{beschreibung\}<\/p>\}/);
    assert.match(ansicht, /t\.uploadHint\.replace\("\{allowed\}", erlaubt\)\.replace\("\{max\}", formatBytes\(rules\?\.max_bytes \?\? 0\)\)/);
    assert.match(ansicht, /bg-pattern-transparent/);
    assert.match(ansicht, /alt=\{t\.previewAlt\.replace\("\{format\}", dateiFormat\(current\)\)\.trim\(\)\}/);
    assert.match(ansicht, /\{t\.reviewNote\}: \{pflicht\.review_note\}/);
    assert.match(ansicht, /\{t\.submittedOn\} \{dateTime\.format\(new Date\(pflicht\.submitted_at\)\)\}/);
  });

  it("die Abschnitte im Schubfach heißen in `ct-label` (der Titel ist `ct-h3`), der Hilfstext darunter in `ct-help`", () => {
    assert.doesNotMatch(ansicht, /ct-h3/);
    assert.match(ansicht, /<h3 id=\{`brauchen-\$\{pflicht\.id\}`\} className="ct-label text-ink">/);
    assert.match(ansicht, /<h3 id=\{`aktuell-\$\{pflicht\.id\}`\} className="ct-label text-ink">/);
    assert.match(ansicht, /<p className="ct-help mt-1">\s*\{t\.uploadHint/);
  });

  it("der Upload zweistufig (wählen, dann hochladen), nur wo der Partner hochladen darf; Auswählen ist zweitrangig", () => {
    assert.match(ansicht, /kannHochladen=\{canEdit && HOCHLADBAR\.has\(offen\.status\)\}/);
    assert.match(ansicht, /\{kannHochladen && \(\s*<div className="flex flex-col gap-2">/);
    assert.match(
      ansicht,
      /<FileButton\s+variant="secondary"\s+uploadLabel=\{common\.upload\}\s+changeLabel=\{common\.chooseOtherFile\}\s+label=\{laedt \? t\.uploading : uploadText\}\s+accept=\{acceptAttribute\(rules\)\}\s+disabled=\{laedt\}\s+laedt=\{laedt\}\s+onFile=\{onFile\}\s*\/>/,
    );
  });

  it("erlauben die Regeln mehrere Formate, heißt der Knopf nicht „PDF-Datei hochladen“ — sondern „Datei hochladen“", () => {
    assert.match(ansicht, /const format = einzigesFormat\(rules\);/);
    assert.match(
      ansicht,
      /const uploadText = format\s*\? \(current \? t\.replaceFormat : t\.uploadFormat\)\.replace\("\{format\}", format\)\s*: current\s*\? t\.replaceAny\s*: t\.uploadAny;/,
    );
  });

  it("der Erfolg steht bei der aktuellen Datei und nicht beim Knopf — der entfällt, sobald die Datei eingereicht ist", () => {
    const erfolg = ansicht.indexOf('{erfolg && <p className="ct-small text-success-ink">{erfolg}</p>}');
    const knopf = ansicht.indexOf("{kannHochladen && (");
    assert.ok(erfolg > 0 && knopf > erfolg, "Erfolg vor dem Upload-Block");
    // Der Platz für die Vorlesesoftware steht von Anfang an da.
    assert.match(ansicht, /<span role="status" className="sr-only">\s*\{erfolg \?\? ""\}\s*<\/span>/);
  });
});

describe("PART-109: Dateien — die Seite und die Texte", () => {
  it("die Seite sortiert nicht mehr selbst (das tut `dateiReihenfolge`) und gibt das Schließen-Wort ans Schubfach", () => {
    assert.doesNotMatch(seite, /logoZuerst/);
    assert.doesNotMatch(seite, /\.sort\(/);
    assert.match(seite, /common=\{\{ upload: t\.common\.upload, chooseOtherFile: t\.common\.chooseOtherFile, close: t\.common\.close \}\}/);
    // Die Fassungen bleiben darunter, mit eigener Überschrift.
    assert.match(seite, /<FileList rows=\{files\}/);
  });

  it("jeder Text, den die Ansicht anspricht, steht in DE und EN — auch die zusammengesetzten Belegschlüssel", () => {
    const gebraucht = new Set([...ansicht.matchAll(/\bt\.(\w+)/g)].map((m) => m[1]));
    for (const art of ["angebot", "rechnung", "messeshop_rechnung"]) {
      gebraucht.add(`doc_${art}`);
      gebraucht.add(`docEmpty_${art}`);
    }
    for (const sprache of ["de", "en"] as const) {
      const w = wb(sprache);
      const fehlt = [...gebraucht].filter((k) => !(k in w));
      assert.deepEqual(fehlt, [], `${sprache}: fehlt in partnerFiles`);
    }
  });

  it("die Einleitung ist ein Satz; das, was nur im Schubfach gilt (dasselbe Feld in der Checkliste), steht dort", () => {
    for (const sprache of ["de", "en"] as const) {
      const w = wb(sprache);
      assert.equal((w.uploadsLead.match(/[.!?](\s|$)/g) ?? []).length, 1, `${sprache}: uploadsLead`);
      assert.doesNotMatch(w.uploadsLead, /checklist|Checkliste/i);
      assert.match(w.drawerSameField, /checklist|Checkliste/i);
      assert.match(w.drawerVersion, /\{v\}/);
    }
  });

  it("der Schlüssel `docOpen` („Beleg vom {date}“) ist weg — die Zeile trägt Datum und Größe in eigenen Spalten", () => {
    for (const sprache of ["de", "en"] as const) assert.equal("docOpen" in wb(sprache), false);
    assert.doesNotMatch(ansicht, /docOpen/);
  });
});
