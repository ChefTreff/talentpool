import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DECISIONS } from "@/app/(admin)/admin/bewerbungen/types";
import { APPLICATION_DECISIONS, istPartnerEntscheidung } from "@/app/(partner)/partner/types";
import {
  antwortZeilen,
  BEWERBUNG_PROFILFELDER,
  linkedinUrl,
  PROFIL_VOKABULARE,
  profilFelder,
  profilKurz,
} from "@/components/partner/bewerbung";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const dict = (sprache: "de" | "en") => JSON.parse(src(`lib/i18n/${sprache}.json`)) as Record<string, Record<string, string>>;

/**
 * Bewerbungslisten aller Formate (Konrad & Leopold 05.10.): PART-123 — „Engere Wahl“ raus, Zusage, Warteliste und
 * Absage in allen Formaten gleich; PART-122 — die Person ist anklickbar und zeigt ihr Profil, nur mit Einwilligung.
 *
 * Die Regeln, was ein Profilfeld, eine Antwort und eine LinkedIn-Adresse ist, stehen in `bewerbung.ts` und laufen
 * hier wirklich. Die Karte und das Schubfach sind React; was sich ohne Browser nur am Quelltext festhalten lässt
 * (nicht anklickbar ohne Einwilligung, keine Entscheidungsknöpfe im Schubfach), ist als solches gekennzeichnet — die
 * Darstellung selbst belegt die Vorschau im Browser.
 */
