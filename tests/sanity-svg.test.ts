import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { svgTransparency } from "@/lib/sanity/svg";

const wrap = (inner: string, root = 'viewBox="0 0 1000 600"') => `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" ${root}>${inner}</svg>`;
const logo = '<g fill="#111"><path d="M100 100c50-80 200-80 250 0s-50 200-125 200S50 180 100 100z"/><rect x="400" y="200" width="200" height="120"/></g>';

describe("Sanity: SVG-Transparenzprüfung", () => {
  it("ein Logo aus Pfaden und kleinen Flächen gilt als transparent", () => {
    assert.deepEqual(svgTransparency(wrap(logo)), { transparent: true, reason: null, raster: false });
    assert.equal(svgTransparency("kein svg").transparent, true);
  });

  it("erkennt ein rect über die ganze Fläche — mit 100 %, mit Maßen, mit viewBox-Versatz, im style", () => {
    assert.equal(svgTransparency(wrap('<rect width="100%" height="100%" fill="#fff"/>' + logo)).transparent, false);
    assert.equal(svgTransparency(wrap('<rect x="0" y="0" width="1000" height="600" fill="white"/>' + logo)).transparent, false);
    assert.equal(svgTransparency(wrap('<rect width="1000" height="600"/>' + logo)).transparent, false, "ohne fill füllt SVG schwarz");
    assert.equal(svgTransparency(wrap('<rect x="-10" y="-10" width="120" height="120" fill="#000"/>', 'viewBox="-10 -10 120 120"')).transparent, false);
    assert.equal(svgTransparency(wrap('<rect width="1000" height="600" style="fill:#0b1f3a;stroke:none"/>' + logo)).transparent, false);
    assert.equal(svgTransparency(wrap('<rect width="500" height="300" fill="#fff"/>', 'width="500px" height="300px"')).transparent, false, "ohne viewBox zählen width/height");
  });

  it("lässt Rechtecke durch, die nichts verdecken: fill none, unsichtbar, zu klein, in clipPath/defs", () => {
    assert.equal(svgTransparency(wrap('<rect width="1000" height="600" fill="none"/>' + logo)).transparent, true);
    assert.equal(svgTransparency(wrap('<rect width="1000" height="600" fill="#fff" fill-opacity="0"/>' + logo)).transparent, true);
    assert.equal(svgTransparency(wrap('<rect width="1000" height="600" style="fill:#fff;opacity:0"/>' + logo)).transparent, true);
    assert.equal(svgTransparency(wrap('<rect x="100" y="100" width="800" height="400" fill="#fff"/>' + logo)).transparent, true);
    assert.equal(svgTransparency(wrap('<defs><rect id="bg" width="1000" height="600" fill="#fff"/></defs><clipPath id="c"><rect width="1000" height="600"/></clipPath>' + logo)).transparent, true);
    assert.equal(svgTransparency(wrap('<!-- <rect width="1000" height="600"/> -->' + logo)).transparent, true);
  });

  it("erkennt Hintergrundpfade und -polygone, nicht aber Pfade mit Kurven", () => {
    assert.equal(svgTransparency(wrap('<path d="M0 0h1000v600H0z" fill="#fff"/>' + logo)).reason, "Pfad als Rechteck über die ganze Fläche");
    assert.equal(svgTransparency(wrap('<path d="M0,0L1000,0L1000,600L0,600Z"/>' + logo)).transparent, false);
    assert.equal(svgTransparency(wrap('<path d="M 0 0 H 1000 V 600 H 0 L 0 0"/>' + logo)).transparent, false);
    assert.equal(svgTransparency(wrap('<path d="M0 0h1000v600H0z" fill="none"/>' + logo)).transparent, true);
    assert.equal(svgTransparency(wrap('<path d="M0 0h500v600H0z" fill="#fff"/>' + logo)).transparent, true, "halbe Fläche ist Gestaltung");
    assert.equal(svgTransparency(wrap('<polygon points="0,0 1000,0 1000,600 0,600" fill="#eee"/>' + logo)).reason, "Polygon als Rechteck über die ganze Fläche");
    assert.equal(svgTransparency(wrap('<polygon points="0,0 1000,0 500,600" fill="#eee"/>' + logo)).transparent, true, "Dreieck ist kein Hintergrund");
  });

  it("Hintergrund im style des Wurzelelements; eingebettete Rasterbilder werden nur gemeldet", () => {
    const styled = svgTransparency(wrap(logo, 'viewBox="0 0 10 10" style="background-color:#0b1f3a"'));
    assert.deepEqual(styled, { transparent: false, reason: "Hintergrund im style des svg-Elements", raster: false });
    assert.equal(svgTransparency(wrap(logo, 'viewBox="0 0 10 10" style="background: transparent"')).transparent, true);
    const raster = svgTransparency(wrap('<image href="data:image/png;base64,AAAA" width="1000" height="600"/>'));
    assert.deepEqual(raster, { transparent: true, reason: null, raster: true });
  });
});
