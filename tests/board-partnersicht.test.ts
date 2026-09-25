import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { geschlossen, oeffnung, oeffnungText } from "@/components/programme/oeffnung";
import {
  PARTNER_KARTE,
  PARTNER_LEGENDE,
  boardPartnerStatus,
  partnerStatusTexte,
} from "@/components/programme/partnerSicht";
import { PARTNER_STATUS, PARTNER_STATUS_TON } from "@/components/partner/standbuehne";

/**
 * Board-Partner-Schnitt (LEAD-033/035/036/037/045): Öffnungszeiten als
 * Schraffur, Partner-Status auf den eigenen Standbühnen, Anfrage und Gäste im
 * Schubfach. Geprüft wird die reine Logik und dass die Partner-Seite dem
 * Board die Wege des Partner-Portals hereinreicht.
 */
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const TAG = { programme_start: "13:00:00", programme_end: "20:30:00" };

describe("Öffnungszeiten im Board (LEAD-033)", () => {
  it("nimmt die Zeile aus stage_day, auch auf der Standbühne (PART-090)", () => {
    const tage = [{ stage_id: "s", open_from: "14:00:00", open_to: "18:00:00" }];
    assert.deepEqual(oeffnung({ id: "s", type: "side" }, tage, TAG), { von: 840, bis: 1080 });
    assert.deepEqual(oeffnung({ id: "s", type: "partner_booth" }, tage, TAG), { von: 840, bis: 1080 });
  });

  it("ohne Zeile: Standbühne im Programmrahmen, andere Bühnen ohne Grenze", () => {
    assert.deepEqual(oeffnung({ id: "b", type: "partner_booth" }, [], TAG), { von: 780, bis: 1230 });
    assert.equal(oeffnung({ id: "m", type: "main" }, [], TAG), null);
    // Ohne Tagesrahmen: 24:00 aus `partner_booth_window` heißt „kein Ende“.
    assert.equal(oeffnung({ id: "b", type: "partner_booth" }, [], null), null);
  });

  it("Standbühne: je Grenze die Öffnungszeit, sonst der Programmrahmen (0195)", () => {
    const nurEnde = [{ stage_id: "b", open_from: null, open_to: "18:00:00" }];
    assert.deepEqual(oeffnung({ id: "b", type: "partner_booth" }, nurEnde, TAG), { von: 780, bis: 1080 });
    // Auf anderen Bühnen bleibt die fehlende Seite offen (`create_slot`).
    const seite = [{ stage_id: "s", open_from: null, open_to: "18:00:00" }];
    assert.deepEqual(oeffnung({ id: "s", type: "side" }, seite, TAG), { von: null, bis: 1080 });
  });

  it("eine offene Seite bleibt offen, eine leere Zeile heißt keine Grenze", () => {
    assert.deepEqual(oeffnung({ id: "s", type: "side" }, [{ stage_id: "s", open_from: null, open_to: "19:00" }], TAG), {
      von: null,
      bis: 1140,
    });
    assert.equal(oeffnung({ id: "s", type: "side" }, [{ stage_id: "s", open_from: null, open_to: null }], TAG), null);
  });

  it("schraffiert davor und danach, im sichtbaren Fenster geklemmt", () => {
    // Fenster 12–21 Uhr (gewachsen um einen frühen Slot), geöffnet 14–18 Uhr.
    assert.deepEqual(geschlossen({ von: 840, bis: 1080 }, 720, 1260), [
      { von: 720, bis: 840 },
      { von: 1080, bis: 1260 },
    ]);
    // Öffnung deckt das Fenster: nichts zu schraffieren.
    assert.deepEqual(geschlossen({ von: 780, bis: 1230 }, 780, 1230), []);
    // Nur ein Ende bekannt.
    assert.deepEqual(geschlossen({ von: null, bis: 1140 }, 780, 1230), [{ von: 1140, bis: 1230 }]);
    // Öffnung ganz außerhalb des Fensters: alles zu, nie ein negativer Bereich.
    assert.deepEqual(geschlossen({ von: 1300, bis: 1400 }, 780, 1230), [{ von: 780, bis: 1230 }]);
    assert.deepEqual(geschlossen(null, 780, 1230), []);
  });

  it("schreibt die Öffnung als Text für den Spaltenkopf", () => {
    const t = { from: "ab {von}", until: "bis {bis}" };
    assert.equal(oeffnungText({ von: 780, bis: 1230 }, t), "13:00–20:30");
    assert.equal(oeffnungText({ von: 780, bis: null }, t), "ab 13:00");
    assert.equal(oeffnungText({ von: null, bis: 1140 }, t), "bis 19:00");
  });

  it("die Texte stehen in DE und EN", () => {
    for (const sprache of ["de", "en"] as const) {
      const p = woerterbuch(sprache).admin.programme;
      for (const k of ["openHours", "openFrom", "openUntil", "closedLegend"]) {
        assert.ok(p[k], `${sprache}.admin.programme.${k} fehlt`);
      }
      assert.ok(p.openHours.includes("{zeit}"));
      assert.ok(p.openFrom.includes("{von}"));
      assert.ok(p.openUntil.includes("{bis}"));
    }
  });

  it("das Muster steht als Utility im Kit", () => {
    const css = quelle("app/globals.css");
    assert.match(css, /--ct-hatch-closed:/);
    assert.match(css, /@utility bg-hatch-closed/);
  });
});

