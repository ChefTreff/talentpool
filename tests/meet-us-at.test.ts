import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  FORMATE,
  FORMAT_SCHLUESSEL,
  VARIANTEN,
  WORTMARKE_ASPEKT,
  dateiname,
  dateiteil,
  datumszeile,
  deckung,
  einpassen,
  initiale,
  jahrVon,
  kuerzen,
  layoutFuer,
  mitDeckkraft,
  schriftgroesseFuer,
  type FormatKey,
  type Rect,
} from "@/lib/grafik/meet-us-at";
import {
  zeichneMeetUsAt,
  type Bild,
  type Eingabe,
  type Farben,
  type Schriften,
} from "@/lib/grafik/meet-us-at-zeichnen";
import de from "@/lib/i18n/de.json" with { type: "json" };
import en from "@/lib/i18n/en.json" with { type: "json" };

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Jede Zeichenbreite = halbe Schriftgröße: genug, um das Einpassen zu prüfen. */
const messe = (text: string, groesse: number) => text.length * groesse * 0.5;

describe("Meet us at: Anordnung je Format (PART-096)", () => {
  it("kennt Quadrat, Hochformat und Story mit den Maßen der Plattformen", () => {
    assert.deepEqual(FORMAT_SCHLUESSEL, ["quadrat", "hochformat", "story"]);
    assert.deepEqual(FORMATE.quadrat, { breite: 1200, hoehe: 1200 });
    assert.deepEqual(FORMATE.hochformat, { breite: 1080, hoehe: 1350 });
    assert.deepEqual(FORMATE.story, { breite: 1080, hoehe: 1920 });
  });

  for (const format of FORMAT_SCHLUESSEL) {
    const L = layoutFuer(format);
    const innen = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= L.breite && r.y + r.h <= L.hoehe;

    it(`${format}: alles liegt auf der Leinwand und innerhalb der Ränder`, () => {
      assert.equal(L.breite, FORMATE[format].breite);
      assert.equal(L.hoehe, FORMATE[format].hoehe);
      for (const r of [L.wortmarke, L.plakette, L.logoFeld, L.foto]) assert.ok(innen(r), JSON.stringify(r));
      assert.ok(L.wortmarke.x + L.wortmarke.w <= L.breite - L.rand, "Wortmarke hält den Rand");
      assert.ok(L.kopf.x >= L.rand && L.datum.x >= L.rand, "Text links hält den Rand");
      assert.ok(L.person.xRechts <= L.breite - L.rand, "Text rechts hält den Rand");
    });

    it(`${format}: der Wortmarken-Block steht im festen Verhältnis von drei Zeilen`, () => {
      assert.ok(Math.abs(L.wortmarke.h / L.wortmarke.w - WORTMARKE_ASPEKT) < 0.005);
    });

    it(`${format}: die Mitte stößt weder an die Überschrift noch an die Wortmarke`, () => {
      assert.ok(L.plakette.y + L.plakette.h <= L.kopf.oben, "Fläche über der Überschrift");
      assert.ok(L.foto.y + L.foto.h <= L.kopf.oben, "Porträt über der Überschrift");
      assert.ok(L.frei.y >= L.jahr.yBasis, "Fläche unter dem Jahr");
      assert.ok(L.plakette.y >= L.frei.y, "Fläche im freien Platz");
    });

    it(`${format}: das Dreieck des Porträts berührt die Wortmarke nicht`, () => {
      // Das Quadrat des Porträts darf bis an die Oberkante reichen; die Spitze ist
      // schmal. Geprüft wird die Form selbst, nicht ihr Quadrat.
      const { x, y, w, h } = L.foto;
      const imDreieck = (px: number, py: number) => {
        if (py < y || py > y + h) return false;
        const halb = ((py - y) / h) * (w / 2);
        return Math.abs(px - (x + w / 2)) <= halb;
      };
      const wm = L.wortmarke;
      const jahrOben = L.jahr.yBasis - L.jahr.groesse;
      for (const [px, py] of [
        [wm.x, wm.y],
        [wm.x, wm.y + wm.h],
        [wm.x, jahrOben],
        [wm.x, L.jahr.yBasis],
      ]) {
        assert.equal(imDreieck(px, py), false, `Ecke ${px}/${py} liegt im Dreieck`);
      }
    });

    it(`${format}: links Überschrift und Datum, rechts Name und Firma teilen sich die Breite`, () => {
      const linksEnde = L.kopf.x + L.kopf.maxBreite;
      const rechtsAnfang = L.person.xRechts - L.person.maxBreite;
      assert.ok(linksEnde < rechtsAnfang, `${linksEnde} < ${rechtsAnfang}`);
      assert.equal(L.datum.maxBreite, L.kopf.maxBreite);
    });

    it(`${format}: die Fläche für das Logo ist mittig und das Logofeld liegt in ihr`, () => {
      assert.ok(Math.abs(L.plakette.x * 2 + L.plakette.w - L.breite) <= 1);
      assert.ok(L.logoFeld.x > L.plakette.x && L.logoFeld.x + L.logoFeld.w < L.plakette.x + L.plakette.w);
      assert.ok(L.logoFeld.y > L.plakette.y && L.logoFeld.y + L.logoFeld.h < L.plakette.y + L.plakette.h);
    });
  }

  it("Story hält die Sicherheitszonen der Plattformen: oben 250, unten 340 Bildpunkte", () => {
    const L = layoutFuer("story");
    assert.ok(L.wortmarke.y >= 250, "oben");
    assert.ok(L.datum.yBasis <= L.hoehe - 340, "unten");
    assert.ok(L.person.yBasis <= L.hoehe - 340, "unten, Person");
  });

  it("das hohe Format gibt der Mitte mehr Platz als das Quadrat", () => {
    assert.ok(layoutFuer("story").plakette.h > layoutFuer("quadrat").plakette.h);
    assert.ok(layoutFuer("story").foto.w > layoutFuer("quadrat").foto.w - 1);
  });
});

