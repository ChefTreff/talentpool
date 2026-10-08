import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { markdownToHtml, markdownToText } from "@/lib/mail/render";
import { knopfProbleme } from "@/lib/mail/knoepfe";
import { parseInline } from "@/components/wiki/markdown-parse";
import { MAIL_LEISTE, WERKZEUGE, flach, wendeAn } from "@/lib/markdown-werkzeuge";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Mail-Renderer: Kursiv und Knopf (ADM-102 f)", () => {
  it("*kursiv* wird <em>, ** bleibt fett, ein einzelner Stern ohne Gegenstück bleibt stehen", () => {
    assert.match(markdownToHtml("Ein *wichtiges* Wort"), /Ein <em>wichtiges<\/em> Wort/);
    assert.match(markdownToHtml("**fett** und *kursiv*"), /<strong>fett<\/strong> und <em>kursiv<\/em>/);
    assert.ok(!markdownToHtml("2 * 3 = 6").includes("<em>"), "Malzeichen mit Leerzeichen ist kein Kursiv");
    assert.ok(!markdownToHtml("Nur ein * Stern").includes("<em>"));
  });

  it("ein Link mit dem Titel „knopf“ wird ein Knopf, jeder andere Link bleibt ein Link", () => {
    const knopf = markdownToHtml('[Jetzt anmelden](https://portal.example/login?a=1&b=2 "knopf")');
    assert.match(knopf, /<a href="https:\/\/portal\.example\/login\?a=1&amp;b=2" style="display:inline-block;padding:12px 20px;background:#5B5BD9;color:#FFFFFF/);
    assert.match(knopf, />Jetzt anmelden<\/a>/);
    const link = markdownToHtml("[Zum Portal](https://portal.example)");
    assert.match(link, /style="color:#5B5BD9"/);
    assert.ok(!link.includes("inline-block"));
    const andererTitel = markdownToHtml('[Zum Portal](https://portal.example "irgendwas")');
    assert.match(andererTitel, /style="color:#5B5BD9"/, "ein anderer Titel macht keinen Knopf");
  });

  it("die Sicherheit bleibt: nur http(s) und mailto, auch beim Knopf; Titel und Beschriftung werden escaped", () => {
    const boese = markdownToHtml('[Klick](javascript:alert(1) "knopf")');
    assert.ok(!boese.includes("<a "), "kein Link zu javascript:");
    const html = markdownToHtml('[<b>x</b>](https://a.example "knopf")');
    assert.ok(!html.includes("<b>"), "HTML in der Beschriftung wird escaped");
  });

  it("die Textfassung der Mail zeigt einen Knopf wie jeden Link: „Beschriftung: Adresse“, ohne Sterne", () => {
    assert.equal(markdownToText('Bitte [jetzt anmelden](https://portal.example "knopf") — das ist *wichtig*.'), "Bitte jetzt anmelden: https://portal.example — das ist wichtig.");
    assert.equal(markdownToText("[Link](https://a.example)"), "Link: https://a.example");
  });

  it("ein Renderer ohne die Erweiterung zeigt nichts Kaputtes: der Wiki-Renderer macht aus dem Knopf einen gewöhnlichen Link", () => {
    const teile = parseInline('Siehe [Jetzt anmelden](https://portal.example "knopf").');
    const link = teile.find((t) => t.kind === "link") as { kind: "link"; text: string; href: string } | undefined;
    assert.ok(link, "Link erkannt");
    assert.equal(link!.href, "https://portal.example");
    assert.equal(link!.text, "Jetzt anmelden");
    assert.ok(!JSON.stringify(teile).includes("knopf"), "der Titel taucht nicht als Text auf");
  });
});

describe("Knöpfe prüfen (ADM-102 f)", () => {
  it("brauchbar ist https:// mit etwas dahinter, ein Pfad mit / oder ein Platzhalter", () => {
    assert.deepEqual(knopfProbleme('[A](https://a.example "knopf") [B](/login "knopf") [C]({{portal_url}}/login "knopf")'), []);
  });

  it("die nackte Adresse der Werkzeugleiste und alles andere wird gemeldet — mit der Beschriftung", () => {
    assert.deepEqual(knopfProbleme('[Jetzt](https:// "knopf")'), [{ beschriftung: "Jetzt", adresse: "https://" }]);
    assert.deepEqual(knopfProbleme('[X](http://a.example "knopf")').map((p) => p.adresse), ["http://a.example"], "nur https");
    assert.deepEqual(knopfProbleme('[X](www.a.example "knopf")').length, 1);
    assert.deepEqual(knopfProbleme("[Normaler Link](https:// ) und Text"), [], "ohne Titel ist es kein Knopf");
  });

  it("der Knopf der Leiste setzt genau die Schreibweise, die der Renderer erkennt", () => {
    const r = wendeAn(WERKZEUGE.button, "", 0, 0, "Text");
    assert.equal(r.text, '[Text](https:// "knopf")');
    assert.deepEqual(knopfProbleme(r.text).length, 1, "frisch eingefügt fehlt die Adresse noch");
    const fertig = r.text.replace("https://", "https://portal.example/login");
    assert.deepEqual(knopfProbleme(fertig), []);
    assert.match(markdownToHtml(fertig), /display:inline-block/);
  });
});

describe("Mail-Editor (ADM-102 f)", () => {
  const v = lies("app/(admin)/admin/mail/vorlagen/VorlagenView.tsx");

  it("der Editor benutzt die gemeinsame Leiste mit den Werkzeugen, die der Mail-Renderer kann", () => {
    assert.match(v, /<FormatLeiste gruppen=\{MAIL_LEISTE\} steuert="body" onAnwenden=\{formatieren\}/);
    const keys = flach(MAIL_LEISTE);
    for (const k of ["undo", "redo", "bold", "italic", "link", "button", "ul", "h2"]) assert.ok(keys.includes(k as never), k);
    for (const k of ["code", "table", "rule", "h3", "quote", "ol"]) assert.ok(!keys.includes(k as never), `${k} kann der Mail-Renderer nicht`);
  });

  it("Formatierungen und Platzhalter werden als Eingabe geschrieben (Strg+Z bleibt heil)", () => {
    assert.match(v, /ersetzeAlsEingabe\(feld, neu\.text\)/);
    assert.match(v, /verlaufBefehl\(feld, w\.befehl\)/);
    assert.equal((v.match(/ersetzeAlsEingabe\(/g) ?? []).length, 2, "Einsetzen eines Platzhalters und Formatieren");
  });

  it("ein Knopf ohne https-Adresse sperrt das Speichern und die Vorschau und wird gemeldet", () => {
    assert.match(v, /knopfProbleme\(text\[s\]\.body_md\)/);
    assert.match(v, /disabled=\{pending \|\| !irgendwasGeaendert \|\| knopfFehler\.length > 0\}/);
    assert.match(v, /disabled=\{pending \|\| knopfFehlerHier\}/);
    assert.match(v, /role="alert"/);
  });

  it("die neuen Texte gibt es in DE und EN", () => {
    for (const l of ["de", "en"]) {
      const d = JSON.parse(lies(`lib/i18n/${l}.json`)) as { adminMailTemplates: Record<string, string> };
      for (const k of ["buttonNeedsUrl", "sampleText", "toolbar", "tool_undo", "tool_redo", "tool_h2", "tool_bold", "tool_italic", "tool_ul", "tool_link", "tool_button"]) {
        assert.ok(d.adminMailTemplates[k], `${l}.adminMailTemplates.${k}`);
      }
    }
  });
});
