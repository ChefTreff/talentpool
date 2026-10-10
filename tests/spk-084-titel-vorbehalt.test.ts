import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * SPK-084 (Feedbackrunde Konrad und Paulina 05.10.2026): bei der Einreichung **und** beim Änderungsantrag muss sichtbar stehen, dass ChefTreff sich vorbehält,
 * Titel und Beschreibung anzupassen — DE und EN. Konrad: „dass da wirklich steht, dass wir uns vorbehalten, die Titel noch mal zu ändern“. Geprüft war: der
 * Text stand nirgends. Er steht jetzt als ein Absatz unter dem Formular „Inhalte einreichen“ / „Änderung einreichen“ (`/speaker/session`), unmittelbar vor dem
 * Knopf, an keine Bedingung geknüpft. Keine Datenbankänderung.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const SESSION = "app/(speaker)/speaker/session/SessionView.tsx";
const ohneKommentare = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** Das Formular: von der Überschrift „Einreichen“ bis zum Titel-Assistenten. */
function formular(): string {
  const q = quelle(SESSION);
  const von = q.indexOf("{/* Einreichen */}");
  const bis = q.indexOf("<TitelAssistent", von);
  assert.ok(von > 0 && bis > von, "Formularblock nicht gefunden");
  return q.slice(von, bis);
}

type Woerterbuch = { speaker: Record<string, string> };

describe("SPK-084: der Vorbehalt am Formular „Inhalte einreichen“", () => {
  it("ein Absatz mit dem Text aus `speaker.submitReservation` steht unmittelbar vor dem Knopf „Einreichen“, im selben Formular, und ist sichtbar", () => {
    const f = ohneKommentare(formular());
    const m = f.match(
      /<div className="[^"]*">\s*<p className="([^"]*)">\{t\.submitReservation\}<\/p>\s*<div>\s*<Button onClick=\{onSubmit\} loading=\{saving\}/,
    );
    assert.ok(m, "der Absatz steht nicht unmittelbar vor dem Knopf");
    assert.match(m[1], /\bct-help\b/);
    assert.doesNotMatch(m[1], /\b(hidden|sr-only|invisible|opacity-0|h-0|w-0|text-transparent)\b/, "der Absatz ist per Klasse versteckt");
    assert.equal((f.match(/t\.submitReservation/g) ?? []).length, 1);
  });

  it("an keine Bedingung geknüpft: die erste Einreichung und die Änderung (Titel steht schon im Programm) sehen ihn — es ist dasselbe Formular", () => {
    const f = ohneKommentare(formular());
    // dasselbe Formular, nur die Überschrift wechselt …
    assert.match(f, /\{finalTitle \? t\.submitChangeTitle : t\.submitTitle\}/);
    // … und der Absatz hängt direkt am Ende des Feldes „Hinweis“, nicht an `&&` oder `?:`
    assert.match(f, /<\/Field>\s*<div className="[^"]*">\s*<p className="[^"]*">\{t\.submitReservation\}/);
    // keine zweite Fassung des Formulars
    assert.equal((f.match(/<Button onClick=\{onSubmit\}/g) ?? []).length, 1);
  });

  it("wer Inhalte einreichen kann, sieht ihn: jede Datei, die `submitSessionContent` aufruft, trägt `submitReservation`", () => {
    const dateien = (readdirSync(new URL("../app", import.meta.url), { recursive: true }) as string[])
      .filter((p) => /\.(ts|tsx)$/.test(p))
      .map((p) => `app/${p}`);
    const aufrufer = dateien.filter((p) => /\bsubmitSessionContent\(/.test(quelle(p)) && !/export async function submitSessionContent/.test(quelle(p)));
    assert.deepEqual(aufrufer, [SESSION]);
    for (const p of aufrufer) assert.ok(quelle(p).includes("t.submitReservation"), p);
  });

  it("Texte DE und EN: ChefTreff, Titel und Beschreibung, der Vorbehalt", () => {
    const de = (JSON.parse(quelle("lib/i18n/de.json")) as Woerterbuch).speaker.submitReservation;
    const en = (JSON.parse(quelle("lib/i18n/en.json")) as Woerterbuch).speaker.submitReservation;
    assert.equal(de, "Titel und Beschreibung sind dein Vorschlag. ChefTreff behält sich vor, sie für das Programm anzupassen.");
    assert.equal(en, "Title and description are your proposal. ChefTreff reserves the right to adjust them for the programme.");
  });
});

describe("SPK-084: Doku", () => {
  it("Testleitfaden: die Zeile `/speaker/session` nennt den Vorbehalt über dem Knopf, bei Einreichung und Änderung", () => {
    const zeile = quelle("docs/team-testleitfaden.md")
      .split("\n")
      .find((l) => l.startsWith("| `/speaker/session` Session |"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /über dem Knopf „Einreichen“ steht der Vorbehalt\*\* \(SPK-084\)/);
    assert.match(zeile, /bei der ersten Einreichung wie bei „Änderung einreichen“/);
  });

  it("Backlog: SPK-084 trägt die PR-Nummer und sagt, was geprüft wurde (stand nirgends) und wo der Text jetzt steht", () => {
    const zeile = quelle("docs/feedback/speaker.md")
      .split("\n")
      .find((l) => l.startsWith("| SPK-084 |"));
    assert.ok(zeile && /\| P2 \| (geplant|gebaut|abgenommen) #\d+/.test(zeile), "SPK-084 trägt keine PR-Nummer");
    assert.match(zeile, /stand nirgends/);
    assert.match(zeile, /submitReservation/);
    assert.match(zeile, /keine Migration/);
  });
});
