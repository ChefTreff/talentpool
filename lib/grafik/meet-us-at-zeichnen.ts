import {
  deckung,
  einpassen,
  initiale,
  kuerzen,
  layoutFuer,
  mitDeckkraft,
  schriftgroesseFuer,
  type FormatKey,
  type Layout,
  type Messer,
  type Rect,
  type Variante,
} from "@/lib/grafik/meet-us-at";

type Ctx = CanvasRenderingContext2D;

/** Die Farben der Grafik. Sie werden zur Laufzeit aus den Tokens gelesen, nie als Hex-Wert abgeschrieben (Skill-Regel 2). */
export type Farben = {
  navy: string;
  akzent: string;
  akzentWeich: string;
  akzentTief: string;
  highlight: string;
  text: string;
  textGedaempft: string;
  flaeche: string;
  rahmenDunkel: string;
};

/** CSS-Schriftlisten für die Leinwand (`--font-display`, `--font-accent`); eine Leinwand kennt kein `var()`. */
export type Schriften = { fett: string; kursiv: string };

/** Ein geladenes Bild samt seiner Maße — `naturalWidth` und `width` heißen je nach Quelle verschieden. */
export type Bild = { quelle: CanvasImageSource; breite: number; hoehe: number };

export type Bilder = { logo: Bild | null; foto: Bild | null };

export type Eingabe = {
  format: FormatKey;
  variante: Variante;
  /** Die zwei Zeilen der Überschrift, wie sie im Wörterbuch stehen („Meet“, „us at“). */
  kopf: [string, string];
  jahr: string;
  datumszeile: string;
  /** Sprache der Grafik (BCP 47), für die Großschreibung der Überschrift. */
  sprache: string;
  /** Logo-Motiv */
  plakette: "hell" | "dunkel";
  logoGroesse: number;
  /** Personen-Motiv */
  name: string;
  rolle: string;
  firma: string;
};

/** Winkel der Porträt-Maske (`--ct-tilt-mask`, `--ct-tilt-outline`) — dieselben wie `PortraitShape`. */
const WINKEL_MASKE = -16.6;
const WINKEL_UMRISS = 4.7;

const grad = (w: number) => (w * Math.PI) / 180;

/**
 * Die Grafik zeichnen. Reihenfolge: Grund, Motiv in der Mitte, Wortmarke und
 * Jahr, Überschrift, Datum, bei der Person Name und Firma. Text liegt nie auf
 * den Verlaufsflächen — die stehen hinter dem Motiv.
 *
 * Alles, was der Mensch tippt, wird eingepasst (kleiner, dann gekürzt), damit
 * ein langer Firmenname die Anordnung nicht sprengt.
 */
export function zeichneMeetUsAt(ctx: Ctx, e: Eingabe, bilder: Bilder, f: Farben, s: Schriften): void {
  const L = layoutFuer(e.format);
  ctx.save();
  ctx.clearRect(0, 0, L.breite, L.hoehe);
  ctx.textBaseline = "alphabetic";

  grund(ctx, L, f);
  if (e.variante === "person") personMotiv(ctx, L, e, bilder, f, s);
  else logoMotiv(ctx, L, e, bilder, f, s);

  wortmarkeUndJahr(ctx, L, e, f, s);
  ueberschrift(ctx, L, e, f, s);
  datum(ctx, L, e, f, s);
  if (e.variante === "person") personText(ctx, L, e, f, s);
  ctx.restore();
}

/* ---------------------------------------------------------------- Grund --- */

function grund(ctx: Ctx, L: Layout, f: Farben) {
  const { breite: W, hoehe: H, u } = L;
  ctx.fillStyle = f.navy;
  ctx.fillRect(0, 0, W, H);
  glut(ctx, W, H, W * 0.92, H * 0.04, W * 1.0, f.akzent, 0.5);
  glut(ctx, W, H, 0, H, W * 0.9, f.akzent, 0.28);

  // Zwei große Umrissdreiecke im Gegenwinkel, zum Teil außerhalb der Leinwand —
  // die dünne Linie der Vorlage, in der Form der Marke.
  umrissDreieck(ctx, { x: -0.38 * W, y: 0.22 * H, w: 1.15 * W, h: 1.15 * W }, WINKEL_UMRISS, f.akzent, 2.5 * u, 0.85);
  umrissDreieck(ctx, { x: 0.52 * W, y: 0.46 * H, w: 0.95 * W, h: 0.95 * W }, WINKEL_MASKE, f.akzent, 2.5 * u, 0.55);
}

