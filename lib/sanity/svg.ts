/**
 * Heuristische Prüfung, ob ein SVG eine deckende Hintergrundfläche hat. Die Website rendert Partner-Logos als einfarbige Maske
 * auf Navy — eine Hintergrundfläche wird dort zum gefüllten Rechteck. Das Web-Team lässt Logos mit `logoTransparent: false` aus.
 *
 * Rein, ohne DOM, testbar. Erkannt werden: `background` im `style` des Wurzelelements, `<rect>`, `<polygon>` und `<path>` als
 * Rechteck über die ganze Zeichenfläche mit Füllung (außerhalb von defs/clipPath/mask/pattern). Nicht erkannt: Hintergründe aus
 * `<style>`-Regeln, transformierte Flächen, eingebettete Rasterbilder (werden nur gemeldet). Deshalb bleibt die Prüfung des Teams
 * beim Freigeben der Pflicht `logo_vector` der eigentliche Schutz; die Heuristik fängt den häufigen Exportfehler ab.
 */
export type SvgCheck = {
  /** false = Hintergrundfläche erkannt. Unklare Fälle gelten als transparent — die Freigabe prüft ein Mensch. */
  transparent: boolean;
  reason: string | null;
  /** Eingebettetes Rasterbild (`<image>`): Transparenz nicht prüfbar, im Trockenlauf gemeldet. */
  raster: boolean;
};

