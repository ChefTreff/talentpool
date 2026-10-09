import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { geruestEventId } from "@/app/(admin)/admin/edition/felder";

/**
 * ADM-107: das Gerüst unter `/admin/edition` zeigt die Veranstaltung mit den Bühnen. Befund am 08.10.2026 gegen die Live-Daten: die Seite rief
 * `programme_skeleton()` ohne Argument; die Funktion nimmt das neueste Event mit `is_edition` — `fls27`, mit zwei Tagen und **null Bühnen**.
 * Alle zwölf Bühnen, die Sperrzeit und die Sessions hängen am Summit (`summit-27`, Kind-Event der Edition, LEAD-014). Die Seite zeigte darum
 * keine Bühne, keine Sperrzeit und kein Partnerfeld (ADM-085, ADM-106); Tage, die dort geändert wurden, trafen nur die Kopie an der Edition.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (text: string) => text.replace(/--[^\n]*/g, "");

describe("ADM-107: welches Gerüst die Seite nachlädt (ausgeführt)", () => {
  it("steht die Edition selbst im Gerüst, kommt der Summit nach", () => {
    assert.equal(geruestEventId("edition", [{ id: "summit" }]), "summit");
    // ohne geladene Veranstaltung genauso
    assert.equal(geruestEventId(null, [{ id: "summit" }]), "summit");
  });

  it("ist der Summit schon geladen, oder gibt es keinen, wird nichts nachgeladen", () => {
    assert.equal(geruestEventId("summit", [{ id: "summit" }]), null);
    assert.equal(geruestEventId("edition", []), null);
    assert.equal(geruestEventId(null, []), null);
  });

  it("gibt es mehrere, gilt der erste — die Reihenfolge der Wahl des Boards", () => {
    assert.equal(geruestEventId("edition", [{ id: "a" }, { id: "b" }]), "a");
    assert.equal(geruestEventId("a", [{ id: "a" }, { id: "b" }]), null);
  });
});

describe("ADM-107: die Seite (Quelltext)", () => {
  const p = quelle("app/(admin)/admin/edition/page.tsx");

  it("fragt erst die Edition, wählt über `boardEvents` wie das Board und lädt das Gerüst des Summit mit seiner ID", () => {
    assert.match(p, /import \{ boardEvents \} from "@\/components\/programme\/events";/);
    assert.match(p, /const \{ data, error \} = await supabase\.rpc\("programme_skeleton"\);\s+if \(error \|\| !data\) notFound\(\);\s+let geruest = data as Geruest;/);
    assert.match(p, /const summits = await boardEvents\(supabase, geruest\.event \? \[geruest\.event\.id\] : undefined\);/);
    assert.match(p, /const summitId = geruestEventId\(geruest\.event\?\.id \?\? null, summits\);/);
    assert.match(p, /supabase\.rpc\("programme_skeleton", \{ p_event_id: summitId \}\)/);
  });

  it("fehlt der Summit oder antwortet er nicht, bleibt das Gerüst der Edition stehen", () => {
    assert.match(p, /if \(summitData\) geruest = summitData as Geruest;/);
  });

  it("Sperrzeiten und Partnersuche nehmen die ID des geladenen Gerüsts, nicht die der Edition", () => {
    assert.match(p, /supabase\.rpc\("stage_blocked_times", \{ p_event_id: geruest\.event\.id \}\)/);
    // die Ansicht legt Tage und Bühnen unter dieser ID an und sucht Partner über sie
    const v = quelle("app/(admin)/admin/edition/GeruestView.tsx");
    assert.match(v, /const eventId = geruest\.event\?\.id \?\? "";/);
  });
});

describe("ADM-107: der Grund, aus den Live-Fassungen belegt", () => {
  it("`programme_skeleton` ohne Argument nimmt die Edition und listet nur Bühnen, die an genau dieser Veranstaltung hängen", () => {
    const f = code(quelle("supabase/snapshot/functions/programme_skeleton.sql"));
    assert.match(f, /select e\.id from event e where e\.is_edition order by e\.start_date desc limit 1/);
    assert.match(f, /from stage st where st\.event_id = v_ev/);
    assert.match(f, /create or replace function programme_skeleton\(p_event_id uuid DEFAULT NULL::uuid\)/);
  });

  it("das Board wählt dieselbe Veranstaltung, die die Seite jetzt lädt: ohne Edition, mit Bühnen, der Summit zuerst", () => {
    const e = quelle("components/programme/events.ts");
    assert.match(e, /\.filter\(\(e\) => !e\.is_edition && \(e\.stage\?\.length \?\? 0\) > 0\)/);
    assert.match(e, /const summits = bespielbar\.filter\(\(e\) => e\.format_tag === "summit"\);/);
    assert.match(e, /\(editionIds \?\? \[\]\)|scoped\.has\(e\.edition_id\)/);
  });
});

describe("ADM-107: Doku", () => {
  it("der Testleitfaden sagt, dass die Seite den Summit zeigt", () => {
    assert.match(quelle("docs/team-testleitfaden.md"), /\*\*Welche Veranstaltung \(ADM-107\):\*\*/);
  });
});