describe("Meet us at: Bilder und Texte einpassen", () => {
  it("deckung: ein Querformat wird seitlich, ein Hochformat unten gekappt (der Kopf bleibt)", () => {
    assert.deepEqual(deckung(2000, 1000, 100, 100), { sx: 500, sy: 0, sw: 1000, sh: 1000 });
    assert.deepEqual(deckung(1000, 2000, 100, 100), { sx: 0, sy: 0, sw: 1000, sh: 1000 });
    assert.deepEqual(deckung(800, 800, 100, 100), { sx: 0, sy: 0, sw: 800, sh: 800 });
  });

  it("deckung: das Ziel muss nicht quadratisch sein", () => {
    const q = deckung(1000, 1000, 200, 100);
    assert.equal(q.sw / q.sh, 2);
    assert.equal(q.sw, 1000);
  });

  it("deckung: ohne Maße zeichnet sie nichts", () => {
    assert.deepEqual(deckung(0, 100, 10, 10), { sx: 0, sy: 0, sw: 0, sh: 0 });
    assert.deepEqual(deckung(100, 100, 0, 10), { sx: 0, sy: 0, sw: 0, sh: 0 });
  });

  it("einpassen: das Logo passt ganz in das Feld, mittig, ohne Verzerrung", () => {
    const feld: Rect = { x: 100, y: 100, w: 400, h: 200 };
    const r = einpassen(1000, 250, feld);
    assert.equal(r.w, 400);
    assert.equal(r.h, 100);
    assert.equal(r.x, 100);
    assert.equal(r.y, 150);
    const hoch = einpassen(100, 400, feld);
    assert.equal(hoch.h, 200);
    assert.equal(hoch.w, 50);
    assert.equal(hoch.x, 275);
  });

  it("einpassen: der Faktor verkleinert, vergrößert aber nie über das Feld hinaus", () => {
    const feld: Rect = { x: 0, y: 0, w: 400, h: 400 };
    assert.equal(einpassen(100, 100, feld, 0.5).w, 200);
    assert.equal(einpassen(100, 100, feld, 3).w, 400);
    assert.equal(einpassen(100, 100, feld, 0).w, 40, "nie ganz verschwinden");
  });

  it("einpassen: ohne Maße ein leeres Rechteck", () => {
    assert.equal(einpassen(0, 0, { x: 5, y: 6, w: 100, h: 100 }).w, 0);
  });

  it("schriftgroesseFuer: nimmt die Startgröße, wenn der Text passt, sonst die größte, die passt", () => {
    assert.equal(schriftgroesseFuer(messe, "abcd", 1000, 40, 20), 40);
    const g = schriftgroesseFuer(messe, "abcdefghij", 100, 60, 10);
    assert.ok(g < 60 && g >= 10);
    assert.ok(messe("abcdefghij", g) <= 100 || g === 10);
  });

  it("schriftgroesseFuer: unterschreitet das Minimum nie", () => {
    assert.equal(schriftgroesseFuer(messe, "x".repeat(500), 10, 60, 24), 24);
  });

  it("kuerzen: lässt Passendes, kürzt Überlanges mit Auslassungszeichen", () => {
    assert.equal(kuerzen(messe, "Anna", 1000, 20), "Anna");
    const k = kuerzen(messe, "Ein sehr langer Firmenname GmbH & Co. KG", 200, 20);
    assert.ok(k.endsWith("…"));
    assert.ok(messe(k, 20) <= 200);
  });

  it("mitDeckkraft: macht aus #rrggbb ein rgba und lässt andere Schreibweisen stehen", () => {
    assert.equal(mitDeckkraft("#6262dc", 0.5), "rgba(98, 98, 220, 0.5)");
    assert.equal(mitDeckkraft("#FF88CF", 2), "rgba(255, 136, 207, 1)");
    assert.equal(mitDeckkraft("rgb(1, 2, 3)", 0.5), "rgb(1, 2, 3)");
  });

  it("initiale: der erste Buchstabe, sonst ein Fragezeichen", () => {
    assert.equal(initiale("  anna Beispiel"), "A");
    assert.equal(initiale(""), "?");
  });
});