function glut(ctx: Ctx, W: number, H: number, cx: number, cy: number, r: number, farbe: string, deckkraft: number) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, mitDeckkraft(farbe, deckkraft));
  g.addColorStop(1, mitDeckkraft(farbe, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/* ---------------------------------------------------------------- Formen --- */

/** Die Dreiecksmaske der Marke (`--ct-shape-triangle`): Spitze oben, Basis unten. */
function dreieck(ctx: Ctx, b: Rect) {
  ctx.beginPath();
  ctx.moveTo(b.x + b.w / 2, b.y);
  ctx.lineTo(b.x + b.w, b.y + b.h);
  ctx.lineTo(b.x, b.y + b.h);
  ctx.closePath();
}

/** Zeichnet `fn` um die Mitte von `b` gedreht. */
function gedreht(ctx: Ctx, b: Rect, winkel: number, fn: () => void) {
  ctx.save();
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  ctx.rotate(grad(winkel));
  ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
  fn();
  ctx.restore();
}

function umrissDreieck(ctx: Ctx, b: Rect, winkel: number, farbe: string, strich: number, deckkraft: number) {
  gedreht(ctx, b, winkel, () => {
    dreieck(ctx, b);
    ctx.lineWidth = strich;
    ctx.lineJoin = "round";
    ctx.strokeStyle = mitDeckkraft(farbe, deckkraft);
    ctx.stroke();
  });
}

/**
 * Verlauf wie `--ct-gradient-shape`: 110°, die Akzentfarbe blendet aus
 * „durchsichtig“ auf 60 % ein. CSS-`color-mix` kennt die Leinwand nicht, darum
 * zwei Haltepunkte mit Deckkraft.
 */
function verlauf110(ctx: Ctx, b: Rect, farbe: string) {
  const a = grad(110);
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const laenge = Math.abs(b.w * dx) + Math.abs(b.h * dy);
  const mx = b.x + b.w / 2;
  const my = b.y + b.h / 2;
  const g = ctx.createLinearGradient(
    mx - (dx * laenge) / 2,
    my - (dy * laenge) / 2,
    mx + (dx * laenge) / 2,
    my + (dy * laenge) / 2,
  );
  g.addColorStop(0, mitDeckkraft(farbe, 0));
  g.addColorStop(1, mitDeckkraft(farbe, 0.6));
  return g;
}

function rundesRechteck(ctx: Ctx, r: Rect, radius: number) {
  const k = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + k, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, k);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, k);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, k);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, k);
  ctx.closePath();
}

/* ---------------------------------------------------------------- Motive --- */

function logoMotiv(ctx: Ctx, L: Layout, e: Eingabe, bilder: Bilder, f: Farben, s: Schriften) {
  const p = L.plakette;
  const u = L.u;

  // Das Verlaufsdreieck der Marke schaut hinter der Fläche hervor.
  const dreieckBox: Rect = { x: p.x + p.w * 0.12, y: p.y - p.h * 0.32, w: p.h * 1.5, h: p.h * 1.5 };
  gedreht(ctx, dreieckBox, WINKEL_MASKE, () => {
    dreieck(ctx, dreieckBox);
    ctx.fillStyle = verlauf110(ctx, dreieckBox, f.akzent);
    ctx.fill();
  });

  rundesRechteck(ctx, p, 8 * u);
  ctx.fillStyle = e.plakette === "dunkel" ? f.rahmenDunkel : f.flaeche;
  ctx.fill();
  if (e.plakette === "dunkel") {
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = f.akzent;
    ctx.stroke();
  }

  if (bilder.logo) {
    const r = einpassen(bilder.logo.breite, bilder.logo.hoehe, L.logoFeld, e.logoGroesse);
    ctx.drawImage(bilder.logo.quelle, r.x, r.y, r.w, r.h);
    return;
  }
  // Ohne Logo steht der Firmenname als Platzhalter da, damit die Vorschau etwas zeigt.
  const text = e.firma.trim();
  if (!text) return;
  const messe: Messer = (t, g) => messen(ctx, `800 ${g}px ${s.fett}`, t);
  const start = Math.round(L.logoFeld.h * 0.28);
  const g = schriftgroesseFuer(messe, text, L.logoFeld.w, start, Math.round(start * 0.5));
  ctx.font = `800 ${g}px ${s.fett}`;
  ctx.fillStyle = e.plakette === "dunkel" ? f.text : f.navy;
  ctx.textAlign = "center";
  ctx.fillText(kuerzen(messe, text, L.logoFeld.w, g), L.logoFeld.x + L.logoFeld.w / 2, L.logoFeld.y + L.logoFeld.h / 2 + g * 0.35);
  ctx.textAlign = "left";
}