describe("PART-123: Entscheidungen im Partner-Bereich", () => {
  it("Zusage, Warteliste, Absage — keine Engere Wahl", () => {
    assert.deepEqual([...APPLICATION_DECISIONS], ["accepted", "waitlisted", "declined"]);
  });

  it("die Aktion nimmt genau diese drei an", () => {
    for (const status of APPLICATION_DECISIONS) assert.equal(istPartnerEntscheidung(status), true, status);
    for (const status of ["shortlisted", "applied", "confirmed", "promoted", "ACCEPTED", " accepted", ""]) {
      assert.equal(istPartnerEntscheidung(status), false, JSON.stringify(status));
    }
  });

  it("Quelltext: decideApplication prüft vor dem RPC und antwortet mit invalid_decision", () => {
    const aktion = src("app/(partner)/partner/actions.ts");
    const rumpf = aktion.slice(aktion.indexOf("export async function decideApplication("), aktion.indexOf("// === Messeshop"));
    const pruefung = rumpf.indexOf("if (!istPartnerEntscheidung(status))");
    assert.ok(pruefung > 0, "Prüfung fehlt");
    assert.ok(pruefung < rumpf.indexOf('rpc("decide_application"'), "die Prüfung muss vor dem RPC stehen");
    assert.match(rumpf, /return \{ ok: false, key: "invalid_decision"/);
    assert.ok("invalid_decision" in dict("de").rpc && "invalid_decision" in dict("en").rpc, "Meldung invalid_decision");
  });

  it("das Team behält im Admin alle vier Stände der Datenbank, auch die Engere Wahl", () => {
    assert.deepEqual([...DECISIONS], ["shortlisted", "accepted", "waitlisted", "declined"]);
    assert.match(src("supabase/snapshot/functions/decide_application.sql"), /p_status not in \('shortlisted','accepted','waitlisted','declined'\)/);
  });

  it("jede Entscheidung der Liste hat einen Text in DE und EN, die Engere Wahl keinen mehr", () => {
    for (const sprache of ["de", "en"] as const) {
      const t = dict(sprache).partnerApplicants;
      for (const status of APPLICATION_DECISIONS) assert.ok(t[`decide_${status}`], `${sprache}: decide_${status}`);
      assert.ok(!("decide_shortlisted" in t), `${sprache}: decide_shortlisted ist übrig`);
    }
  });

  it("die Liste bietet genau die Entscheidungen der Konstante an, nichts Eigenes daneben", () => {
    const liste = src("components/partner/ApplicantList.tsx");
    assert.match(liste, /APPLICATION_DECISIONS\.map\(\(status\) =>/);
    assert.doesNotMatch(liste, /["']shortlisted["']/);
  });
});

describe("PART-122: Profilfelder", () => {
  const profil = {
    occupation_status: "master",
    career_level: "junior",
    employer_name: "Muster AG",
    university: "TU München",
    study_field: "business",
    city: "München",
    linkedin_url: "https://www.linkedin.com/in/muster",
  };

  it("in fester Reihenfolge, die LinkedIn-Adresse gehört nicht dazu", () => {
    assert.deepEqual(
      profilFelder(profil).map(([key]) => key),
      ["occupation_status", "career_level", "employer_name", "university", "study_field", "city"],
    );
    assert.deepEqual([...BEWERBUNG_PROFILFELDER], profilFelder(profil).map(([key]) => key));
    // Egal, in welcher Reihenfolge das Profil geliefert wird.
    assert.deepEqual(profilFelder({ city: "Hamburg", employer_name: "Nord GmbH" }), [
      ["employer_name", "Nord GmbH"],
      ["city", "Hamburg"],
    ]);
  });

  it("was leer ist, fehlt: null, leere Zeichenkette, nur Leerzeichen, Zahlen, Listen, fehlendes Profil", () => {
    assert.deepEqual(
      profilFelder({ occupation_status: null, career_level: "", employer_name: "   ", university: 5, study_field: ["a"], city: undefined }),
      [],
    );
    assert.deepEqual(profilFelder(null), []);
    assert.deepEqual(profilFelder(undefined), []);
    assert.deepEqual(profilFelder({}), []);
  });

  it("Vokabelfelder zeigen ihre Beschriftung, unbekannte Schlüssel den Schlüssel selbst", () => {
    const werte = {
      occupation_status: { master: "Master-Student" },
      career_level: { junior: "Junior" },
      study_field: { business: "Business, Management & Entrepreneurship" },
    };
    assert.deepEqual(Object.fromEntries(profilFelder(profil, werte)), {
      occupation_status: "Master-Student",
      career_level: "Junior",
      employer_name: "Muster AG",
      university: "TU München",
      study_field: "Business, Management & Entrepreneurship",
      city: "München",
    });
    // Ein Schlüssel, den das Vokabular nicht (mehr) kennt, bleibt sichtbar statt zu verschwinden.
    assert.deepEqual(profilFelder({ occupation_status: "altwert" }, werte), [["occupation_status", "altwert"]]);
  });

  it("Freitext wird nie übersetzt: ein Arbeitgeber namens „master“ bleibt „master“", () => {
    const werte = { occupation_status: { master: "Master-Student" } };
    assert.deepEqual(profilFelder({ employer_name: "master", city: "master" }, werte), [
      ["employer_name", "master"],
      ["city", "master"],
    ]);
  });

  it("Beschriftungen kommen nur für Felder mit Vokabular, und die Seiten laden genau diese", () => {
    for (const v of PROFIL_VOKABULARE) assert.ok((BEWERBUNG_PROFILFELDER as readonly string[]).includes(v), v);
    assert.deepEqual([...PROFIL_VOKABULARE], ["occupation_status", "career_level", "study_field"]);
    for (const datei of ["app/(partner)/partner/FormatBewerbungen.tsx", "app/(partner)/partner/company-tour/TourBewerbungen.tsx"]) {
      const quelle = src(datei);
      assert.match(quelle, /PROFIL_VOKABULARE\.map\(\(v\) => \[v, vgroup\(vocab, v\)\]\)/, datei);
      assert.match(quelle, /profilWerte=\{profilWerte\}/, datei);
    }
  });

  it("die Wörterbücher haben für jedes Profilfeld eine Beschriftung, DE und EN", () => {
    for (const sprache of ["de", "en"] as const) {
      const t = dict(sprache).partnerApplicants;
      for (const key of BEWERBUNG_PROFILFELDER) assert.ok(t[`profile_${key}`], `${sprache}: profile_${key}`);
    }
  });
});

describe("PART-122: Zeile zum Überfliegen", () => {
  const werte = { occupation_status: { master: "Master-Student", berufstaetig: "Berufstätig" } };

  it("Status · Arbeitgeber · Ort", () => {
    assert.equal(
      profilKurz({ occupation_status: "berufstaetig", employer_name: "Muster AG", city: "Köln" }, werte),
      "Berufstätig · Muster AG · Köln",
    );
  });

  it("ohne Arbeitgeber die Hochschule; stehen beide da, gewinnt der Arbeitgeber", () => {
    assert.equal(profilKurz({ occupation_status: "master", university: "LMU", city: "München" }, werte), "Master-Student · LMU · München");
    assert.equal(profilKurz({ employer_name: "Muster AG", university: "LMU" }), "Muster AG");
  });

  it("was fehlt, fällt samt Trennzeichen weg; ganz leer ist die leere Zeichenkette", () => {
    assert.equal(profilKurz({ city: "Bonn" }), "Bonn");
    assert.equal(profilKurz({ occupation_status: "master", city: "Bonn" }, werte), "Master-Student · Bonn");
    assert.equal(profilKurz({ linkedin_url: "https://example.org", study_field: "business" }), "");
    assert.equal(profilKurz(null), "");
    assert.equal(profilKurz({}), "");
  });
});

describe("PART-122: LinkedIn-Adresse", () => {
  it("https und http werden verlinkt, Leerraum drumherum stört nicht", () => {
    assert.equal(linkedinUrl({ linkedin_url: "https://www.linkedin.com/in/muster" }), "https://www.linkedin.com/in/muster");
    assert.equal(linkedinUrl({ linkedin_url: "  https://www.linkedin.com/in/muster  " }), "https://www.linkedin.com/in/muster");
    assert.equal(linkedinUrl({ linkedin_url: "http://linkedin.com/in/x" }), "http://linkedin.com/in/x");
    // Aus einer Webseite kopiert hängt oft ein geschütztes Leerzeichen dran; der URL-Parser allein schnitte es nicht ab.
    assert.equal(linkedinUrl({ linkedin_url: " https://www.linkedin.com/in/muster " }), "https://www.linkedin.com/in/muster");
  });

  it("alles andere ergibt keinen Link: javascript, data, vbscript, ftp, file, mailto, keine Adresse, Nicht-Text", () => {
    for (const roh of [
      "javascript:alert(document.cookie)",
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      // Der Browser liest „java<Tab>script:“ als javascript: — geprüft wird deshalb das gelesene Protokoll, kein Textanfang.
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "\u0001javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "ftp://linkedin.com/in/x",
      "file:///etc/passwd",
      "mailto:a@b.de",
      "linkedin.com/in/ohne-protokoll",
      "//linkedin.com/in/x",
      "kein link",
      "",
      "   ",
    ]) {
      assert.equal(linkedinUrl({ linkedin_url: roh }), null, JSON.stringify(roh));
    }
    for (const roh of [null, undefined, 5, true, ["https://linkedin.com"], { href: "https://linkedin.com" }]) {
      assert.equal(linkedinUrl({ linkedin_url: roh as never }), null, JSON.stringify(roh));
    }
    assert.equal(linkedinUrl(null), null);
    assert.equal(linkedinUrl(undefined), null);
    assert.equal(linkedinUrl({}), null);
  });

  it("Quelltext: beide Darstellungen verlinken nur, was linkedinUrl zurückgibt", () => {
    for (const datei of ["components/partner/BewerbungProfil.tsx", "components/partner/BewerbungDetails.tsx"]) {
      const quelle = src(datei);
      assert.match(quelle, /linkedinUrl\(a\.profile\)/, datei);
      assert.doesNotMatch(quelle, /profile\??\.linkedin_url/, `${datei}: roher Zugriff auf linkedin_url`);
    }
  });
});

describe("PART-122: Antworten", () => {
  it("Frage und Antwort als Zeilen, eine Mehrfachauswahl mit Komma", () => {
    assert.deepEqual(antwortZeilen({ "Was möchtest du lernen?": "Logistik", Wahl: ["a", "b"] }), [
      ["Was möchtest du lernen?", "Logistik"],
      ["Wahl", "a, b"],
    ]);
  });

  it("leere Werte werden zur leeren Zeichenkette, fehlende Antworten ergeben keine Zeilen", () => {
    assert.deepEqual(antwortZeilen({ a: null, b: undefined, c: "" }), [["a", ""], ["b", ""], ["c", ""]]);
    assert.deepEqual(antwortZeilen({ zahl: 3, wahr: true }), [["zahl", "3"], ["wahr", "true"]]);
    assert.deepEqual(antwortZeilen(null), []);
    assert.deepEqual(antwortZeilen(undefined), []);
    assert.deepEqual(antwortZeilen({}), []);
  });
});

describe("PART-122: Schubfach in der Liste", () => {
  const liste = src("components/partner/ApplicantList.tsx");
  const profil = src("components/partner/BewerbungProfil.tsx");

  it("Quelltext: ohne Einwilligung ist der Name Text, nur mit Daten ein Knopf, der das Schubfach öffnet", () => {
    assert.match(
      liste,
      /\{hidden \? \(\s*<span className="ct-label text-ink">\{t\.hiddenName\}<\/span>\s*\) : \(\s*<button\b[^>]*onClick=\{\(\) => setOffen\(a\.id\)\}/,
    );
  });

  it("Quelltext: die Karte trägt kein Profil mehr, das Schubfach liest die Bewerbung aus der Liste", () => {
    assert.doesNotMatch(liste, /<BewerbungDetails/);
    assert.match(liste, /const imSchubfach = applications\.find\(\(a\) => a\.id === offen\) \?\? null;/);
    assert.match(liste, /<Drawer\s+open=\{imSchubfach !== null\}/);
    assert.match(liste, /<BewerbungProfil application=\{imSchubfach\} t=\{t\} werte=\{profilWerte\} \/>/);
  });

  it("Quelltext: im Schubfach stehen keine Entscheidungs- und Wunschknöpfe — es ist nur die Ansicht", () => {
    const schubfach = liste.slice(liste.indexOf("<Drawer"), liste.indexOf("</Drawer>"));
    assert.ok(schubfach.length > 100, "Schubfach nicht gefunden");
    assert.doesNotMatch(schubfach, /onDecide|onWunsch|APPLICATION_DECISIONS|<Button/);
  });

  it("alle Texte der beiden Bausteine gibt es in DE und EN", () => {
    const benutzt = new Set(
      [liste, profil].flatMap((q) => [...q.matchAll(/\bt\.([a-zA-Z]+)\b/g)].map((m) => m[1])),
    );
    for (const key of ["detailTitle", "detailProfile", "detailNoProfile", "detailAnswers", "detailNoAnswers", "detailNote", "detailClose", "hiddenName", "hiddenBody"]) {
      assert.ok(benutzt.has(key), `nicht benutzt: ${key}`);
    }
    for (const sprache of ["de", "en"] as const) {
      const t = dict(sprache).partnerApplicants;
      for (const key of benutzt) assert.equal(typeof t[key], "string", `${sprache}: partnerApplicants.${key}`);
    }
  });

  it("der Titel nimmt den Namen an der Stelle {name} auf", () => {
    for (const sprache of ["de", "en"] as const) {
      assert.match(dict(sprache).partnerApplicants.detailTitle, /\{name\}/, sprache);
    }
    assert.match(liste, /t\.detailTitle\.replace\("\{name\}", /);
  });
});
