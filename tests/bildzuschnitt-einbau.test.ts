import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * ADM-066: Der Zuschnitt-Dialog sitzt an allen vier Stellen, an denen ein Foto einer Person
 * hochgeladen wird (Talent-Porträt, Speaker-Foto, Ansprechperson im Admin, Foto eines Gastes) —
 * und an keiner geht die Originaldatei mehr am Dialog vorbei. Die Rechnung dahinter steht in
 * `bildzuschnitt.test.ts`; hier geht es um den Einbau, die Texte und die Fallen im Hook.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
/** Der Quelltext ohne Kommentare: Kommentare nennen Dinge, die der Code nicht tut. */
const code = (pfad: string) =>
  lies(pfad)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((zeile) => !/^\s*\/\//.test(zeile))
    .join("\n");

const DIALOG = "components/ui/BildZuschnitt.tsx";
const HOOK = "components/ui/useBildAusschnitt.ts";

type Stelle = {
  name: string;
  datei: string;
  /** Was die Dateiwahl tut: die Datei in den Zustand für den Dialog legen. */
  waehlen: RegExp;
  /** Was mit dem Ausschnitt geschieht, den der Dialog liefert. */
  uebernehmen: RegExp;
  /** So darf die gewählte Datei nicht mehr weiterlaufen (am Dialog vorbei). */
  verboten: RegExp;
};

const STELLEN: Stelle[] = [
  {
    name: "Talent-Porträt",
    datei: "app/(talent)/profil/PortraitUpload.tsx",
    waehlen: /setZuschnitt\(file\)/,
    uebernehmen: /onFertig=\{\(fertig\) => \{[^}]*hochladen\(fertig\)/,
    verboten: /async function onFile\b/,
  },
  {
    name: "Speaker-Foto",
    datei: "components/speaker/PhotoUpload.tsx",
    waehlen: /setZuschnitt\(file\)/,
    uebernehmen: /onFertig=\{\(fertig\) => \{[^}]*hochladen\(fertig\)/,
    verboten: /async function onFile\b/,
  },
  {
    name: "Ansprechperson (Admin)",
    datei: "app/(admin)/admin/ansprechpartner/KontakteAdmin.tsx",
    waehlen: /setZuschnitt\(datei\)/,
    uebernehmen: /onFertig=\{\(fertig\) => \{[^}]*bildHochladen\(fertig\)/,
    // Der Upload hing früher direkt im `onFile` der Dateiwahl.
    verboten: /onFile=\{async/,
  },
  {
    name: "Gäste-Foto",
    datei: "components/partner/Gaesteliste.tsx",
    waehlen: /setZuschnitt\(file\)/,
    uebernehmen: /onFertig=\{\(fertig\) => \{[^}]*setFoto\(fertig\)/,
    verboten: /setFoto\(file\)/,
  },
];

describe("Vier Stellen schneiden zu, bevor etwas hochgeladen wird (ADM-066)", () => {
  for (const s of STELLEN) {
    describe(s.name, () => {
      const text = code(s.datei);

      it("holt den Dialog aus dem Kit", () => {
        assert.match(text, /import \{ BildZuschnitt \} from "@\/components\/ui\/BildZuschnitt";/);
        assert.match(text, /<BildZuschnitt\b/);
      });

      it("legt die gewählte Datei in den Zustand des Dialogs", () => {
        assert.match(text, /useState<File \| null>\(null\)/);
        assert.match(text, s.waehlen);
      });

      it("lädt nur den Ausschnitt hoch und schließt den Dialog zuerst", () => {
        assert.match(text, s.uebernehmen);
        // Zuerst zu, dann weiter: ein Dialog, der beim Hochladen noch offen steht, fängt den Fokus ab.
        assert.match(text, /onFertig=\{\(fertig\) => \{\s*setZuschnitt\(null\);/);
        assert.match(text, /onAbbruch=\{\(\) => setZuschnitt\(null\)\}/);
      });

      it("lässt die Originaldatei nicht mehr am Dialog vorbei laufen", () => {
        assert.doesNotMatch(text, s.verboten);
      });
    });
  }

  it("prüft Typ und Größe vor dem Dialog: ein Foto, das ohnehin abgelehnt würde, wird nicht erst zugeschnitten", () => {
    for (const s of STELLEN) {
      const text = code(s.datei);
      const wahl = text.indexOf("setZuschnitt(file)") >= 0 ? text.indexOf("setZuschnitt(file)") : text.indexOf("setZuschnitt(datei)");
      assert.ok(wahl > 0, `${s.name}: Dateiwahl gefunden`);
      assert.match(text.slice(0, wahl), /size > /, `${s.name}: Größenprüfung steht vor dem Dialog`);
    }
  });
});

describe("Die Texte des Dialogs kommen aus dem Layout (ADM-066)", () => {
  it("das Wurzel-Layout gibt sie in der Sprache der Seite weiter", () => {
    assert.match(code("app/layout.tsx"), /<ZuschnittTexteGeber texte=\{t\.zuschnitt\}>/);
  });

  it("die Shell gibt sie in der Sprache des Bereichs weiter (innerhalb der Fehler-Texte)", () => {
    const shell = code("components/layout/SidebarShell.tsx");
    assert.match(shell, /<ZuschnittTexteGeber texte=\{t\.zuschnitt\}>\{children\}<\/ZuschnittTexteGeber>/);
  });

  it("das Kit führt Dialog und Geber in der Sammelstelle", () => {
    assert.match(lies("components/ui/index.ts"), /export \{ BildZuschnitt, ZuschnittTexteGeber, type ZuschnittTexte \} from "\.\/BildZuschnitt";/);
  });

  it("ohne Texte bricht der Dialog laut ab, statt leere Beschriftungen zu zeigen", () => {
    assert.match(code(DIALOG), /if \(!t\) throw new Error\(/);
  });
});

describe("Wörterbuch (ADM-066)", () => {
  const de = JSON.parse(lies("lib/i18n/de.json")) as { zuschnitt?: Record<string, string> };
  const en = JSON.parse(lies("lib/i18n/en.json")) as { zuschnitt?: Record<string, string> };
  const typ = /export type ZuschnittTexte = \{([\s\S]*?)\n\};/.exec(lies(DIALOG))?.[1] ?? "";
  const schluessel = [...typ.matchAll(/^\s{2}(\w+): string;/gm)].map((m) => m[1]).sort();

  it("der Typ nennt die zehn Texte des Dialogs", () => {
    assert.equal(schluessel.length, 10);
  });

  it("Deutsch und Englisch führen genau diese Schlüssel", () => {
    assert.deepEqual(Object.keys(de.zuschnitt ?? {}).sort(), schluessel);
    assert.deepEqual(Object.keys(en.zuschnitt ?? {}).sort(), schluessel);
  });

  it("nichts ist leer, und die englischen Texte sind übersetzt", () => {
    for (const [sprache, w] of [["de", de], ["en", en]] as const) {
      for (const [k, v] of Object.entries(w.zuschnitt ?? {})) {
        assert.ok(v.trim().length > 0, `${sprache}.${k} ist leer`);
      }
    }
    for (const k of ["title", "apply", "cancel", "reset", "hintDreieck"]) {
      assert.notEqual(de.zuschnitt?.[k], en.zuschnitt?.[k], `zuschnitt.${k} ist im Englischen nicht übersetzt`);
    }
  });
});

describe("Dialog und Hook halten die Regeln des Kits (ADM-066)", () => {
  const dialog = code(DIALOG);
  const hook = code(HOOK);

  it("der Dialog lädt nichts hoch: das macht der Aufrufer mit seinen Rechten", () => {
    assert.doesNotMatch(dialog, /\bfetch\(|supabase|storage|upload/i);
  });

  it("der Dialog ist das native Modal des Kits (Fokusfalle vom Browser)", () => {
    assert.match(dialog, /import \{ Modal \} from "\.\/Modal";/);
    assert.match(dialog, /<Modal\b/);
  });

  it("keine rohen Farben und keine rohen Pixelmaße (Skill-Regel 2)", () => {
    for (const [name, text] of [["Dialog", dialog], ["Hook", hook]] as const) {
      assert.doesNotMatch(text, /#[0-9a-fA-F]{3,8}\b/, `${name}: Hex-Farbe`);
      assert.doesNotMatch(text, /\[\d+(\.\d+)?px\]/, `${name}: Pixelmaß in eckigen Klammern`);
    }
  });

  it("der Zoomregler hat auf groben Zeigern 44 px Höhe (Skill-Regel 7)", () => {
    assert.match(dialog, /type="range"[\s\S]*?pointer-coarse:h-11/);
  });

  it("der Hook kann mit der Tastatur bedient werden: fokussierbar, Pfeile, Plus und Minus", () => {
    assert.match(hook, /tabIndex: bild \? 0 : -1/);
    assert.match(hook, /ArrowLeft/);
    assert.match(hook, /e\.key === "\+"/);
    assert.match(hook, /e\.key === "-"/);
  });

  it("das Mausrad hat einen eigenen, nicht-passiven Hörer, den der Hook wieder abmeldet", () => {
    assert.match(hook, /addEventListener\("wheel", rad, \{ passive: false \}\)/);
    assert.match(hook, /removeEventListener\("wheel", rad\)/);
  });

  it("Pinch: der alte Abstand wird festgehalten, bevor die Zoom-Funktion läuft", () => {
    // Die Funktion in `setLage` läuft erst beim nächsten Rendern; liest sie `abstand.current` dann,
    // steht dort schon der neue Abstand, und der Faktor wäre immer 1 (die Zoomgeste täte nichts).
    assert.doesNotMatch(hook, /=>[^;\n]*abstand\.current/);
    assert.match(hook, /const vorher = abstand\.current;\s*abstand\.current = neu;/);
  });

  it("ein verschwundener Zeiger bricht den Hörer nicht ab", () => {
    assert.match(hook, /try \{\s*e\.currentTarget\.setPointerCapture\(e\.pointerId\);\s*\} catch/);
  });

  it("Lage und Zeichnen liegen im Hook, der Dialog benutzt ihn", () => {
    assert.match(dialog, /import \{ useBildAusschnitt \} from "\.\/useBildAusschnitt";/);
    assert.match(dialog, /useBildAusschnitt\(datei, VORSCHAU\)/);
    assert.match(hook, /export function useBildAusschnitt\(/);
    // Der Dialog zeichnet nicht selbst ins Canvas der Vorschau.
    assert.doesNotMatch(dialog, /getContext\("2d"\)[\s\S]*clearRect/);
  });

  it("der Hook reicht eine Überblendung an die Fläche weiter (Rahmen, Maske) und bleibt maßunabhängig", () => {
    assert.match(hook, /zeichneUeber\?\.\(ctx, !!bild\)/);
    assert.match(hook, /datei: File \| null,\s*kante: number,/);
  });
});
