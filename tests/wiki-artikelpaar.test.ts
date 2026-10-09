import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { gruppiere, passtArtikel } from "@/lib/wiki/artikel";
import { MAIL_LEISTE, WERKZEUGE, WIKI_LEISTE, aenderungsbereich, flach, wendeAn } from "@/lib/markdown-werkzeuge";
import type { KbAdminArticle } from "@/components/wiki/types";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const zeile = (p: Partial<KbAdminArticle> & { slug: string; language: string }): KbAdminArticle => ({
  id: `${p.slug}-${p.language}`, title: p.slug.toUpperCase(), body_md: "", phase: "evergreen", roles: [], edition_id: null,
  updated_at: "2026-10-01T10:00:00Z", is_overlay: false, category: null, product_formats: [], audience: ["partner"],
  edition_slug: null, status: "published", valid_until: null, owner_name: null, published_at: null, ...p,
});

describe("Wiki: Artikel als Paar (ADM-103)", () => {
  it("eine Zeile je Artikel: deutsch und englisch mit gleichem Slug und gleicher Edition gehören zusammen", () => {
    const a = gruppiere([
      zeile({ slug: "stand", language: "de", title: "Stand", updated_at: "2026-10-01T10:00:00Z" }),
      zeile({ slug: "stand", language: "en", title: "Booth", updated_at: "2026-10-05T10:00:00Z", status: "draft" }),
      zeile({ slug: "stand", language: "de", title: "Stand 2027", edition_id: "e1", edition_slug: "fls27" }),
      zeile({ slug: "anreise", language: "de", title: "Anreise" }),
    ]);
    assert.equal(a.length, 3, "Evergreen und Edition-Overlay bleiben getrennte Artikel");
    const stand = a.find((x) => x.slug === "stand" && x.edition_id === null)!;
    assert.equal(stand.titel, "Stand", "die deutsche Fassung führt");
    assert.equal(stand.en?.status, "draft");
    assert.equal(stand.geaendert, "2026-10-05T10:00:00Z", "jüngste Änderung beider Fassungen");
    assert.deepEqual(a.map((x) => x.titel), ["Anreise", "Stand", "Stand 2027"], "nach Titel sortiert");
  });

  it("ein Artikel nur auf Englisch bekommt seine Felder von der englischen Fassung", () => {
    const [a] = gruppiere([zeile({ slug: "only-en", language: "en", title: "Only", audience: ["speaker"], category: "speaking" })]);
    assert.equal(a.de, null);
    assert.equal(a.titel, "Only");
    assert.deepEqual(a.audience, ["speaker"]);
    assert.equal(a.thema, "speaking");
  });

  it("weichen die gemeinsamen Felder zwischen den Sprachen ab, wird das gemeldet — Reihenfolge der Zielgruppen zählt nicht", () => {
    const gleich = gruppiere([
      zeile({ slug: "x", language: "de", audience: ["partner", "speaker"] }),
      zeile({ slug: "x", language: "en", audience: ["speaker", "partner"] }),
    ]);
    assert.equal(gleich[0].abweichend, false);
    const anders = gruppiere([
      zeile({ slug: "x", language: "de", audience: ["partner"] }),
      zeile({ slug: "x", language: "en", audience: ["partner", "talent"] }),
    ]);
    assert.equal(anders[0].abweichend, true);
    const phase = gruppiere([zeile({ slug: "x", language: "de" }), zeile({ slug: "x", language: "en", phase: "event" })]);
    assert.equal(phase[0].abweichend, true);
  });

  it("Suche und Filter: Titel, Slug und Text beider Sprachen; Thema, Zielgruppe, Status einer Fassung, „Englisch fehlt“", () => {
    const [stand, nurDe] = gruppiere([
      zeile({ slug: "stand", language: "de", title: "Standaufbau", body_md: "Rückwand bestellen", category: "stand" }),
      zeile({ slug: "stand", language: "en", title: "Booth setup", body_md: "order the backwall", status: "draft", category: "stand" }),
      zeile({ slug: "wlan", language: "de", title: "WLAN", audience: ["speaker"], category: "vorort" }),
    ]).sort((a, b) => a.slug.localeCompare(b.slug));
    const kein = { q: "", thema: "", zielgruppe: "", status: "" };
    assert.equal(passtArtikel(stand, { ...kein, q: "backwall" }), true, "englischer Text");
    assert.equal(passtArtikel(stand, { ...kein, q: "rückwand booth" }), true, "jedes Wort, beliebige Sprache");
    assert.equal(passtArtikel(stand, { ...kein, q: "stand" }), true, "Slug");
    assert.equal(passtArtikel(stand, { ...kein, q: "gibtsnicht" }), false);
    assert.equal(passtArtikel(stand, { ...kein, thema: "stand" }), true);
    assert.equal(passtArtikel(stand, { ...kein, thema: "vorort" }), false);
    assert.equal(passtArtikel(nurDe, { ...kein, zielgruppe: "speaker" }), true);
    assert.equal(passtArtikel(nurDe, { ...kein, zielgruppe: "partner" }), false);
    assert.equal(passtArtikel(stand, { ...kein, status: "draft" }), true, "eine Fassung im Entwurf genügt");
    assert.equal(passtArtikel(stand, { ...kein, status: "archived" }), false);
    assert.equal(passtArtikel(stand, { ...kein, status: "missing" }), false, "hat Englisch");
    assert.equal(passtArtikel(nurDe, { ...kein, status: "missing" }), true, "Englisch fehlt");
  });
});

