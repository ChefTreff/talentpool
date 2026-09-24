import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_SECTIONS,
  EXTERNAL_ROLES,
  TEAM_ROLES,
  canEnterAdminSection,
  isTeamMember,
  type AdminSectionKey,
} from "@/lib/admin-sections";

/**
 * PORT1: Die Tür zum Admin-Bereich steht seit dem 22.09.2026 jeder Teamrolle
 * offen — der Schutz sitzt in den Abschnitten. Diese Datei ist die Versicherung
 * dagegen, dass jemand eine Seite hinzufügt und das Gate vergisst: dann wäre sie
 * nicht nur ungeschützt, sondern für **alle** Teamrollen offen.
 */

const WURZEL = "app/(admin)/admin";

/** Alle Server-Dateien unter `/admin`, die ein Gate ziehen müssen. */
function seitenUndActions(dir = WURZEL, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      seitenUndActions(p, out);
      continue;
    }
    // Seiten, Layouts, Route-Handler und Server-Actions sind die Einstiege von
    // aussen. Komponenten (`*.tsx` ohne `page`) werden von ihnen gerendert und
    // haben kein eigenes Gate — sie sind nur über eine Seite erreichbar.
    if (/^(page|layout|route)\.tsx?$/.test(name) || name === "actions.ts") out.push(p);
  }
  return out;
}