describe("Partner-Status im Board (LEAD-035/045)", () => {
  it("jede Stufe hat Karte, Legende und Text — dieselben wie in der Tabelle", () => {
    assert.deepEqual([...PARTNER_LEGENDE], [...PARTNER_STATUS]);
    for (const s of PARTNER_STATUS) {
      assert.ok(PARTNER_KARTE[s], `Karte für ${s} fehlt`);
      assert.ok(PARTNER_STATUS_TON[s], `Ton für ${s} fehlt`);
    }
    for (const sprache of ["de", "en"] as const) {
      const texte = partnerStatusTexte(woerterbuch(sprache).partnerStage);
      for (const s of PARTNER_STATUS) assert.ok(texte[s], `${sprache}: Text für ${s} fehlt`);
    }
  });

  it("Rückgabe nur im Entwurf, sonst der Stand der Session", () => {
    const rueck = { s1: "Bitte den englischen Titel ergänzen." };
    assert.equal(boardPartnerStatus({ session_id: null, publish_status: null }, rueck), "offen");
    assert.equal(boardPartnerStatus({ session_id: "s2", publish_status: "draft" }, rueck), "in_bearbeitung");
    assert.equal(boardPartnerStatus({ session_id: "s1", publish_status: "draft" }, rueck), "zurueckgegeben");
    assert.equal(boardPartnerStatus({ session_id: "s1", publish_status: "review" }, rueck), "zur_freigabe");
    assert.equal(boardPartnerStatus({ session_id: "s2", publish_status: "published" }, rueck), "veroeffentlicht");
    assert.equal(boardPartnerStatus({ session_id: "s2", publish_status: "cancelled" }, rueck), "abgesagt");
    // Eben im Board gespeichert, noch ohne Stand vom Server: in Bearbeitung.
    assert.equal(boardPartnerStatus({ session_id: "s3", publish_status: null }, rueck), "in_bearbeitung");
  });
});

describe("Partner-Sicht: Seite, Board und Schubfach hängen zusammen (LEAD-036/037)", () => {
  it("die Partner-Seite reicht die Wege des Partner-Portals herein", () => {
    const seite = quelle("app/(partner)/partner/buehne/page.tsx");
    assert.match(seite, /anfragen: requestStagePublish/);
    assert.match(seite, /zuruecknehmen: withdrawStagePublish/);
    assert.match(seite, /gastZuordnen: assignStageGuest/);
    assert.match(seite, /partner=\{partnerSicht\}/);
    assert.match(seite, /stageDays=\{board\.stageDays\}/);
  });

  it("Admin und Speaker-Leads zeigen die Öffnungszeiten, ohne Partner-Sicht", () => {
    for (const f of ["app/(admin)/admin/programm/page.tsx", "app/(speaker-leads)/speaker-leads/board/page.tsx"]) {
      const seite = quelle(f);
      assert.match(seite, /stageDays=\{board\.stageDays\}/, f);
      assert.doesNotMatch(seite, /partner=\{/, f);
    }
  });

  it("in der Partner-Sicht gibt das Schubfach nie frei — auch nicht für einen Admin", () => {
    const board = quelle("components/programme/Board.tsx");
    assert.match(board, /canPublish=\{canPublish && !partner\}/);
    assert.match(board, /partnerSicht=\{partner\}/);
  });

  it("das Schubfach nimmt für Gäste den Partner-Weg, nicht set_session_speakers", () => {
    const drawer = quelle("components/programme/SessionDrawer.tsx");
    assert.match(drawer, /partnerSicht\.gastZuordnen\(newId, profileId, true\)/);
    assert.match(drawer, /if \(!id && !partnerSicht && speakers\.length > 0\)/);
  });
});
