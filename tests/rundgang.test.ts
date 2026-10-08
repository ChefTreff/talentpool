import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { EMBED_SANDBOX } from "@/components/ui/embed-sandbox";
import {
  MATTERPORT_ALLOW,
  MATTERPORT_HOST,
  MATTERPORT_SANDBOX,
  RUNDGANG_SCHLUESSEL,
  rundgangAus,
} from "@/components/partner/rundgang-adresse";
import de from "@/lib/i18n/de.json" with { type: "json" };
import en from "@/lib/i18n/en.json" with { type: "json" };

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const MODELL = "https://my.matterport.com/show/?m=Aj4uVT45GpQ";

describe("3D-Rundgang: nur die Matterport-Form wird eingebettet (PART-093)", () => {
  it("bettet die Adresse des Summits ein und lässt sie zum Öffnen, wie sie ist", () => {
    assert.deepEqual(rundgangAus(MODELL), { einbettung: MODELL, oeffnen: MODELL });
  });

  it("lässt weitere Parameter im Rahmen weg, der Link zum Öffnen behält sie", () => {
    const r = rundgangAus(`${MODELL}&play=1&qs=1&help=0`);
    assert.equal(r?.einbettung, MODELL);
    assert.equal(r?.oeffnen, `${MODELL}&play=1&qs=1&help=0`);
  });

  it("nimmt `/show` ohne Schrägstrich und umgebende Leerzeichen", () => {
    assert.equal(rundgangAus("  https://my.matterport.com/show?m=Aj4uVT45GpQ \n")?.einbettung, MODELL);
  });

  it("bettet fremde Herkünfte nie ein — auch keine, die nur so aussehen", () => {
    for (const fremd of [
      "https://evil.example/show/?m=Aj4uVT45GpQ",
      "https://my.matterport.com.evil.example/show/?m=Aj4uVT45GpQ",
      "https://evil.example/?x=my.matterport.com&m=Aj4uVT45GpQ",
      "https://my.matterport.com@evil.example/show/?m=Aj4uVT45GpQ",
      "https://matterport.com/show/?m=Aj4uVT45GpQ",
      "https://MY.MATTERPORT.COM.evil.example/show/?m=Aj4uVT45GpQ",
    ]) {
      const r = rundgangAus(fremd);
      assert.equal(r?.einbettung ?? null, null, fremd);
      assert.equal(r?.oeffnen, fremd, `${fremd}: bleibt als Link erhalten`);
    }
  });

  it("bettet nur den Pfad /show ein, ohne Zugangsdaten und ohne eigenen Anschluss", () => {
    for (const anders of [
      "https://my.matterport.com/discover/space/Aj4uVT45GpQ",
      "https://my.matterport.com/show/extra/?m=Aj4uVT45GpQ",
      "https://my.matterport.com:8443/show/?m=Aj4uVT45GpQ",
      "https://nutzer:geheim@my.matterport.com/show/?m=Aj4uVT45GpQ",
      "https://my.matterport.com/",
    ]) {
      assert.equal(rundgangAus(anders)?.einbettung ?? null, null, anders);
    }
  });

  it("die Kennung hat einen festen Zeichensatz: Buchstaben und Ziffern, 6 bis 32", () => {
    for (const schlecht of ["", "abc", "Aj4u-T45GpQ", "Aj4u_T45GpQ", "Aj4uVT45GpQ<script>", "Aj4u VT45GpQ", "a".repeat(33), "%3Cscript%3Ealert", "Aj4uVT45GpQ%00"]) {
      const url = `https://my.matterport.com/show/?m=${schlecht}`;
      assert.equal(rundgangAus(url)?.einbettung ?? null, null, url);
    }
    // Kodiertes Gültiges wird geprüft, **nachdem** es dekodiert ist, und die Adresse aus den geprüften Zeichen neu gebaut.
    assert.equal(rundgangAus("https://my.matterport.com/show/?m=%41j4uVT45GpQ")?.einbettung, MODELL);
    assert.equal(rundgangAus("https://my.matterport.com/show/")?.einbettung ?? null, null, "ohne m");
    assert.ok(rundgangAus(`https://my.matterport.com/show/?m=${"a".repeat(32)}`)?.einbettung);
  });

  it("alles ohne https ist keine Adresse: weder Einbettung noch Link", () => {
    for (const nein of [
      null,
      undefined,
      "",
      "   ",
      "http://my.matterport.com/show/?m=Aj4uVT45GpQ",
      "javascript:alert(1)",
      "//my.matterport.com/show/?m=Aj4uVT45GpQ",
      "data:text/html,<p>x</p>",
      "https://",
      "https://exa mple.org/",
    ]) {
      assert.equal(rundgangAus(nein), null, String(nein));
    }
  });

  it("jede andere https-Adresse bleibt ein Link", () => {
    assert.deepEqual(rundgangAus("https://example.org/rundgang"), { einbettung: null, oeffnen: "https://example.org/rundgang" });
  });
});