describe("Meet us at: Datum, Jahr und Dateiname", () => {
  it("datumszeile: Tage und Ort, in der Sprache der Grafik", () => {
    const d = datumszeile("2027-04-16", "2027-04-17", "de-DE", "CCH Hamburg");
    assert.match(d, /^16\.[–-]17\. April 2027 \| CCH Hamburg$/);
    const e = datumszeile("2027-04-16", "2027-04-17", "en-GB", "CCH Hamburg");
    assert.match(e, /^16[–-]17 April 2027 \| CCH Hamburg$/);
  });

  it("datumszeile: der Bindestrich ist zwischen zwei Tagen eng, über einen Monatswechsel weit", () => {
    assert.equal(datumszeile("2027-04-16", "2027-04-17", "en-GB", "X").split(" | ")[0], "16–17 April 2027");
    assert.match(datumszeile("2027-04-30", "2027-05-01", "en-GB", "X"), /^30 April[\s   ]+–[\s   ]+1 May 2027/);
  });

  it("datumszeile: ein einzelner Tag und fehlende Angaben", () => {
    assert.match(datumszeile("2027-04-16", "2027-04-16", "de-DE", "Halle"), /^16\. April 2027 \| Halle$/);
    assert.match(datumszeile("2027-04-16", null, "de-DE", "Halle"), /^16\. April 2027 \| Halle$/);
    assert.equal(datumszeile(null, null, "de-DE", "CCH Hamburg"), "CCH Hamburg");
    assert.equal(datumszeile("kein Datum", "x", "de-DE", "CCH Hamburg"), "CCH Hamburg");
  });

  it("datumszeile: eine Zeitzone verschiebt den Tag nicht (Datum ohne Uhrzeit, UTC)", () => {
    const vorher = process.env.TZ;
    try {
      for (const tz of ["Pacific/Honolulu", "Asia/Tokyo"]) {
        process.env.TZ = tz;
        assert.match(datumszeile("2027-04-16", "2027-04-17", "en-GB", "X"), /^16[–-]17 April 2027/);
      }
    } finally {
      if (vorher === undefined) delete process.env.TZ;
      else process.env.TZ = vorher;
    }
  });

  it("jahrVon: das Jahr der Edition für die Wortmarke", () => {
    assert.equal(jahrVon("2027-04-16"), "2027");
    assert.equal(jahrVon(null), "");
    assert.equal(jahrVon("morgen"), "");
  });

  it("dateiteil: nur Kleinbuchstaben, Ziffern und Bindestriche; Umlaute ohne Trennstrich", () => {
    assert.equal(dateiteil("Müller & Söhne GmbH"), "muller-sohne-gmbh");
    assert.equal(dateiteil("Straße"), "strasse");
    assert.equal(dateiteil("  --  "), "");
    assert.equal(dateiteil("../../etc/passwd"), "etc-passwd");
  });

  it("dateiname: Art, Name und Format; ohne Namen nur Art und Format", () => {
    assert.equal(dateiname("Beispiel GmbH", "story", "logo"), "meet-us-at-logo-beispiel-gmbh-story.png");
    assert.equal(dateiname("Anna Müller", "quadrat", "person"), "meet-us-at-person-anna-muller-quadrat.png");
    assert.equal(dateiname("", "hochformat", "logo"), "meet-us-at-logo-hochformat.png");
    assert.ok(dateiname("x".repeat(200), "story", "logo").length < 80, "der Name bleibt kurz");
  });
});