describe("Admin-Abschnitte: Zugang", () => {
  it("jede Seite und jede Action unter /admin zieht ein Abschnitts-Gate", () => {
    const ohneGate: string[] = [];
    for (const p of seitenUndActions()) {
      const text = readFileSync(p, "utf8");
      // `shell.tsx`-Muster: manche Seiten holen das Gate aus einer gemeinsamen
      // Hülle im selben Ordner. Dann steht dort der Aufruf.
      const eigenes = text.includes("requireAdminSection") || text.includes("requireAnyAdminSection");
      const ausHuelle = /\b(partnerAdminShell|volunteerAdminShell)\b/.test(text);
      if (!eigenes && !ausHuelle) ohneGate.push(p);
    }
    assert.deepEqual(ohneGate, [], `ohne Abschnitts-Gate:\n${ohneGate.join("\n")}`);
  });

  it("kein Aufruf benutzt mehr das alte Bereichs-Gate allein", () => {
    // `requireArea("admin")` heisst jetzt nur noch „ist im Team" und gehört ins
    // Layout. In einer Seite wäre es ein offenes Tor für jede Teamrolle.
    const alt: string[] = [];
    for (const p of seitenUndActions()) {
      const text = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      if (/requireArea\(\s*"admin"/.test(text) || /requireStaff\(/.test(text)) alt.push(p);
    }
    assert.deepEqual(alt, [], `benutzen noch das Bereichs-Gate:\n${alt.join("\n")}`);
  });

  it("jeder Abschnitt der Navigation hat einen Eintrag in der Zugangsliste", () => {
    const layout = readFileSync("app/(admin)/layout.tsx", "utf8");
    const genutzt = [...layout.matchAll(/eintrag\("([a-zA-Z]+)"/g)].map((m) => m[1]);
    const bekannt = new Set(ADMIN_SECTIONS.map((s) => s.key));
    const fremd = genutzt.filter((k) => !bekannt.has(k as AdminSectionKey));
    assert.deepEqual(fremd, [], `Navigation zeigt unbekannte Abschnitte: ${fremd.join(", ")}`);
  });
});

describe("PORT2: die alten Produktions-Adressen führen weiter", () => {
  it("leitet /produktion und alles darunter nach /admin/produktion", async () => {
    // Geprüft an der Konfiguration statt am laufenden Server: die Regel muss
    // **vor** der Rollenprüfung greifen, damit ein nicht angemeldeter Aufruf auf
    // dem Login mit dem neuen Ziel landet und nicht auf einer 404 — ein
    // Seiten-`redirect()` im alten Bereich könnte das nicht leisten, weil es den
    // Bereich voraussetzt, den es nicht mehr gibt.
    const { default: config } = await import("@/next.config");
    const rules = await config.redirects!();
    const wurzel = rules.find((r) => r.source === "/produktion");
    const unter = rules.find((r) => r.source === "/produktion/:path*");
    assert.ok(wurzel, "Weiterleitung für /produktion fehlt");
    assert.equal(wurzel!.destination, "/admin/produktion");
    assert.ok(unter, "Weiterleitung für /produktion/:path* fehlt");
    assert.equal(unter!.destination, "/admin/produktion/:path*");
    // Ohne Host-Bedingung: die alten Adressen gelten auf jeder Domain, auch lokal.
    assert.equal(wurzel!.has, undefined);
    assert.equal(unter!.has, undefined);
  });

  it("es gibt keine Seite mehr unter dem alten Pfad", () => {
    // Läge dort noch eine Seite, gewänne sie gegen die Weiterleitung.
    assert.equal(existsSync("app/(produktion)"), false);
  });
});

describe("Admin-Abschnitte: Rollen", () => {
  it("admin öffnet jeden Abschnitt", () => {
    for (const s of ADMIN_SECTIONS) {
      assert.equal(canEnterAdminSection(s.key, ["admin"]), true, s.key);
    }
  });

  it("die Verwaltung bleibt bei admin — auch für Bereichsleads", () => {
    // PORT4: Personen, Team, Rollen, Dubletten, Löschanträge. Ein Bereichslead
    // führt seine Domäne, er vergibt keine Rechte.
    const verwaltung: AdminSectionKey[] = ["persons", "team", "roles", "duplicates", "deletions"];
    for (const key of verwaltung) {
      for (const rolle of TEAM_ROLES.filter((r) => r !== "admin")) {
        assert.equal(canEnterAdminSection(key, [rolle]), false, `${key} / ${rolle}`);
      }
    }
  });

  it("die Produktion sieht ihre Abschnitte und nicht die der anderen", () => {
    const produktion = ["production_team"];
    assert.equal(canEnterAdminSection("production", produktion), true);
    assert.equal(canEnterAdminSection("regie", produktion), true);
    assert.equal(canEnterAdminSection("catering", produktion), true);
    // Nicht ihre Baustelle:
    assert.equal(canEnterAdminSection("partner", produktion), false);
    assert.equal(canEnterAdminSection("expenses", produktion), false);
    assert.equal(canEnterAdminSection("persons", produktion), false);
  });

  it("der Partner-Lead sieht Partner und Initiativen, nicht die Speaker-Listen", () => {
    const partner = ["area_lead_partner"];
    assert.equal(canEnterAdminSection("partner", partner), true);
    assert.equal(canEnterAdminSection("initiatives", partner), true);
    assert.equal(canEnterAdminSection("hospitality", partner), false);
    assert.equal(canEnterAdminSection("roles", partner), false);
  });

  it("die Rollenliste hier und die in der Datenbank sind dieselbe", () => {
    // Zwei Listen für „wer ist Team" laufen auseinander, und dann sieht jemand
    // eine Seite, die ihm die Datenbank verweigert. Der Vorschlag für
    // `team_role_keys()` steht in der Migration; hier wird er dagegengehalten.
    const sql = readFileSync("supabase/migrations/vorschlag/v6_rollenmodell_abschnitte.sql", "utf8");
    // Nur das Array selbst lesen — `set search_path to 'public', 'extensions'`
    // steht im selben Rumpf und wäre sonst zweimal „Rolle".
    const block = sql.slice(sql.indexOf("create or replace function team_role_keys"));
    const liste = block.slice(block.indexOf("select array["), block.indexOf("]::text[]"));
    const inDb = [...liste.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    assert.deepEqual([...TEAM_ROLES].sort(), [...new Set(inDb)].sort());
  });

  it("die externen Rollen stehen in keinem Abschnitt", () => {
    // `speaker_manager` sind die Bühnenleitungen von aussen (Konrad 24.09.),
    // `volunteer_lead` führt Schichten, `checkin_operator` ist ein Tablet.
    // Keine davon gehört in den Admin — und sie standen bis zum 24.09. in
    // `team_role_keys()`, wären mit PORT1 also Teammitglieder geworden.
    for (const extern of EXTERNAL_ROLES) {
      assert.equal(isTeamMember([extern]), false, extern);
      for (const s of ADMIN_SECTIONS) {
        assert.equal(canEnterAdminSection(s.key, [extern]), false, `${s.key} / ${extern}`);
      }
    }
  });

  it("jeder Bereich hat eine Lead- und eine Team-Rolle", () => {
    // Konrads Modell (24.09.). Speaker und Programm sind **ein** Bereich:
    // Lead `area_lead_speaker`, Team `programme_team`.
    const paare: [string, string][] = [
      ["area_lead_talent", "talent_team"],
      ["area_lead_speaker", "programme_team"],
      ["area_lead_partner", "partner_team"],
      ["area_lead_volunteers", "volunteers_team"],
      ["area_lead_hackathon", "hackathon_team"],
      ["area_lead_production", "production_team"],
    ];
    for (const [lead, team] of paare) {
      assert.ok(TEAM_ROLES.includes(lead as never), lead);
      assert.ok(TEAM_ROLES.includes(team as never), team);
    }
  });

  it("wer keine Teamrolle hat, ist kein Teammitglied", () => {
    assert.equal(isTeamMember([]), false);
    assert.equal(isTeamMember(["speaker"]), false);
    assert.equal(isTeamMember(["partner_contact", "volunteer"]), false);
    assert.equal(isTeamMember(["speaker_manager"]), false);
    assert.equal(isTeamMember(["production_team"]), true);
    assert.equal(isTeamMember(["admin"]), true);
  });

  it("ein Abschnitt ohne genannte Rolle ist zu, nicht offen", () => {
    // Fail closed: `roles: []` heisst „nur admin". Wer einen Abschnitt ergänzt
    // und die Rollen vergisst, sperrt ihn — statt ihn allen zu öffnen.
    const nurAdmin = ADMIN_SECTIONS.filter((s) => s.roles.length === 0);
    assert.ok(nurAdmin.length > 0, "Beispiel für den Fail-closed-Fall fehlt");
    for (const s of nurAdmin) {
      assert.equal(canEnterAdminSection(s.key, ["programme_team", "area_lead_speaker"]), false, s.key);
    }
  });

  it("jeder Abschnittspfad liegt unter /admin und ist eindeutig", () => {
    const pfade = ADMIN_SECTIONS.map((s) => s.path);
    for (const p of pfade) assert.ok(p === "/admin" || p.startsWith("/admin/"), p);
    assert.equal(new Set(pfade).size, pfade.length, "doppelter Pfad in ADMIN_SECTIONS");
  });
});