function personMotiv(ctx: Ctx, L: Layout, e: Eingabe, bilder: Bilder, f: Farben, s: Schriften) {
  const b = L.foto;

  // 1 · gekipptes Verlaufsdreieck dahinter (Masken-Winkel)
  gedreht(ctx, b, WINKEL_MASKE, () => {
    dreieck(ctx, b);
    ctx.fillStyle = verlauf110(ctx, b, f.akzent);
    ctx.fill();
  });

  // 2 · das Porträt im aufrechten Dreieck, etwas kleiner als die Verlaufsfläche
  //     (wie `PortraitShape`: 8 px seitlich, 12 px oben bei 168 px)
  const innen: Rect = { x: b.x + b.w * 0.048, y: b.y + b.h * 0.071, w: b.w * 0.904, h: b.h * 0.929 };
  ctx.save();
  dreieck(ctx, innen);
  ctx.clip();
  if (bilder.foto) {
    const q = deckung(bilder.foto.breite, bilder.foto.hoehe, innen.w, innen.h);
    if (q.sw > 0) ctx.drawImage(bilder.foto.quelle, q.sx, q.sy, q.sw, q.sh, innen.x, innen.y, innen.w, innen.h);
  } else {
    // Ohne Porträt die Soft-Fläche mit der Initiale, wie die Marke es ohne Foto zeigt.
    ctx.fillStyle = f.akzentWeich;
    ctx.fillRect(innen.x, innen.y, innen.w, innen.h);
    ctx.font = `800 ${Math.round(innen.h * 0.26)}px ${s.fett}`;
    ctx.fillStyle = f.akzentTief;
    ctx.textAlign = "center";
    ctx.fillText(initiale(e.name || e.firma), innen.x + innen.w / 2, innen.y + innen.h - innen.h * 0.1);
    ctx.textAlign = "left";
  }
  ctx.restore();

  // 3 · Umrissdreieck im Gegenwinkel
  umrissDreieck(ctx, b, WINKEL_UMRISS, f.akzent, 2.5 * L.u, 1);
}

/* ----------------------------------------------------------------- Texte --- */