/* -------------------------------------------------------- Zeichnen (Attrappe) */

type Aufruf = { fn: string; args: unknown[]; font?: string; align?: string };

/** Eine Leinwand, die nur mitschreibt. Jede Zeichenbreite = halbe Schriftgröße. */
function attrappe() {
  const aufrufe: Aufruf[] = [];
  const ctx: Record<string, unknown> = {
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "miter",
    textAlign: "left",
    textBaseline: "alphabetic",
  };
  ctx.measureText = (text: string) => {
    const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(ctx.font))?.[1] ?? 10);
    return { width: text.length * px * 0.5 };
  };
  ctx.createLinearGradient = () => ({ addColorStop() {} });
  ctx.createRadialGradient = () => ({ addColorStop() {} });
  for (const fn of [
    "save", "restore", "clearRect", "fillRect", "beginPath", "moveTo", "lineTo", "closePath", "arcTo",
    "fill", "stroke", "clip", "translate", "rotate", "drawImage",
  ]) {
    ctx[fn] = (...args: unknown[]) => void aufrufe.push({ fn, args });
  }
  ctx.fillText = (text: string, x: number, y: number) =>
    void aufrufe.push({ fn: "fillText", args: [text, x, y], font: String(ctx.font), align: String(ctx.textAlign) });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, aufrufe };
}

const FARBEN: Farben = {
  navy: "#081a35",
  akzent: "#6262dc",
  akzentWeich: "#e8e8fc",
  akzentTief: "#4a4ac5",
  highlight: "#ff88cf",
  text: "#f5f4f2",
  textGedaempft: "#a0aab9",
  flaeche: "#ffffff",
  rahmenDunkel: "#1e3250",
};
const SCHRIFTEN: Schriften = { fett: "Test Fett", kursiv: "Test Kursiv" };
const bild = (breite: number, hoehe: number): Bild => ({ quelle: { __bild: true } as unknown as CanvasImageSource, breite, hoehe });

const EINGABE: Eingabe = {
  format: "quadrat",
  variante: "logo",
  kopf: ["Meet", "us at"],
  jahr: "2027",
  datumszeile: "16–17 April 2027 | CCH Hamburg",
  sprache: "en-GB",
  plakette: "hell",
  logoGroesse: 1,
  name: "Anna Beispiel",
  rolle: "Head of Talent",
  firma: "Beispiel GmbH",
};

const texte = (a: Aufruf[]) => a.filter((x) => x.fn === "fillText").map((x) => String(x.args[0]));