type Box = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
const TOLERANCE = 0.02;

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(String.raw`(?:^|[\s"'])${name}\s*=\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[1] ?? m[2] ?? "").trim() : null;
}

function styleProp(style: string | null, prop: string): string | null {
  if (!style) return null;
  const m = style.match(new RegExp(String.raw`(?:^|;)\s*${prop}\s*:\s*([^;]+)`, "i"));
  return m ? m[1].trim() : null;
}

function num(value: string | null | undefined): number | null {
  if (value == null) return null;
  const m = value.trim().match(new RegExp(`^(${NUM})\\s*(px|pt|mm|cm|in)?$`, "i"));
  return m ? Number(m[1]) : null;
}

function isFull(value: string | null): boolean {
  return value != null && /^\s*100\s*%\s*$/.test(value);
}

/** Zeichenfläche aus `viewBox`, sonst aus width/height. */
function canvasOf(root: string): Box | null {
  const vb = attr(root, "viewBox");
  if (vb) {
    const parts = vb.split(/[\s,]+/).filter(Boolean).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n)) && parts[2] > 0 && parts[3] > 0) {
      return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
    }
  }
  const w = num(attr(root, "width"));
  const h = num(attr(root, "height"));
  return w && h && w > 0 && h > 0 ? { x: 0, y: 0, w, h } : null;
}

/** Füllt das Element sichtbar? Ohne Angabe füllt SVG schwarz — also ja. `style` schlägt das Attribut. */
function paints(tag: string): boolean {
  const style = attr(tag, "style");
  const fill = (styleProp(style, "fill") ?? attr(tag, "fill") ?? "").toLowerCase();
  if (fill === "none" || fill === "transparent" || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(fill)) return false;
  const fillOpacity = num(styleProp(style, "fill-opacity") ?? attr(tag, "fill-opacity"));
  const opacity = num(styleProp(style, "opacity") ?? attr(tag, "opacity"));
  if ((fillOpacity !== null && fillOpacity <= 0) || (opacity !== null && opacity <= 0)) return false;
  return true;
}

function covers(box: Box, canvas: Box): boolean {
  const tx = canvas.w * TOLERANCE;
  const ty = canvas.h * TOLERANCE;
  return box.x <= canvas.x + tx && box.y <= canvas.y + ty && box.x + box.w >= canvas.x + canvas.w - tx && box.y + box.h >= canvas.y + canvas.h - ty;
}

/** Punkte, die zusammen ein achsenparalleles Rechteck bilden (jeder Punkt eine Ecke) — sonst null. */
function rectangleOf(pts: Pt[]): Box | null {
  if (pts.length < 4 || pts.length > 6) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  if (box.w <= 0 || box.h <= 0) return null;
  const tx = box.w * 0.01;
  const ty = box.h * 0.01;
  const corners = pts.every(
    (p) => (Math.abs(p.x - box.x) <= tx || Math.abs(p.x - (box.x + box.w)) <= tx) && (Math.abs(p.y - box.y) <= ty || Math.abs(p.y - (box.y + box.h)) <= ty),
  );
  return corners ? box : null;
}

/** Nur gerade Befehle (M/L/H/V/Z, absolut oder relativ); eine Kurve oder ein Bogen heißt: kein Hintergrundrechteck. */
function pathPoints(d: string): Pt[] | null {
  const tokens = d.match(new RegExp(String.raw`[A-Za-z]|${NUM}`, "g"));
  if (!tokens) return null;
  const pts: Pt[] = [];
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt | null = null;
  let cmd = "";
  let i = 0;
  const next = (): number | null => {
    const t = tokens[i];
    if (t === undefined || /[A-Za-z]/.test(t)) return null;
    i += 1;
    return Number(t);
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i += 1;
      if (cmd === "Z" || cmd === "z") {
        if (start) cur = start;
        continue;
      }
    } else if (!cmd) {
      return null;
    }
    switch (cmd) {
      case "M":
      case "L": {
        const x = next();
        const y = next();
        if (x === null || y === null) return null;
        cur = { x, y };
        if (cmd === "M") {
          start = cur;
          cmd = "L";
        }
        pts.push(cur);
        break;
      }
      case "m":
      case "l": {
        const dx = next();
        const dy = next();
        if (dx === null || dy === null) return null;
        cur = { x: cur.x + dx, y: cur.y + dy };
        if (cmd === "m") {
          start = cur;
          cmd = "l";
        }
        pts.push(cur);
        break;
      }
      case "H": {
        const x = next();
        if (x === null) return null;
        cur = { x, y: cur.y };
        pts.push(cur);
        break;
      }
      case "h": {
        const dx = next();
        if (dx === null) return null;
        cur = { x: cur.x + dx, y: cur.y };
        pts.push(cur);
        break;
      }
      case "V": {
        const y = next();
        if (y === null) return null;
        cur = { x: cur.x, y };
        pts.push(cur);
        break;
      }
      case "v": {
        const dy = next();
        if (dy === null) return null;
        cur = { x: cur.x, y: cur.y + dy };
        pts.push(cur);
        break;
      }
      default:
        return null;
    }
  }
  return pts;
}

function polygonPoints(points: string): Pt[] | null {
  const nums = points.match(new RegExp(NUM, "g"))?.map(Number);
  if (!nums || nums.length < 8 || nums.length % 2 !== 0) return null;
  const pts: Pt[] = [];
  for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

/** Inhalte, deren Rechtecke keine sichtbaren Flächen sind (Clip-Pfade, Masken, Muster, Definitionen), plus Kommentare und Styles. */
function visibleBody(svg: string): string {
  return svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<(defs|clipPath|mask|pattern|symbol|marker|metadata|title|desc|style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
}

export function svgTransparency(svg: string): SvgCheck {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!root) return { transparent: true, reason: null, raster: false };
  const body = visibleBody(svg);
  const raster = /<image\b/i.test(body);

  const background = styleProp(attr(root, "style"), "background-color") ?? styleProp(attr(root, "style"), "background");
  if (background && !/^(none|transparent)$/i.test(background)) {
    return { transparent: false, reason: "Hintergrund im style des svg-Elements", raster };
  }

  const canvas = canvasOf(root);

  for (const [tag] of body.matchAll(/<rect\b[^>]*>/gi)) {
    if (!paints(tag)) continue;
    const w = attr(tag, "width");
    const h = attr(tag, "height");
    const x = num(attr(tag, "x")) ?? 0;
    const y = num(attr(tag, "y")) ?? 0;
    if (isFull(w) && isFull(h) && x <= 0 && y <= 0) return { transparent: false, reason: "rect über die ganze Fläche (100 %)", raster };
    const wn = num(w);
    const hn = num(h);
    if (canvas && wn !== null && hn !== null && covers({ x, y, w: wn, h: hn }, canvas)) {
      return { transparent: false, reason: "rect über die ganze Fläche", raster };
    }
  }

  if (canvas) {
    for (const [tag] of body.matchAll(/<polygon\b[^>]*>/gi)) {
      if (!paints(tag)) continue;
      const pts = polygonPoints(attr(tag, "points") ?? "");
      const box = pts ? rectangleOf(pts) : null;
      if (box && covers(box, canvas)) return { transparent: false, reason: "Polygon als Rechteck über die ganze Fläche", raster };
    }
    for (const [tag] of body.matchAll(/<path\b[^>]*>/gi)) {
      if (!paints(tag)) continue;
      const d = attr(tag, "d");
      if (!d) continue;
      const pts = pathPoints(d);
      const box = pts ? rectangleOf(pts) : null;
      if (box && covers(box, canvas)) return { transparent: false, reason: "Pfad als Rechteck über die ganze Fläche", raster };
    }
  }

  return { transparent: true, reason: null, raster };
}