describe("Wiki: Migration upsert_kb_article_pair (ADM-103)", () => {
  const sql = migrationText("v6_wiki_artikelpaar");

  it("ruft den bestehenden Schreibweg auf, statt ihn nachzubauen, und schreibt den Status nie mit", () => {
    assert.match(sql, /upsert_kb_article\(v_daten\)/);
    assert.match(sql, /v_daten - 'status'/);
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("die gemeinsamen Felder sind genau die, die das Recht oder die Sichtbarkeit bestimmen — Titel und Text gehören nicht dazu", () => {
    const feld = /v_geteilt text\[\] := array\[([^\]]*)\]/.exec(sql)?.[1] ?? "";
    for (const f of ["audience", "roles", "phase", "category", "product_formats", "valid_until", "sort_order"]) assert.ok(feld.includes(`'${f}'`), f);
    for (const f of ["title", "body_md", "status", "slug", "language"]) assert.ok(!feld.includes(`'${f}'`), `${f} ist nicht gemeinsam`);
  });
});

describe("Formatierungsleiste (ADM-103 g, ADM-102 f)", () => {
  const m = "Text";

  it("Fett und Kursiv klammern die Auswahl; ohne Auswahl bleibt das Muster markiert", () => {
    assert.deepEqual(wendeAn(WERKZEUGE.bold, "ein Wort hier", 4, 8, m), { text: "ein **Wort** hier", start: 6, end: 10 });
    assert.deepEqual(wendeAn(WERKZEUGE.italic, "ab", 1, 1, m), { text: "a*Text*b", start: 2, end: 6 });
  });

  it("Überschrift und Listen arbeiten auf ganzen Zeilen und lassen sich wieder abschalten", () => {
    const an = wendeAn(WERKZEUGE.h2, "Titel\nText", 2, 2, m);
    assert.equal(an.text, "## Titel\nText");
    assert.equal(wendeAn(WERKZEUGE.h2, an.text, 4, 4, m).text, "Titel\nText");
    assert.equal(wendeAn(WERKZEUGE.ul, "a\nb\nc", 0, 3, m).text, "- a\n- b\nc", "zwei Zeilen markiert");
  });

  it("der Link nimmt die Auswahl als Text und setzt den Cursor in die Adresse", () => {
    const r = wendeAn(WERKZEUGE.link, "siehe Seite jetzt", 6, 11, m);
    assert.equal(r.text, "siehe [Seite](https://) jetzt");
    assert.equal(r.start, "siehe [Seite](https://".length);
    assert.equal(r.end, r.start);
    assert.equal(wendeAn(WERKZEUGE.link, "", 0, 0, m).text, "[Text](https://)");
  });

  it("ein Block steht in eigener Zeile", () => {
    assert.equal(wendeAn(WERKZEUGE.rule, "Satz", 4, 4, m).text, "Satz\n---\n");
    assert.equal(wendeAn(WERKZEUGE.rule, "", 0, 0, m).text, "---\n");
    // Der Knopf ist ein gewöhnlicher CommonMark-Link mit dem Titel „knopf“ (Muster Design-Chat).
    assert.equal(wendeAn(WERKZEUGE.button, "", 0, 0, m).text, '[Text](https:// "knopf")');
    const knopf = wendeAn(WERKZEUGE.button, "Jetzt anmelden", 0, 14, m);
    assert.equal(knopf.text, '[Jetzt anmelden](https:// "knopf")');
    assert.equal(knopf.start, "[Jetzt anmelden](https://".length, "Cursor in der Adresse");
  });

  it("eine Änderung wird als Eingabe geschrieben: nur der geänderte Bereich wird ersetzt", () => {
    assert.deepEqual(aenderungsbereich("ein Wort hier", "ein **Wort** hier"), { von: 4, bisAlt: 8, ersatz: "**Wort**" });
    assert.deepEqual(aenderungsbereich("abc", "abc"), { von: 3, bisAlt: 3, ersatz: "" });
    assert.deepEqual(aenderungsbereich("a\nb", "- a\nb"), { von: 0, bisAlt: 0, ersatz: "- " });
    assert.deepEqual(aenderungsbereich("- a", "a"), { von: 0, bisAlt: 2, ersatz: "" });
    const e = lies("components/wiki/Editor.tsx");
    assert.match(e, /ersetzeAlsEingabe\(el, neu\.text\)/);
    assert.match(e, /verlaufBefehl\(el, w\.befehl\)/);
  });

  it("Positionen außerhalb des Texts werden begrenzt", () => {
    assert.equal(wendeAn(WERKZEUGE.bold, "ab", 5, 9, m).text, "ab**Text**");
  });

  it("die Wiki-Leiste enthält nur Werkzeuge, die es gibt, und die Leiste benutzt Symbole mit Namen für Maus und Vorlesen", () => {
    for (const k of flach(WIKI_LEISTE)) assert.ok(WERKZEUGE[k], k);
    for (const k of flach(MAIL_LEISTE)) assert.ok(WERKZEUGE[k], k);
    assert.ok(!flach(MAIL_LEISTE).some((k) => ["code", "table", "rule"].includes(k)), "die Mail-Leiste kennt nur, was der Mail-Renderer kann");
    assert.deepEqual(WIKI_LEISTE[0], ["undo", "redo"], "Verlauf ganz links");
    const leiste = lies("components/ui/FormatLeiste.tsx");
    assert.match(leiste, /const name = t\[`tool_\$\{key\}`\]/);
    assert.match(leiste, /title=\{name\}/);
    assert.match(leiste, /aria-label=\{name\}/);
    assert.match(leiste, /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/);
    assert.match(leiste, /size-8[^"]*pointer-coarse:size-11/, "Größe nach Kit-Regel");
    assert.match(leiste, /tabIndex=\{index === aktiv \? 0 : -1\}/, "Roving Tabindex");
    assert.match(leiste, /aria-controls=\{steuert\}/);
    assert.match(leiste, /className="flex items-center gap-1 border-l px-1 /, "Trennstrich: jede Gruppe ein Element mit dem Strich links");
    const editor = lies("components/wiki/Editor.tsx");
    assert.match(editor, /<FormatLeiste/);
    assert.ok(!/WERKZEUGE\.map\(\(w\)/.test(editor), "die ausgeschriebene Leiste ist weg");
  });
});

describe("Wiki-Admin: eine Zeile je Artikel (ADM-103)", () => {
  const admin = lies("app/(admin)/admin/wiki/WikiAdmin.tsx");
  const form = lies("app/(admin)/admin/wiki/ArtikelFormular.tsx");
  const actions = lies("components/wiki/actions.ts");

  it("die Übersicht zeigt keinen Slug, keine Edition und keinen Produktbezug; der Titel öffnet den Artikel", () => {
    assert.ok(!/<Th>\{t\.colSlug\}/.test(admin) && !/<Th>\{t\.colEdition\}/.test(admin) && !/<Th>\{t\.colProducts\}/.test(admin));
    assert.match(admin, /<button type="button"[^>]*onClick=\{\(\) => \{ setFehler\(null\); setOpen\(a\); \}\}>\s*\{a\.titel\}/);
    assert.match(admin, /gruppiere\(articles\)/);
    assert.match(admin, /useUrlFilter\(/);
  });

  it("gespeichert wird als Paar, die Auswahlfelder sind Mehrfachauswahl, der Status bleibt je Sprache", () => {
    assert.match(actions, /upsert_kb_article_pair/);
    assert.match(admin, /saveArticlePair\(input\)/);
    assert.match(form, /<MehrfachAuswahl\s+aufklappbar\s+id="audience"/);
    assert.match(form, /<MehrfachAuswahl\s+aufklappbar\s+id="products"/);
    assert.match(form, /onPublish\(fassung\.id/);
    assert.ok(!/<input type="checkbox"/.test(form), "keine losen Kontrollkästchen mehr");
  });

  it("eine neue Fassung entsteht nur, wenn etwas drinsteht; die deutsche ist beim neuen Artikel Pflicht", () => {
    assert.match(form, /s === "de" \|\| text\[s\]\.title\.trim\(\) !== "" \|\| text\[s\]\.body_md\.trim\(\) !== ""/);
    assert.match(form, /form\.slug\.trim\(\) !== "" && text\.de\.title\.trim\(\) !== ""/);
  });
});
