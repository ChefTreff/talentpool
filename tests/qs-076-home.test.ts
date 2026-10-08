import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * QS-076 (Konrad, 08.10.2026): die Startseite jedes Portals heißt „Home“ statt „Übersicht“, und eine Karte auf Home
 * trägt **eine** Überschrift (der Name der Seite, kursiv), nicht Stichwort und Name übereinander. Im Partner-Portal galt
 * das seit PART-098; hier steht, dass es in allen Portalen zugleich gilt — und dass es nicht still in eines zurückkehrt.
 *
 * Es gibt keinen DOM-Testlauf im Repo: das Layout belegt die Sichtprüfung in der PR-Beschreibung, hier steht, was der
 * Quelltext festhält.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const ohneKommentare = (quelle: string) => quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
type Woerterbuch = Record<string, unknown>;
const woerterbuch = (sprache: "de" | "en") => JSON.parse(lies(`lib/i18n/${sprache}.json`)) as Woerterbuch;
const wert = (d: Woerterbuch, pfad: string): unknown =>
  pfad.split(".").reduce<unknown>((x, k) => (x as Woerterbuch | undefined)?.[k], d);

/** Alle Portale mit Seitenleiste: Layout, Einstiegspfad und der Schlüssel, den das Layout für den Einstiegspunkt nennt. */
const HOME_PUNKTE: { portal: string; layout: string; href: string }[] = [
  { portal: "Talent", layout: "app/(talent)/layout.tsx", href: "/start" },
  { portal: "Talent · Summit 2027", layout: "app/(talent)/layout.tsx", href: "/summit" },
  { portal: "Speaker", layout: "app/(speaker)/layout.tsx", href: "/speaker" },
  { portal: "Speaker-Leads (Stage Leads)", layout: "app/(speaker-leads)/layout.tsx", href: "/speaker-leads" },
  { portal: "Partner", layout: "app/(partner)/layout.tsx", href: "/partner" },
  { portal: "Hackathon", layout: "app/(hackathon)/layout.tsx", href: "/hackathon" },
];

describe("QS-076: die Startseite heißt in jedem Portal „Home“", () => {
  for (const sprache of ["de", "en"] as const) {
    const d = woerterbuch(sprache);

    for (const p of HOME_PUNKTE) {
      it(`${sprache}: ${p.portal} — der Menüpunkt ${p.href} trägt „Home“`, () => {
        const layout = lies(p.layout);
        const treffer = new RegExp(`href: "${p.href}", label: t\\.([A-Za-z0-9_.]+)`).exec(layout);
        assert.ok(treffer, `${p.layout}: kein Menüpunkt für ${p.href} gefunden`);
        assert.equal(wert(d, treffer[1]), "Home", `${p.layout}: t.${treffer[1]}`);
      });
    }

    it(`${sprache}: Admin — der erste Menüpunkt und der Titel des Bands ohne Vornamen heißen „Home“`, () => {
      const nav = lies("lib/admin-navigation.ts");
      const treffer = /section: "overview", href: "\/admin", label: "([A-Za-z]+)"/.exec(nav);
      assert.ok(treffer, "lib/admin-navigation.ts: kein Punkt für /admin");
      assert.equal(wert(d, `admin.nav.${treffer[1]}`), "Home");
      assert.equal(wert(d, "admin.overview.title"), "Home");
      assert.match(lies("app/(admin)/admin/page.tsx"), /: t\.admin\.overview\.title\}/);
    });
  }

  it("kein Menüpunkt in einem Portal-Layout heißt noch „Übersicht“ oder „Overview“", () => {
    const layouts = [...new Set([...HOME_PUNKTE.map((p) => p.layout), "app/(volunteers)/layout.tsx"])];
    for (const sprache of ["de", "en"] as const) {
      const d = woerterbuch(sprache);
      for (const layout of layouts) {
        for (const m of lies(layout).matchAll(/label: t\.([A-Za-z0-9_.]+)/g)) {
          const text = wert(d, m[1]);
          assert.ok(typeof text === "string", `${layout}: t.${m[1]} fehlt im Wörterbuch (${sprache})`);
          assert.ok(!/^(Übersicht|Overview)$/.test(text), `${layout}: t.${m[1]} = ${text} (${sprache})`);
        }
      }
    }
  });

  it("das Partner-Menü hat keinen Gruppenkopf mehr über dem ersten Punkt — „Home“ stünde sonst über „Home“", () => {
    const layout = ohneKommentare(lies("app/(partner)/layout.tsx"));
    assert.match(layout, /\{ label: "", items: pick\(NAV_GROUPS\.overview\) \},/);
    assert.doesNotMatch(layout, /groupOverview/);
    for (const sprache of ["de", "en"] as const) {
      assert.equal(wert(woerterbuch(sprache), "partner.groupOverview"), undefined, sprache);
    }
  });

  it("Volunteers bleibt, wie es ist: seine Startseite ist die Bewerbung samt Profil und heißt nicht „Übersicht“ (offen für Konrad)", () => {
    const layout = lies("app/(volunteers)/layout.tsx");
    assert.match(layout, /href: "\/volunteers", label: t\.volunteers\.navProfile/);
    assert.equal(wert(woerterbuch("de"), "volunteers.navProfile"), "Bewerbung & Profil");
  });
});

