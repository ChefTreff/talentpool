import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { AREAS, DEFAULT_AFTER_LOGIN, areasFor, landingPathFor } from "@/lib/areas";

/**
 * QS-074 (Konrad 08.10.2026): Wer angemeldet ist und `/` öffnet, soll nicht auf der Seite „Ein Login für alles“ landen,
 * sondern direkt auf der Übersichtsseite seines Portals. Die Startseite ist nur noch die Seite vor dem Login, ihr Text:
 * „Welcome to the Future Leader Club“.
 *
 * Eine Sitzung gibt es im Testlauf nicht (kein DOM, kein Supabase): hier steht, was am Quelltext und an der Wahl des Ziels
 * feststehen muss. Die Weiterleitung mit Sitzung ist die Sichtprüfung von Konrad (siehe PR).
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const ohneKommentare = (quelle: string) => quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SEITE = ohneKommentare(lies("app/page.tsx"));

describe("Angemeldet: die Startseite leitet sofort ins eigene Portal", () => {
  it("`redirect` mit dem Einstieg des Logins, nicht mit einem festen Pfad", () => {
    assert.match(SEITE, /import \{ redirect \} from "next\/navigation";/);
    assert.match(SEITE, /if \(ctx\.user\) redirect\(landingPathFor\(await getMyAreas\(\)\)\);/);
  });

  it("die Weiterleitung kommt vor jeder Ausgabe: vor den Texten und vor dem Seitenaufbau", () => {
    const stelle = SEITE.indexOf("redirect(landingPathFor");
    assert.ok(stelle > 0, "Weiterleitung gefunden");
    assert.ok(stelle < SEITE.indexOf("await getI18n()"), "vor dem Laden der Texte");
    assert.ok(stelle < SEITE.indexOf("return ("), "vor dem Seitenaufbau");
  });

  it("dasselbe Ziel wie nach dem Login: der Callback und die Startseite fragen `landingPathFor`", () => {
    assert.match(lies("app/auth/callback/route.ts"), /return landingPathFor\(areasFor\(roles\)\);/);
    // `getMyAreas` ist `areasFor` über die Rollen der Sitzung — dieselbe Zuordnung wie im Callback.
    assert.match(lies("lib/auth.ts"), /export async function getMyAreas\(\)[\s\S]*?return areasFor\(roleNames\);/);
  });

  it("das Ziel ist für keine Rollenkombination die Startseite selbst (keine Schleife)", () => {
    const rollen: string[][] = [
      [], ["admin"], ["speaker"], ["partner_contact"], ["volunteer"], ["production_team"], ["checkin_operator"],
      ["speaker_manager"], ["hackathon_team"], ["admin", "speaker", "partner_contact"], ["speaker", "partner_contact"],
    ];
    for (const r of rollen) {
      const ziel = landingPathFor(areasFor(r));
      assert.notEqual(ziel, "/", `Rollen ${JSON.stringify(r)}`);
      assert.match(ziel, /^\/[a-z]/, `Rollen ${JSON.stringify(r)}`);
    }
  });

  it("kein Bereich und kein Standardziel liegt auf `/` — die Startseite ist nie ein Einstieg", () => {
    assert.ok(AREAS.every((a) => a.path !== "/" && a.path.startsWith("/")));
    assert.notEqual(DEFAULT_AFTER_LOGIN, "/");
  });

  it("wer ein Teilnehmerkonto ohne Fachrolle hat, landet im Teilnehmer-Portal (`/start`)", () => {
    assert.equal(landingPathFor(areasFor([])), "/start");
  });
});

describe("Die Seite vor dem Login", () => {
  it("nur noch ein Knopf: Anmelden; nichts mehr für Angemeldete (kein „Mein Profil“, kein „Angemeldet als“)", () => {
    assert.match(SEITE, /<ButtonLink href="\/login">\{t\.home\.loginCta\}<\/ButtonLink>/);
    assert.doesNotMatch(SEITE, /profileCta|loggedInAs|ctx\.user \?|\{ctx\.user &&/);
  });

  it("der Text ist die Begrüßung, ohne den alten Zusatz „einmal pflegen, formatübergreifend gültig“", () => {
    assert.doesNotMatch(SEITE, /ct-laica|t\.home\.lead/);
  });

  for (const sprache of ["de", "en"] as const) {
    it(`${sprache}: „Welcome to the Future Leader Club“, ein Highlight-Wort (Club)`, () => {
      const home = (JSON.parse(lies(`lib/i18n/${sprache}.json`)) as { home: Record<string, string> }).home;
      assert.equal(`${home.titleLead} ${home.titleHighlight}`, "Welcome to the Future Leader Club");
      assert.equal(home.titleHighlight, "Club");
    });

    it(`${sprache}: jeder Schlüssel, den die Seite liest, steht im Wörterbuch`, () => {
      const home = (JSON.parse(lies(`lib/i18n/${sprache}.json`)) as { home: Record<string, string> }).home;
      const benutzt = [...new Set([...SEITE.matchAll(/t\.home\.([a-zA-Z]+)/g)].map((m) => m[1]))];
      assert.ok(benutzt.length >= 4, "die Seite benutzt ihre Texte");
      for (const k of benutzt) assert.ok(typeof home[k] === "string" && home[k].length > 0, `${sprache}: home.${k}`);
    });
  }

  it("der alte Text „Ein Login für alles“ steht nicht mehr in der Gruppe `home`", () => {
    for (const sprache of ["de", "en"]) {
      const home = (JSON.parse(lies(`lib/i18n/${sprache}.json`)) as { home: Record<string, string> }).home;
      assert.doesNotMatch(Object.values(home).join(" "), /Ein Login für|One login for|einmal pflegen|maintain them once|alles|everything/i);
    }
  });
});