describe("Meet us at: Zeichnen", () => {
  it("setzt Überschrift in Versalien, das Jahr Ziffer für Ziffer und die Datumszeile", () => {
    const { ctx, aufrufe } = attrappe();
    zeichneMeetUsAt(ctx, EINGABE, { logo: null, foto: null }, FARBEN, SCHRIFTEN);
    const t = texte(aufrufe);
    assert.ok(t.includes("MEET") && t.includes("US AT"), t.join("|"));
    assert.deepEqual(["2", "0", "2", "7"].filter((z) => !t.includes(z)), []);
    assert.ok(t.includes(EINGABE.datumszeile));
  });

  it("die Überschrift folgt der Sprache der Grafik (deutsch: TREFFT / UNS BEIM)", () => {
    const { ctx, aufrufe } = attrappe();
    zeichneMeetUsAt(ctx, { ...EINGABE, kopf: ["Trefft", "uns beim"], sprache: "de-DE" }, { logo: null, foto: null }, FARBEN, SCHRIFTEN);
    const t = texte(aufrufe);
    assert.ok(t.includes("TREFFT") && t.includes("UNS BEIM"));
  });

  it("Logo-Motiv: das Logo kommt in das Logofeld, ohne Verzerrung; Name und Position der Person fehlen", () => {
    const logo = bild(1000, 250);
    const { ctx, aufrufe } = attrappe();
    zeichneMeetUsAt(ctx, { ...EINGABE, logoGroesse: 1 }, { logo, foto: null }, FARBEN, SCHRIFTEN);
    const L = layoutFuer("quadrat");
    const erwartet = einpassen(1000, 250, L.logoFeld, 1);
    const zeichnung = aufrufe.find((x) => x.fn === "drawImage" && x.args[0] === logo.quelle);
    assert.ok(zeichnung, "das Logo wird gezeichnet");
    assert.deepEqual(zeichnung.args.slice(1), [erwartet.x, erwartet.y, erwartet.w, erwartet.h]);
    const t = texte(aufrufe);
    assert.ok(!t.includes("Anna Beispiel") && !t.includes("Head of Talent"));
  });

  it("Logo-Motiv ohne Logo: der Firmenname steht als Platzhalter da", () => {
    const { ctx, aufrufe } = attrappe();
    zeichneMeetUsAt(ctx, EINGABE, { logo: null, foto: null }, FARBEN, SCHRIFTEN);
    assert.ok(texte(aufrufe).includes("Beispiel GmbH"));
  });

  it("Personen-Motiv: Name, Position und Firma stehen rechtsbündig, das Porträt füllt das Dreieck", () => {
    const foto = bild(1200, 1200);
    const { ctx, aufrufe } = attrappe();
    zeichneMeetUsAt(ctx, { ...EINGABE, variante: "person" }, { logo: null, foto }, FARBEN, SCHRIFTEN);
    for (const zeile of ["Anna Beispiel", "Head of Talent", "Beispiel GmbH"]) {
      const a = aufrufe.find((x) => x.fn === "fillText" && x.args[0] === zeile);
      assert.ok(a, zeile);
      assert.equal(a.align, "right");
    }
    const bildZeichnung = aufrufe.find((x) => x.fn === "drawImage" && x.args[0] === foto.quelle);
    assert.ok(bildZeichnung, "das Porträt wird gezeichnet");
    assert.equal(bildZeichnung.args.length, 9, "mit Quellrechteck");
    // Das Porträt wird beschnitten: vor dem Zeichnen läuft `clip`.
    const iClip = aufrufe.findIndex((x) => x.fn === "clip");
    assert.ok(iClip >= 0 && iClip < aufrufe.indexOf(bildZeichnung));
  });

  it("Personen-Motiv ohne Porträt: die Initiale steht im Dreieck", () => {
    const { ctx, aufrufe } = attrappe();
    zeichneMeetUsAt(ctx, { ...EINGABE, variante: "person" }, { logo: null, foto: null }, FARBEN, SCHRIFTEN);
    assert.ok(texte(aufrufe).includes("A"));
  });

  it("Personen-Motiv: leere Angaben entfallen, kein Name = die Zeilen rücken nach", () => {
    const { ctx, aufrufe } = attrappe();
    zeichneMeetUsAt(ctx, { ...EINGABE, variante: "person", rolle: "", name: "" }, { logo: null, foto: null }, FARBEN, SCHRIFTEN);
    const t = texte(aufrufe);
    assert.ok(t.includes("Beispiel GmbH"));
    assert.ok(!t.includes("Head of Talent") && !t.includes("Anna Beispiel"));
  });

  it("lange Angaben werden kleiner gesetzt und zuletzt gekürzt, sie sprengen die Breite nicht", () => {
    const lang = "Gesellschaft für sehr lange und unaussprechliche Firmennamen mbH & Co. Kommanditgesellschaft";
    const { ctx, aufrufe } = attrappe();
    zeichneMeetUsAt(ctx, { ...EINGABE, variante: "person", firma: lang, name: lang }, { logo: null, foto: null }, FARBEN, SCHRIFTEN);
    const L = layoutFuer("quadrat");
    for (const a of aufrufe.filter((x) => x.fn === "fillText" && String(x.args[0]).startsWith("Gesellschaft"))) {
      const px = Number(/(\d+)px/.exec(a.font ?? "")?.[1]);
      assert.ok(messe(String(a.args[0]), px) <= L.person.maxBreite, `${a.args[0]} @${px}px`);
      assert.ok(String(a.args[0]).endsWith("…"));
    }
  });

  it("zeichnet in jedem Format und Motiv ohne Fehler; save und restore gehen auf", () => {
    for (const format of FORMAT_SCHLUESSEL as FormatKey[]) {
      for (const variante of VARIANTEN) {
        const { ctx, aufrufe } = attrappe();
        zeichneMeetUsAt(
          ctx,
          { ...EINGABE, format, variante },
          { logo: bild(500, 500), foto: bild(900, 1200) },
          FARBEN,
          SCHRIFTEN,
        );
        const auf = aufrufe.filter((x) => x.fn === "save").length;
        const zu = aufrufe.filter((x) => x.fn === "restore").length;
        assert.equal(auf, zu, `${format}/${variante}`);
        const loeschen = aufrufe.find((x) => x.fn === "clearRect");
        assert.deepEqual(loeschen?.args, [0, 0, FORMATE[format].breite, FORMATE[format].hoehe]);
      }
    }
  });

  it("ohne Jahr bleibt die Stelle unter der Wortmarke leer", () => {
    const { ctx, aufrufe } = attrappe();
    zeichneMeetUsAt(ctx, { ...EINGABE, jahr: "" }, { logo: null, foto: null }, FARBEN, SCHRIFTEN);
    assert.ok(!texte(aufrufe).some((z) => /^\d$/.test(z)));
  });
});