describe("QS-076: eine Karte trägt eine Überschrift", () => {
  /** Alle `<PhotoCard …>` unter app/ und components/ (ohne lokale Vorschauseiten): Tag samt seiner Attribute. */
  function karten(ordner: string, treffer: { datei: string; tag: string }[] = []) {
    for (const e of readdirSync(ordner, { withFileTypes: true })) {
      const pfad = `${ordner}/${e.name}`;
      if (e.isDirectory()) {
        if (!["node_modules", ".next"].includes(e.name) && !e.name.startsWith("vorschau-")) karten(pfad, treffer);
      } else if (e.name.endsWith(".tsx")) {
        const text = lies(pfad);
        for (const m of text.matchAll(/<PhotoCard\b/g)) {
          let tiefe = 0;
          let i = m.index + m[0].length;
          while (i < text.length && !(text[i] === ">" && tiefe === 0 && text[i - 1] !== "=")) {
            if (text[i] === "{") tiefe++;
            if (text[i] === "}") tiefe--;
            i++;
          }
          treffer.push({ datei: pfad, tag: text.slice(m.index, i + 1) });
        }
      }
    }
    return treffer;
  }
  const alle = karten("app").concat(karten("components"));

  it("der Baustein kennt kein `title` mehr: eine zweite Zeile lässt sich nicht anhängen", () => {
    const karte = ohneKommentare(lies("components/ui/PhotoCard.tsx"));
    assert.doesNotMatch(karte, /\btitle\b/);
    assert.match(karte, /<p className="ct-laica text-accent-strong sm:mt-4">\{word\}<\/p>/);
    assert.doesNotMatch(karte, /ct-h3/);
  });

  it("keine Karte im Repo bekommt ein `title`", () => {
    assert.ok(alle.length >= 13, `nur ${alle.length} Karten gefunden`);
    for (const k of alle) assert.doesNotMatch(k.tag, /\btitle=/, k.datei);
  });

  it("jedes Portal mit Einstiegskarten ist dabei — der Zähler hält fest, dass der Test nichts übersieht", () => {
    const je = (datei: string) => alle.filter((k) => k.datei === datei).length;
    assert.equal(je("app/(talent)/start/page.tsx"), 3, "zwei Einstiege und Next Up");
    assert.equal(je("app/(talent)/summit/page.tsx"), 2);
    assert.equal(je("app/(speaker)/speaker/page.tsx"), 3);
    assert.equal(je("app/(speaker-leads)/speaker-leads/UebersichtAnsicht.tsx"), 3);
    assert.equal(je("app/(partner)/partner/page.tsx"), 1, "eine Karte in der Schleife über drei Einstiege");
    assert.equal(je("app/(admin)/admin/page.tsx"), 1, "eine Karte in der Schleife über drei Einstiege");
  });

  it("die Überschrift ist der Name der Seite, zu der die Karte führt — nicht mehr das Stichwort darüber", () => {
    const worte = (datei: string) => alle.filter((k) => k.datei === datei).map((k) => /word=\{([^\n]*)\}\n/.exec(k.tag)?.[1]);
    assert.deepEqual(worte("app/(talent)/start/page.tsx"), [
      "t.talentSummit.groupLabel",
      "t.profile.title",
      "pick(n.title_de, n.title_en)",
    ]);
    assert.deepEqual(worte("app/(talent)/summit/page.tsx"), ["t.programme.title", "t.participation.title"]);
    assert.deepEqual(worte("app/(speaker)/speaker/page.tsx"), [
      "t.speaker.sessionTitle",
      "t.speaker.travelTitle",
      "t.speakerGraphic.title",
    ]);
    assert.deepEqual(worte("app/(speaker-leads)/speaker-leads/UebersichtAnsicht.tsx"), [
      "tl.title",
      "tl.confirmedTitle",
      "tl.boardTitle",
    ]);
    assert.deepEqual(worte("app/(partner)/partner/page.tsx"), ["e.name"]);
    assert.deepEqual(worte("app/(admin)/admin/page.tsx"), ["nav[e.nav]"]);
  });

  it("die Stichwörter bleiben an den Seitenköpfen: dort stehen sie weiter über dem Titel (nicht Teil von QS-076)", () => {
    for (const sprache of ["de", "en"] as const) {
      const d = woerterbuch(sprache);
      for (const k of ["speaker.wordStage", "speaker.wordJourney", "speaker.wordSpotlight", "leads.wordLineup", "leads.wordOnboarding", "leads.wordProgramme", "talentStart.cardProgrammeWord", "talentStart.cardMineWord"]) {
        assert.ok(typeof wert(d, k) === "string", `${sprache}: ${k}`);
      }
    }
    assert.match(lies("app/(speaker)/speaker/session/page.tsx"), /<PageHeader word=\{t\.speaker\.wordStage\}/);
  });

  it("tote Wörterbuchschlüssel sind weg: das Stichwort der Karten und das des Next-Up-Formulars", () => {
    for (const sprache of ["de", "en"] as const) {
      const d = woerterbuch(sprache);
      for (const k of [
        "talentHome.cardSummitWord",
        "talentHome.nextUpWord",
        "talentStart.cardProfileWord",
        "nextUpAdmin.fieldWordDe",
        "nextUpAdmin.fieldWordEn",
        "nextUpAdmin.fieldWordHint",
      ]) {
        assert.equal(wert(d, k), undefined, `${sprache}: ${k}`);
      }
    }
  });
});

