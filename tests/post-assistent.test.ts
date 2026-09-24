import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANLAESSE,
  KANAELE,
  anfrageBauen,
  antwortOhneBlock,
  eingabeOk,
  istAnlass,
  istKanal,
  postLesen,
  verlaufKuerzen,
  MAX_EINGABE_ZEICHEN,
  MAX_ZUEGE,
  type Nachricht,
} from "@/lib/speaker/post-assistent";

test("postLesen nimmt den letzten Block, nicht den ersten", () => {
  // Im Gespräch schärft der Assistent nach — was gilt, ist das zuletzt Gesagte.
  const text = [
    "Erster Versuch:",
    "```post",
    "Alt und holprig.",
    "```",
    "Besser so:",
    "```post",
    "Neu und rund.",
    "```",
  ].join("\n");
  assert.equal(postLesen(text), "Neu und rund.");
});

test("postLesen gibt null zurück, wenn kein Block da ist", () => {
  assert.equal(postLesen("Magst du mir sagen, worum es geht?"), null);
});

test("postLesen behandelt einen leeren Block wie keinen", () => {
  // Sonst stünde ein leerer Kasten mit einem Kopierknopf da.
  assert.equal(postLesen("```post\n   \n```"), null);
});

test("postLesen behält Absätze im Beitrag", () => {
  const text = "```post\nErste Zeile.\n\nZweiter Absatz.\n```";
  assert.equal(postLesen(text), "Erste Zeile.\n\nZweiter Absatz.");
});

test("antwortOhneBlock entfernt den Block und lässt keine Lücke", () => {
  const text = "Hier ist dein Entwurf.\n\n```post\nDer Beitrag.\n```\n\nPasst das?";
  const sichtbar = antwortOhneBlock(text);
  assert.ok(!sichtbar.includes("Der Beitrag."));
  assert.ok(!/\n{3,}/.test(sichtbar), "keine Leerzeilenwüste, wo der Block stand");
  assert.ok(sichtbar.startsWith("Hier ist dein Entwurf."));
  assert.ok(sichtbar.endsWith("Passt das?"));
});

test("eingabeOk weist Leeres und Überlanges ab", () => {
  assert.equal(eingabeOk(""), false);
  assert.equal(eingabeOk("   "), false);
  assert.equal(eingabeOk(undefined), false);
  assert.equal(eingabeOk("a".repeat(MAX_EINGABE_ZEICHEN + 1)), false);
  assert.equal(eingabeOk("Es geht um regionale Lieferanten."), true);
});

test("istAnlass und istKanal lassen nur Bekanntes durch", () => {
  for (const a of ANLAESSE) assert.equal(istAnlass(a), true);
  for (const k of KANAELE) assert.equal(istKanal(k), true);
  assert.equal(istAnlass("tiktok"), false);
  assert.equal(istKanal("announce"), false);
  assert.equal(istAnlass(null), false);
});

test("verlaufKuerzen behält die letzten Züge und beginnt mit dem Menschen", () => {
  // Dieser Test verlangte zuerst genau MAX_ZUEGE Züge — und schrieb damit den
  // Fehler fest: 15 Züge auf 12 gekürzt beginnen mit dem Assistenten, und die
  // API weist einen solchen Verlauf ab. Richtig ist: höchstens MAX_ZUEGE, der
  // erste vom Menschen, der letzte bleibt.
  const lang: Nachricht[] = Array.from({ length: MAX_ZUEGE + 3 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: String(i),
  }));
  const kurz = verlaufKuerzen(lang);
  assert.ok(kurz.length <= MAX_ZUEGE);
  assert.equal(kurz[0].role, "user");
  assert.equal(kurz[kurz.length - 1].content, String(lang.length - 1));
});

test("anfrageBauen schickt keinen Personenbezug mit", () => {
  // Die Grenze aus der Entscheidung vom 17.09.: Titel und Veranstaltung ja,
  // Name, Organisation und Kontakt nein.
  const { system, messages } = anfrageBauen(
    [{ role: "user", content: "Es geht um regionale Lieferanten." }],
    "de",
    "announce",
    "linkedin",
    "Regional einkaufen, wirklich?",
    "Future Leadership Summit 27",
  );
  assert.ok(system.includes("Regional einkaufen, wirklich?"));
  assert.ok(system.includes("Future Leadership Summit 27"));
  assert.ok(system.includes("LinkedIn"));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].content, "Es geht um regionale Lieferanten.");
});

test("ohne Titel fordert der Systemtext zum Nachfragen auf, statt einen zu erfinden", () => {
  const { system } = anfrageBauen([], "de", "recap", "instagram", null, null);
  assert.ok(system.includes("frage danach"), "der Assistent soll fragen, nicht dichten");
  assert.ok(!system.includes("Der Vortrag heißt"));
});

test("der Systemtext erklärt Eingaben zu Inhalt, nicht zu Anweisungen", () => {
  for (const sprache of ["de", "en"] as const) {
    const { system } = anfrageBauen([], sprache, "live", "linkedin", "Titel", "Event");
    const satz = sprache === "de" ? "keine Anweisung" : "not an instruction";
    assert.ok(system.includes(satz), `${sprache}: die Grenze fehlt`);
  }
});

test("jeder Anlass und jeder Kanal ergibt einen eigenen Systemtext", () => {
  const texte = new Set<string>();
  for (const a of ANLAESSE) {
    for (const k of KANAELE) {
      texte.add(anfrageBauen([], "de", a, k, "Titel", "Event").system);
    }
  }
  assert.equal(texte.size, ANLAESSE.length * KANAELE.length);
});