describe("3D-Rundgang: CSP, Sandbox und Einbettung", () => {
  it("die CSP erlaubt als Rahmen genau diese Herkunft zusätzlich zu Loom, und der Code prüft dieselbe", () => {
    const proxy = src("proxy.ts");
    assert.match(proxy, /"frame-src 'self' https:\/\/www\.loom\.com https:\/\/my\.matterport\.com"/);
    assert.equal((proxy.match(/matterport/g) ?? []).length >= 1, true);
    assert.equal(MATTERPORT_HOST, "my.matterport.com");
    assert.ok(proxy.includes(`https://${MATTERPORT_HOST}"`));
    // Nur Rahmen: kein Matterport in den Skript-, Verbindungs- oder Bildregeln.
    for (const regel of ["script-src", "connect-src", "img-src", "default-src"]) {
      const zeile = proxy.split("\n").find((z) => z.includes(`"${regel}`) || z.includes(`\`${regel}`));
      assert.ok(zeile, regel);
      assert.doesNotMatch(zeile, /matterport/, regel);
    }
  });

  it("die Sandbox lässt den Player starten, aber die Seite nicht wegnavigieren", () => {
    const flags = MATTERPORT_SANDBOX.split(" ");
    for (const noetig of ["allow-scripts", "allow-same-origin", "allow-popups", "allow-presentation"]) {
      assert.ok(flags.includes(noetig), noetig);
    }
    assert.deepEqual(flags.filter((f) => f.startsWith("allow-top-navigation")), []);
    assert.ok(!flags.includes("allow-modals"));
    assert.deepEqual(MATTERPORT_ALLOW.split(/;\s*/), ["fullscreen", "xr-spatial-tracking"]);
  });

  it("die EmbedGate-Vorgabe für Loom: Skripte, Präsentation und die eigene Herkunft des Rahmens — nicht mehr (K-76, PART-115)", () => {
    const flags = EMBED_SANDBOX.split(" ").sort();
    assert.deepEqual(flags, ["allow-presentation", "allow-same-origin", "allow-scripts"]);
    // Nichts, womit der Rahmen die Seite wegnavigieren, Fenster öffnen oder Formulare absenden könnte.
    for (const verboten of ["allow-top-navigation", "allow-top-navigation-by-user-activation", "allow-popups", "allow-popups-to-escape-sandbox", "allow-forms", "allow-modals", "allow-pointer-lock", "allow-downloads"]) {
      assert.ok(!flags.includes(verboten), verboten);
    }
    const gate = src("components/ui/EmbedGate.tsx");
    assert.match(gate, /sandbox = EMBED_SANDBOX,/);
    assert.match(gate, /import \{ EMBED_SANDBOX \} from "\.\/embed-sandbox";/);
    // Kein zweiter Wortlaut der Sandbox in der Komponente, der von der Konstante abweichen könnte.
    assert.doesNotMatch(gate, /sandbox = "allow-/);
    assert.match(gate, /referrer = "no-referrer"/);
    assert.match(gate, /ratio = "aspect-video"/);
    const eventApp = src("app/(partner)/partner/event-app/page.tsx");
    assert.doesNotMatch(eventApp, /sandbox=|allow=|referrer=/);
  });

  it("der Matterport-Rahmen hat mindestens, was die Vorgabe hat, und braucht dieselbe eigene Herkunft", () => {
    const matterport = MATTERPORT_SANDBOX.split(" ");
    for (const f of EMBED_SANDBOX.split(" ")) assert.ok(matterport.includes(f), f);
  });

  it("`allow-same-origin` ruht auf drei Bedingungen — fällt eine, muss die Vorgabe neu bedacht werden", () => {
    // 1. Die Seiten des Portals lassen sich nicht rahmen: ein Rahmen gleicher Herkunft könnte mit
    //    `allow-scripts` + `allow-same-origin` seine Sandbox selbst entfernen.
    assert.match(src("proxy.ts"), /"frame-ancestors 'none'"/);
    // 2. Die Adresse eines Videos beginnt laut Datenbank immer mit Loom — in der Tabelle und in der Funktion.
    const sql = migrationText("v5_portal_video");
    assert.match(sql, /check \(url like 'https:\/\/www\.loom\.com\/%' or url like 'https:\/\/loom\.com\/%'\)/);
    assert.match(sql, /if not \(v_url like 'https:\/\/www\.loom\.com\/%' or v_url like 'https:\/\/loom\.com\/%'\) then/);
    // 3. Der Rundgang bettet nur my.matterport.com ein (`rundgangAus`, oben getestet), die CSP erlaubt Rahmen nur von dort und von Loom.
    assert.match(src("proxy.ts"), /"frame-src 'self' https:\/\/www\.loom\.com https:\/\/my\.matterport\.com"/);
  });

  it("der Rundgang lädt erst auf Klick (EmbedGate) mit Ladezustand und Weg ohne Einbettung", () => {
    const r = src("components/partner/Rundgang.tsx");
    assert.match(r, /<EmbedGate/);
    assert.match(r, /sandbox=\{MATTERPORT_SANDBOX\}/);
    assert.match(r, /allow=\{MATTERPORT_ALLOW\}/);
    assert.match(r, /referrer="strict-origin-when-cross-origin"/);
    assert.match(r, /loadingLabel=\{t\.loading\}/);
    assert.match(r, /afterLoadHint=\{t\.tourHint\}/);
    // Kein roher iframe außerhalb der EmbedGate.
    assert.doesNotMatch(r, /<iframe/);
  });
});

describe("3D-Rundgang: Seiten und Eintrag", () => {
  it("der Messestand liest den Eintrag über den Schlüssel und zeigt den Abschnitt nur mit Adresse", () => {
    const seite = src("app/(partner)/partner/messestand/page.tsx");
    assert.match(seite, /loadPortalLink\(RUNDGANG_SCHLUESSEL, "partner", current\.edition_id\)/);
    assert.match(seite, /\{rundgang && \(\s*<section aria-labelledby="rundgang">/);
    assert.match(seite, /\.\.\.\(rundgang \? \[\{ id: "rundgang", label: b\.tourTitle \}\] : \[\]\)/);
    assert.match(seite, /<h2 id="rundgang"/);
  });

  it("der Kasten auf der Startseite führt zum Abschnitt und folgt der Menü-Regel des Messestands", () => {
    const start = src("app/(partner)/partner/page.tsx");
    assert.match(start, /loadPortalLink\(RUNDGANG_SCHLUESSEL, "partner", current\.edition_id\)/);
    assert.match(start, /sichtbar\.has\("booth"\) && rundgangAus\(tourLink\?\.url\)/);
    assert.match(start, /href="\/partner\/messestand#rundgang"/);
  });

  it("der Schlüssel ist der, den Admin → Medien → Links pflegt und die Migration anlegt", () => {
    assert.equal(RUNDGANG_SCHLUESSEL, "partner_3d_tour");
    const sql = migrationText("v6_partner_3d_tour");
    assert.match(sql, /\('partner_3d_tour', 'Summit-Rundgang in 3D', 'Summit tour in 3D',\s*'https:\/\/my\.matterport\.com\/show\/\?m=Aj4uVT45GpQ', array\['partner'\], 30\)/);
    assert.match(sql, /on conflict do nothing;/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
    // Der Startwert ist genau das, was die Seite einbettet.
    assert.equal(rundgangAus(MODELL)?.einbettung, MODELL);
    // Der Link-Eintrag verlangt https (portal_link.url) — der Startwert erfüllt es.
    assert.match(MODELL, /^https:\/\/[^\s]+$/);
  });

  it("der Eintrag ist nicht im Code: keine Matterport-Adresse in Seiten und Komponenten", () => {
    for (const datei of [
      "app/(partner)/partner/messestand/page.tsx",
      "app/(partner)/partner/page.tsx",
      "components/partner/Rundgang.tsx",
    ]) {
      assert.doesNotMatch(src(datei), /Aj4uVT45GpQ|m=[A-Za-z0-9]{6,}/, datei);
    }
  });
});

describe("3D-Rundgang: Texte DE und EN", () => {
  it("jeder Schlüssel steht in beiden Sprachen", () => {
    const benutzt = (datei: string, muster: RegExp) => [...src(datei).matchAll(muster)].map((m) => m[1]);
    const rundgang = benutzt("components/partner/Rundgang.tsx", /\bt\.([a-zA-Z]+)\b/g);
    const buch = [...new Set([...rundgang, "tourTitle", "tourLead", "tourFrameTitle"])].filter(
      (k) => !["embedNotice", "loading"].includes(k),
    );
    const start = ["tourBoxTitle", "tourBoxBody", "tourBoxAction"];
    for (const [sprache, dict] of [
      ["de", de],
      ["en", en],
    ] as const) {
      const b = dict.partnerBooth as Record<string, string>;
      const p = dict.partner as Record<string, string>;
      assert.deepEqual(buch.filter((k) => typeof b[k] !== "string" || !b[k]), [], `${sprache}: partnerBooth`);
      assert.deepEqual(start.filter((k) => typeof p[k] !== "string" || !p[k]), [], `${sprache}: partner`);
      assert.ok(dict.common.embedNotice.includes("{provider}"), `${sprache}: common.embedNotice`);
      assert.ok(dict.common.loading, `${sprache}: common.loading`);
    }
  });

  it("die Link-Verwaltung nennt den Rundgang und seine Ausnahme vom „nur verlinken“", () => {
    for (const dict of [de, en]) {
      const lead = (dict.videos as Record<string, string>).linksLead;
      assert.match(lead, /partner_3d_tour/);
      assert.match(lead, /my\.matterport\.com\/show\/\?m=/);
    }
  });
});