describe("Meet us at: Wörterbücher, Wortmarke und Datenschutz", () => {
  it("DE und EN haben dieselben Schlüssel", () => {
    assert.deepEqual(Object.keys(de.partnerMeetUs).sort(), Object.keys(en.partnerMeetUs).sort());
    assert.deepEqual(Object.keys(de.meetUsAtGrafik).sort(), Object.keys(en.meetUsAtGrafik).sort());
  });

  it("jedes Format hat seinen Namen, den die Auswahl über den Schlüssel `format<Format>` sucht", () => {
    for (const k of FORMAT_SCHLUESSEL) {
      const key = `format${k[0].toUpperCase()}${k.slice(1)}`;
      assert.ok((de.partnerMeetUs as Record<string, string>)[key], `de ${key}`);
      assert.ok((en.partnerMeetUs as Record<string, string>)[key], `en ${key}`);
    }
  });

  it("die Platzhalter stehen in beiden Sprachen", () => {
    for (const w of [de.partnerMeetUs, en.partnerMeetUs]) {
      assert.match(w.logoStored, /\{name\}/);
      assert.match(w.logoChosen, /\{name\}/);
      assert.match(w.previewLabel, /\{motif\}.*\{format\}/);
    }
  });

  it("was auf der Grafik steht, hat in jeder Sprache eine Überschrift, einen Ort und ein Datumsformat", () => {
    for (const g of [de.meetUsAtGrafik, en.meetUsAtGrafik]) {
      assert.ok(g.head1 && g.head2 && g.venue && g.dateLocale);
    }
    assert.equal(de.meetUsAtGrafik.dateLocale, "de-DE");
    assert.equal(en.meetUsAtGrafik.dateLocale, "en-GB");
  });

  it("die Wortmarke wird als Schrift gesetzt: „SUMMIT“, nicht „CLUB“ der Wortmarken-Datei", () => {
    const { ctx, aufrufe } = attrappe();
    zeichneMeetUsAt(ctx, EINGABE, { logo: null, foto: null }, FARBEN, SCHRIFTEN);
    const einzeln = aufrufe.filter((x) => x.fn === "fillText" && String(x.args[0]).length === 1).map((x) => String(x.args[0]));
    assert.ok(einzeln.join("").startsWith("FUTURELEADERSUMMIT"), einzeln.join(""));
    // jede der drei Zeilen reicht vom linken bis zum rechten Rand des Blocks
    const L = layoutFuer("quadrat");
    const xs = aufrufe.filter((x) => x.fn === "fillText" && String(x.args[0]).length === 1).slice(0, 18).map((x) => Number(x.args[1]));
    for (const zeile of [0, 1, 2]) assert.equal(Math.round(xs[zeile * 6]), L.wortmarke.x, `Zeile ${zeile} beginnt links im Block`);
    assert.doesNotMatch(src("lib/grafik/meet-us-at-zeichnen.ts"), /fls-wortmarke/, "die Club-Wortmarke wird nicht geladen");
  });

  it("die Grafik bleibt im Browser: die Komponente lädt nichts hoch", () => {
    const q = src("components/partner/MeetUsAt.tsx");
    assert.doesNotMatch(q, /\.upload\(|uploadToSignedUrl|method:\s*"POST"|postJson|FormData|sendBeacon/);
    assert.match(q, /toBlob\(/, "der Export läuft über die Leinwand");
  });

  it("die Seite prüft den Bereich und reicht nur Name und Position der Kontakte weiter, keine Adresse", () => {
    const q = src("app/(partner)/partner/media/grafik/page.tsx");
    assert.match(q, /requireArea\("partner"/);
    const kontakte = q.slice(q.indexOf("const kontakte"), q.indexOf("return ("));
    assert.doesNotMatch(kontakte, /email/);
  });

  it("das Media Kit verweist auf die Grafik, als sekundäre Aktion", () => {
    const q = src("app/(partner)/partner/media/page.tsx");
    assert.match(q, /href="\/partner\/media\/grafik"\s+variant="secondary"/);
  });
});