describe("QS-076: Next Up zeigt nur den Titel, das Formular fragt kein Stichwort mehr", () => {
  it("Home liest das Stichwort der Hinweise nicht mehr", () => {
    const seite = ohneKommentare(lies("app/(talent)/start/page.tsx"));
    assert.doesNotMatch(seite, /word_de|word_en/);
  });

  it("das Formular hat keine Stichwort-Felder, schickt den vorhandenen Wert aber unverändert zurück (kein Datenverlust)", () => {
    const form = ohneKommentare(lies("app/(admin)/admin/next-up/NextUpAdmin.tsx"));
    assert.doesNotMatch(form, /fieldWord|n-word/);
    assert.doesNotMatch(form, /\{i\.word_de &&/);
    assert.match(form, /word_de: offen\.word_de, word_en: offen\.word_en,/);
  });
});

describe("QS-076: die Regel steht im Skill", () => {
  const skill = lies(".claude/skills/portal-design/SKILL.md");

  it("Regel 11: globale Seiten ändern sich in allen Portalen zugleich — mit der Liste der Portale", () => {
    const regel = /\n11\. \*\*Globale Seiten ändern sich in allen Portalen zugleich\*\*[^\n]*/.exec(skill)?.[0] ?? "";
    assert.ok(regel, "Regel 11 fehlt in SKILL.md");
    for (const wort of ["Home", "Login", "Shell", "Talent", "Speaker", "Speaker-Leads", "Partner", "Volunteers", "Hackathon", "Admin", "PhotoCard"]) {
      assert.ok(regel.includes(wort), `Regel 11 nennt ${wort} nicht`);
    }
  });

  it("der Prüfpunkt „Vor dem PR“ fragt nach Home, Login und Shell", () => {
    assert.match(skill, /- \[ \] Berührt die Änderung Home, Login oder Shell\? Dann stehen alle Portale im selben PR \(Regel 11\)/);
  });

  it("Muster und Briefing führen die Entscheidung mit", () => {
    assert.match(lies(".claude/skills/portal-design/referenzen/muster.md"), /QS-037, QS-076/);
    assert.match(lies("docs/design-briefing.md"), /## v0\.9 \(08\.10\.2026\) — Home und eine Überschrift \(QS-076\)/);
  });
});