function messen(ctx: Ctx, font: string, text: string): number {
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** Die drei Wörter der Wortmarke; jede Zeile wird auf die volle Breite des Blocks gezogen. */
const WORTMARKE = ["FUTURE", "LEADER", "SUMMIT"] as const;

function wortmarkeUndJahr(ctx: Ctx, L: Layout, e: Eingabe, f: Farben, s: Schriften) {
  const w = L.wortmarke;

  // Die Vorlage setzt „FUTURE LEADER SUMMIT“ in drei gleich breiten Zeilen. Die
  // Wortmarken-Datei im Repo trägt „CLUB“, darum wird sie hier als Schrift
  // gesetzt: dieselbe Schnittstärke, die Zeilen über den Buchstabenabstand auf
  // eine Breite gebracht.
  const takt = w.h / 3;
  const messe: Messer = (t, g) => messen(ctx, `800 ${g}px ${s.fett}`, t);
  const groesse = schriftgroesseFuer(messe, "SUMMIT", w.w * 0.96, Math.round(takt * 1.16), Math.round(takt * 0.7));
  ctx.font = `800 ${groesse}px ${s.fett}`;
  ctx.fillStyle = f.text;
  WORTMARKE.forEach((zeile, i) => {
    const zeichen = [...zeile];
    const breiten = zeichen.map((z) => ctx.measureText(z).width);
    const luecke = (w.w - breiten.reduce((a, b) => a + b, 0)) / (zeichen.length - 1);
    // Versalhöhe ≈ 0,7 em, mittig im Zeilenstreifen
    let x = w.x;
    const yBasis = w.y + takt * i + (takt + groesse * 0.7) / 2;
    zeichen.forEach((z, k) => {
      ctx.fillText(z, x, yBasis);
      x += breiten[k] + luecke;
    });
  });

  if (!e.jahr) return;
  // Die Ziffern in der Akzentschrift, über die Breite der Wortmarke gestreckt
  // (die Vorlage setzt „2 0 2 6“ so unter die drei Zeilen).
  const font = `italic 400 ${L.jahr.groesse}px ${s.kursiv}`;
  ctx.font = font;
  ctx.fillStyle = f.highlight;
  const zeichen = [...e.jahr];
  const breiten = zeichen.map((z) => ctx.measureText(z).width);
  const summe = breiten.reduce((a, b) => a + b, 0);
  const luecke = zeichen.length > 1 ? Math.max(L.jahr.groesse * 0.2, (w.w - summe) / (zeichen.length - 1)) : 0;
  let x = L.jahr.xRechts - (summe + luecke * (zeichen.length - 1));
  zeichen.forEach((z, i) => {
    ctx.fillText(z, x, L.jahr.yBasis);
    x += breiten[i] + luecke;
  });
}

function ueberschrift(ctx: Ctx, L: Layout, e: Eingabe, f: Farben, s: Schriften) {
  const zeilen = e.kopf.map((z) => z.toLocaleUpperCase(e.sprache)) as [string, string];
  const messe: Messer = (t, g) => messen(ctx, `800 ${g}px ${s.fett}`, t);
  const breiteste = zeilen.reduce((a, b) => (messe(a, L.kopf.groesse) >= messe(b, L.kopf.groesse) ? a : b));
  const g = schriftgroesseFuer(messe, breiteste, L.kopf.maxBreite, L.kopf.groesse, Math.round(L.kopf.groesse * 0.6));
  ctx.font = `800 ${g}px ${s.fett}`;
  ctx.fillStyle = f.text;
  ctx.textAlign = "left";
  ctx.fillText(zeilen[0], L.kopf.x, L.kopf.yBasis[0]);
  ctx.fillText(zeilen[1], L.kopf.x, L.kopf.yBasis[1]);
}

function datum(ctx: Ctx, L: Layout, e: Eingabe, f: Farben, s: Schriften) {
  if (!e.datumszeile) return;
  const messe: Messer = (t, g) => messen(ctx, `italic 400 ${g}px ${s.kursiv}`, t);
  const g = schriftgroesseFuer(messe, e.datumszeile, L.datum.maxBreite, L.datum.groesse, Math.round(L.datum.groesse * 0.7));
  ctx.font = `italic 400 ${g}px ${s.kursiv}`;
  ctx.fillStyle = f.highlight;
  ctx.textAlign = "left";
  ctx.fillText(kuerzen(messe, e.datumszeile, L.datum.maxBreite, g), L.datum.x, L.datum.yBasis);
}

/** Name, Position und Firma rechtsbündig, von unten nach oben gestapelt; leere Zeilen entfallen. */
function personText(ctx: Ctx, L: Layout, e: Eingabe, f: Farben, s: Schriften) {
  const p = L.person;
  const zeilen = [
    { text: e.firma.trim(), gewicht: 600, start: p.zeileGroesse, farbe: f.textGedaempft },
    { text: e.rolle.trim(), gewicht: 600, start: p.zeileGroesse, farbe: f.textGedaempft },
    { text: e.name.trim(), gewicht: 800, start: p.nameGroesse, farbe: f.text },
  ].filter((z) => z.text);

  ctx.textAlign = "right";
  let y = p.yBasis;
  for (const z of zeilen) {
    const messe: Messer = (t, g) => messen(ctx, `${z.gewicht} ${g}px ${s.fett}`, t);
    const g = schriftgroesseFuer(messe, z.text, p.maxBreite, z.start, Math.round(z.start * 0.6));
    ctx.font = `${z.gewicht} ${g}px ${s.fett}`;
    ctx.fillStyle = z.farbe;
    ctx.fillText(kuerzen(messe, z.text, p.maxBreite, g), p.xRechts, y);
    y -= Math.round(g * 1.45);
  }
  ctx.textAlign = "left";
}
