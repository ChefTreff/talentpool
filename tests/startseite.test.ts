import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { AREAS, DEFAULT_AFTER_LOGIN, areasFor, landingPathFor } from "@/lib/areas";

/**
 * QS-074 (Konrad 08.10.2026): Wer angemeldet ist und die Wurzeladresse `/` öffnet, soll nicht auf der Seite „Ein Login für
 * alles“ landen, sondern direkt auf der Übersichtsseite seines Portals. Wer nicht angemeldet ist, kommt auf die Login-Seite —
 * die Startseite ist nur noch Login-Seite. Deren Text: „Welcome to the Future Leader Club“.
 *
 * Eine Sitzung gibt es im Testlauf nicht (kein DOM, kein Supabase): hier steht, was am Quelltext und an der Wahl des Ziels
 * feststehen muss. Die Weiterleitung mit Sitzung ist die Sichtprüfung von Konrad (siehe PR).
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const ohneKommentare = (quelle: string) => quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SEITE = ohneKommentare(lies("app/page.tsx"));
const woerterbuch = (sprache: string) => JSON.parse(lies(`lib/i18n/${sprache}.json`)) as Record<string, Record<string, string>>;

describe("Die Wurzeladresse leitet weiter, sie zeigt nichts", () => {
  it("angemeldet: ins eigene Portal, mit dem Einstieg des Logins; sonst auf die Login-Seite", () => {
    assert.match(SEITE, /import \{ redirect \} from "next\/navigation";/);
    assert.match(SEITE, /redirect\(ctx\.user \? landingPathFor\(await getMyAreas\(\)\) : "\/login"\);/);
  });

  it("die Seite baut nichts mehr auf: kein JSX, keine Texte, kein Kopf, kein Fuß", () => {
    assert.doesNotMatch(SEITE, /return \(|<[A-Z][A-Za-z]*|getI18n|AppHeader|PortalFooter|ButtonLink/);
  });

  it("dasselbe Ziel wie nach dem Login: der Callback und die Wurzeladresse fragen `landingPathFor`", () => {
    assert.match(lies("app/auth/callback/route.ts"), /return landingPathFor\(areasFor\(roles\)\);/);
    // `getMyAreas` ist `areasFor` über die Rollen der Sitzung — dieselbe Zuordnung wie im Callback.
    assert.match(lies("lib/auth.ts"), /export async function getMyAreas\(\)[\s\S]*?return areasFor\(roleNames\);/);
  });

  it("das Ziel ist für keine Rollenkombination die Wurzeladresse selbst (keine Schleife)", () => {
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

  it("kein Bereich und kein Standardziel liegt auf `/` — die Wurzeladresse ist nie ein Einstieg", () => {
    assert.ok(AREAS.every((a) => a.path !== "/" && a.path.startsWith("/")));
    assert.notEqual(DEFAULT_AFTER_LOGIN, "/");
  });

  it("wer ein Teilnehmerkonto ohne Fachrolle hat, landet im Teilnehmer-Portal (`/start`)", () => {
    assert.equal(landingPathFor(areasFor([])), "/start");
  });

  it("die Weiterleitung nach dem Abmelden (`/`) führt damit zur Login-Seite", () => {
    assert.match(lies("lib/auth-actions.ts"), /redirect\("\/"\);/);
  });
});

describe("Die Login-Seite trägt den Text", () => {
  for (const sprache of ["de", "en"] as const) {
    it(`${sprache}: „Welcome to the Future Leader Club“, ein Highlight-Wort (Club)`, () => {
      const login = woerterbuch(sprache).login;
      assert.equal(`${login.titleLead} ${login.titleHighlight}`, "Welcome to the Future Leader Club");
      assert.equal(login.titleHighlight, "Club");
    });

    it(`${sprache}: die alte Startseite ist aus dem Wörterbuch (Gruppe \`home\` gibt es nicht mehr)`, () => {
      assert.equal("home" in woerterbuch(sprache), false);
    });
  }

  it("die Seite reicht Eyebrow, Titel, Lead und Formulartexte aus `login` weiter", () => {
    const seite = lies("app/login/page.tsx");
    assert.match(seite, /titleLead: t\.login\.titleLead,/);
    assert.match(seite, /titleHighlight: t\.login\.titleHighlight,/);
  });

  it("nichts im Code liest die frühere Gruppe `home` noch", () => {
    const verbleib: string[] = [];
    const suche = (ordner: string) => {
      for (const e of readdirSync(ordner, { withFileTypes: true })) {
        const pfad = `${ordner}/${e.name}`;
        if (e.isDirectory()) {
          if (!["node_modules", ".next"].includes(e.name)) suche(pfad);
        } else if (/\.(ts|tsx)$/.test(e.name) && !pfad.startsWith("tests/") && /\bt\.home\./.test(lies(pfad))) verbleib.push(pfad);
      }
    };
    suche("app");
    suche("components");
    suche("lib");
    assert.deepEqual(verbleib, []);
  });
});
