import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { AREAS, areasFor, canEnterArea, landingPathFor, safeNextPath, type AreaKey } from "@/lib/areas";

/**
 * `requireAnyArea` selbst braucht eine Session; die Entscheidung dahinter ist
 * aber rein: „öffnet dieses Rollenset einen der genannten Bereiche?"
 */
function opensAny(keys: AreaKey[], roles: string[]): boolean {
  return keys.some((key) => {
    const area = AREAS.find((a) => a.key === key);
    return area ? canEnterArea(area, roles) : false;
  });
}

const BOARD: AreaKey[] = ["admin", "speaker-leads"];

describe("Bereichs-Gate", () => {
  it("lässt das Team und die Speaker-Leads ans Board", () => {
    assert.equal(opensAny(BOARD, ["speaker_manager"]), true);
    assert.equal(opensAny(BOARD, ["area_lead_speaker"]), true);
    assert.equal(opensAny(BOARD, ["admin"]), true);
    // Das Programm-Team kommt seit 15.09. über den eigenen Bereich ans Board:
    // die RPCs dahinter (`manager_speakers`, `speaker_travel_list`,
    // `speaker_managers`) lassen es ohnehin durch — Gate und Funktion gehören
    // zusammen.
    assert.equal(opensAny(BOARD, ["programme_team"]), true);
  });

  it("hält alle anderen draußen", () => {
    assert.equal(opensAny(BOARD, []), false);
    assert.equal(opensAny(BOARD, ["speaker"]), false);
    assert.equal(opensAny(BOARD, ["speaker_assistant"]), false);
    assert.equal(opensAny(BOARD, ["volunteer", "partner_contact"]), false);
  });

  it("kennt keinen erfundenen Bereich", () => {
    assert.equal(opensAny(["gibtesnicht" as AreaKey], ["admin"]), false);
  });

  it("öffnet Talent für jede eingeloggte Person, Speaker aber nicht", () => {
    assert.equal(opensAny(["talent"], []), true);
    assert.equal(opensAny(["speaker"], []), false);
  });
});

describe("Rücksprungziel nach dem Login", () => {
  it("nimmt Pfade auf diesem Host", () => {
    assert.equal(safeNextPath("/speaker-leads/board"), "/speaker-leads/board");
  });

  it("verwirft alles, was woanders hinführt", () => {
    for (const evil of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "speaker-leads/board",
      "",
      null,
    ]) {
      assert.equal(safeNextPath(evil), "/start", `abgelehnt: ${String(evil)}`);
    }
  });
});

describe("Einstieg nach dem Login (F1)", () => {
  it("führt in den eigenen Fachbereich, nicht ins Teilnehmer-Portal", () => {
    // Jede angemeldete Person hat zusätzlich das Teilnehmer-Portal — es darf
    // den Fachbereich nicht verdrängen.
    assert.equal(landingPathFor(areasFor(["speaker"])), "/speaker");
    assert.equal(landingPathFor(areasFor(["partner_contact"])), "/partner");
    assert.equal(landingPathFor(areasFor(["volunteer"])), "/volunteers");
    // Produktion seit PORT2: kein eigenes Portal mehr, der Einstieg ist /admin.
    assert.equal(landingPathFor(areasFor(["production_team"])), "/admin");
  });

  it("bleibt beim Teilnehmer-Portal, wenn es der einzige Bereich ist", () => {
    // Seit 22.09.2026 die Menueseite statt des Profils: wer nur das
    // Teilnehmer-Portal hat, soll sehen, was es gibt, statt in einem
    // Formular zu landen.
    assert.equal(landingPathFor(areasFor([])), "/start");
  });

  it("führt das Team nach Admin, auch mit Testrollen in anderen Bereichen", () => {
    // Ohne diese Regel entschiede die Reihenfolge in AREAS: Speaker steht vor
    // Admin, also wäre Konrad mit seinen Testrollen im Speaker-Portal gelandet.
    // „Team" heisst seit 0107 die Rolle `admin` und nicht mehr `is_staff()`.
    assert.equal(landingPathFor(areasFor(["admin"])), "/admin");
    assert.equal(landingPathFor(areasFor(["admin", "speaker", "partner_contact"])), "/admin");
    // Ohne Admin gilt weiter der erste eigene Bereich.
    assert.equal(landingPathFor(areasFor(["speaker", "partner_contact"])), "/speaker");
  });
});

describe("Bereiche zählen (F8.3: Auswahl im Menü)", () => {
  it("gibt einer reinen Teilnehmerin genau ihr Portal", () => {
    assert.deepEqual(
      areasFor([]).map((a) => a.key),
      ["talent"],
    );
  });

  it("führt das Teilnehmer-Portal neben dem Fachbereich (F8.7)", () => {
    // Runde 1 hatte es verdrängt, damit über dem Speaker-Portal nicht
    // „Talent | Speaker" stand. Konrad hat das am 14.09. zurückgenommen: das
    // Teilnehmer-Portal ist das Front-End des Talent-CRM und gilt übergreifend.
    assert.deepEqual(
      areasFor(["speaker"]).map((a) => a.key),
      ["talent", "speaker"],
    );
    assert.deepEqual(
      areasFor(["volunteer"]).map((a) => a.key),
      ["talent", "volunteers"],
    );
  });

  it("lässt den Einstieg trotzdem im Fachbereich (F8.7)", () => {
    // Sichtbarkeit hat sich geändert, der Einstieg nicht: wer einen
    // Fachbereich hat, landet dort und nicht im Teilnehmer-Portal.
    assert.equal(landingPathFor(areasFor(["speaker"])), "/speaker");
    assert.equal(landingPathFor(areasFor(["volunteer"])), "/volunteers");
  });

  it("zeigt dem Team weiterhin alle seine Bereiche", () => {
    // Seit 0107 macht die Rolle `admin` das Team aus, nicht mehr `is_staff()`.
    assert.deepEqual(
      areasFor(["speaker_manager", "admin"]).map((a) => a.key),
      ["talent", "speaker", "speaker-leads", "partner", "volunteers", "hackathon", "admin", "checkin"],
    );
  });

  it("lässt den Zugang zum Profil unberührt", () => {
    // `areasFor` steuert nur Umschalter und Einstieg — die Tür zu /profil
    // öffnet weiterhin `canEnterArea`.
    const talent = AREAS.find((a) => a.key === "talent")!;
    assert.equal(canEnterArea(talent, ["speaker"]), true);
    assert.equal(canEnterArea(talent, []), true);
  });
});

