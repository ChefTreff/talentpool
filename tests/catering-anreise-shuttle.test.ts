import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

/**
 * SPK-073 + SPK-069: Gäste der Standbühne bekommen kein Speaker-Catering (K-39),
 * und die Anreise zeigt die gebuchten Shuttle-Fahrten statt des Abhol-Hakens,
 * den Speaker seit SPK-058 nicht mehr setzen.
 */
const sql = () => migrationText("v6_catering_anreise_shuttle");
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

function funktion(name: string): string {
  const s = sql();
  const start = s.search(new RegExp(`create (or replace )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} fehlt in der Migration`);
  return s.slice(start, s.indexOf("$$;", s.indexOf("AS $$", start) + 5));
}

describe("Catering ohne Gäste (SPK-073)", () => {
  it("catering_people nimmt Gäste der Standbühne heraus, Volunteers bleiben", () => {
    const f = funktion("catering_people");
    assert.match(f, /speaker_is_confirmed\(sp\.pipeline_status\)\s+(--[^\n]*\n\s*)?and not sp\.stage_guest/);
    assert.match(f, /from volunteer_profile vp/);
  });
});

describe("Anreise mit Shuttle (SPK-069): Datenbank", () => {
  it("speaker_travel_list wächst hinten um die Shuttle-Zahlen und bekommt den Grant zurück", () => {
    assert.match(sql(), /drop function if exists speaker_travel_list\(uuid\);/);
    const f = funktion("speaker_travel_list");
    assert.match(f, /updated_at timestamp with time zone, shuttle_requested integer, shuttle_confirmed integer\)/);
    assert.match(f, /b\.status = 'requested'/);
    assert.match(f, /b\.status = 'confirmed'/);
    // SPK-070 bleibt: Gäste reisen nicht über uns.
    assert.match(f, /and not sp\.stage_guest/);
    assert.match(sql(), /grant execute on function speaker_travel_list\(uuid\) to authenticated;/);
  });

  it("speaker_detail gibt den Shuttle-Stand aus", () => {
    assert.match(funktion("speaker_detail"), /'shuttle', jsonb_build_object\(\s*'requested', [\s\S]*'confirmed'/);
  });

  it("die Migration endet mit harden_definer_functions", () => {
    assert.match(sql().trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("Anreise mit Shuttle (SPK-069): Oberfläche", () => {
  it("die Anreise-Liste liest die Shuttle-Spalten, nicht mehr den Abhol-Haken", () => {
    const l = quelle("components/speaker/TravelList.tsx");
    assert.doesNotMatch(l, /needs_pickup/);
    assert.match(l, /shuttle_requested: number;/);
    assert.match(l, /t\.onlyShuttle/);
    assert.match(l, /t\.colShuttle/);
  });

  it("das Admin-Detail zeigt den Shuttle-Stand statt „Abholung ja/nein“", () => {
    const d = quelle("app/(admin)/admin/speaker/[id]/Detail.tsx");
    assert.doesNotMatch(d, /needs_pickup/);
    assert.match(d, /shuttleStand\(speaker\.shuttle, t\)/);
  });

  it("die Texte stehen in DE und EN, die alten Schlüssel sind weg", () => {
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache);
      for (const k of ["colShuttle", "onlyShuttle", "shuttleConfirmed", "shuttleRequested"]) {
        assert.ok(w.travelList[k], `${sprache}.travelList.${k} fehlt`);
      }
      for (const k of ["shuttle", "shuttleConfirmed", "shuttleNone", "shuttleRequested"]) {
        assert.ok(w.adminSpeaker[k], `${sprache}.adminSpeaker.${k} fehlt`);
      }
      assert.ok(w.travelList.shuttleRequested.includes("{n}"), `${sprache}: {n} fehlt`);
      assert.equal(w.travelList.onlyPickup, undefined);
      assert.equal(w.travelList.pickup, undefined);
      assert.equal(w.adminSpeaker.pickup, undefined);
    }
  });
});