describe("Kiosk am Einlass (B4/E8)", () => {
  const kiosk = ["checkin_operator"];

  it("öffnet dem Gerätekonto genau einen Bereich", () => {
    const areas = areasFor(kiosk);
    assert.deepEqual(
      areas.map((a) => a.key),
      ["checkin"],
    );
    assert.equal(landingPathFor(areas), "/checkin");
  });

  it("lässt das Gerätekonto nicht ins Teilnehmer-Portal", () => {
    // Der Teilnehmer-Bereich trägt `roles: []` — „jede angemeldete Person".
    // Ohne die Kiosk-Ausnahme stünde das ganze Profil auf einem Tablet offen,
    // das am Eingang herumsteht.
    assert.equal(opensAny(["talent"], kiosk), false);
    assert.equal(opensAny(["admin"], kiosk), false);
    assert.equal(opensAny(["speaker"], kiosk), false);
  });

  it("nimmt niemandem etwas weg, der die Rolle zusätzlich hat", () => {
    // Team, das am Eingang aushilft: Kiosk **und** die eigenen Bereiche.
    // Seit PORT2 ist die Produktion ein Abschnitt des Admin-Bereichs, kein
    // eigenes Portal — „die eigenen Bereiche" heisst für sie jetzt `/admin`.
    const dazu = ["checkin_operator", "production_team"];
    assert.equal(opensAny(["checkin"], dazu), true);
    assert.equal(opensAny(["admin"], dazu), true);
    assert.equal(opensAny(["talent"], dazu), true);
  });

  it("hält Konten ohne die Rolle vom Kiosk fern", () => {
    assert.equal(opensAny(["checkin"], []), false);
    assert.equal(opensAny(["checkin"], ["volunteer"]), false);
    // Team ist nicht automatisch Einlass: die Rolle wird je Gerät vergeben.
    assert.equal(opensAny(["checkin"], ["production_team"]), false);
    // Admin global öffnet weiterhin alles.
    assert.equal(opensAny(["checkin"], ["admin"]), true);
  });
});

describe("Portalauswahl in der Seitenleiste (F8.6)", () => {
  /** Was `SidebarShell` als Portalliste anbietet. */
  const portale = (roles: string[]) =>
    areasFor(roles)
      .filter((a) => a.key !== "admin" && a.key !== "checkin")
      .map((a) => a.key);

  it("führt weder Admin noch Einlass als Portal", () => {
    // Admin ist die Verwaltung hinter den Portalen und steht unten in der
    // Leiste; der Einlass ist eine Geräte-App, das Kiosk-Konto landet direkt
    // dort und das Team erreicht ihn über den Admin-Bereich.
    const alle = portale(["admin"]);
    assert.equal(alle.includes("admin"), false);
    assert.equal(alle.includes("checkin"), false);
    // Mit globalem Admin öffnet `canEnterArea` jeden Bereich — gerade dann
    // dürfen die beiden nicht in der Liste stehen.
    const konrad = portale(["admin", "speaker"]);
    assert.equal(konrad.includes("admin"), false);
    assert.equal(konrad.includes("checkin"), false);
    assert.equal(konrad.includes("speaker"), true);
  });

  it("lässt die echten Portale unangetastet", () => {
    assert.deepEqual(portale(["speaker"]), ["talent", "speaker"]);
  });

  it("führt das Teilnehmer-Portal für jede Person mit Fachbereich (TAL-004)", () => {
    // Konrad 24.09.: „unser wichtigstes Portal" — es steht immer als eigener
    // Eintrag im Umschalter, nie nur als Anhang eines Fachbereichs.
    for (const roles of [
      ["speaker"],
      ["speaker_assistant"],
      ["speaker_manager"],
      ["partner_contact"],
      ["volunteer_lead"],
      ["production_team"],
      ["area_lead_speaker"],
      ["admin"],
    ]) {
      assert.equal(portale(roles)[0], "talent", roles.join(","));
    }
  });
});

describe("Shell des Teilnehmer-Portals (TAL-004)", () => {
  // Das Layout ist eine Server-Komponente mit Session; geprüft wird deshalb
  // der Quelltext: es rendert immer die eigene Shell und fragt nicht mehr
  // nach einem Fachbereich, in dessen Shell es sich einhängen könnte.
  const src = readFileSync(new URL("../app/(talent)/layout.tsx", import.meta.url), "utf8");

  it("rendert die Shell immer als Teilnehmer-Portal", () => {
    assert.match(src, /area="talent"/);
    assert.doesNotMatch(src, /area=\{home/);
    assert.doesNotMatch(src, /getMyAreas/);
  });

  it("führt Home und die Seitengruppe Summit (TAL-005, D11)", () => {
    assert.match(src, /href: "\/start"/);
    assert.match(src, /label: t\.talentSummit\.groupLabel/);
    assert.match(src, /href: "\/summit"/);
  });
});
