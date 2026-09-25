import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { toRpcFailure } from "@/lib/rpc-error";
import {
  EINORDNUNG_FELDER,
  EINORDNUNG_VOKABULAR,
  MAX_KONTAKT_VIA,
  MAX_THEMA,
  buehnenGeaendert,
  einordnungAenderungen,
  einordnungEntwurf,
  kontaktViaHatAdresse,
} from "@/lib/speaker/einordnung";
import { migrationText } from "@/tests/migration-datei";

/**
 * Einordnung der Speaker-Pipeline (LEAD-039 Schnitt 1). Die Oberfläche schickt
 * Schlüssel, die `update_speaker` annehmen muss, und prüft dieselben Regeln wie
 * der Trigger — beides steht an zwei Stellen und darf nicht auseinanderlaufen
 * (Zweiter Blick: „die RPC-Schlüsselliste gegen das, was die Oberfläche
 * schickt“, #147).
 */
const sql = () => migrationText("v6_lead039_einordnung");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

/** Rumpf einer Funktion aus dem Migrationstext, bis zum nächsten `$$;`. */
function rumpf(name: string): string {
  const s = sql();
  const start = s.search(new RegExp(`create (or replace )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} fehlt in der Migration`);
  return s.slice(start, s.indexOf("$$;", start));
}

describe("Einordnung: Oberfläche und Datenbank sprechen dieselben Schlüssel", () => {
  it("update_speaker nimmt jeden Schlüssel, den die Oberfläche schickt", () => {
    const f = rumpf("update_speaker");
    for (const k of EINORDNUNG_FELDER) {
      assert.match(f, new RegExp(`p_data \\? '${k}'`), `update_speaker nimmt ${k} nicht an`);
    }
  });

  it("der Trigger prüft jedes Auswahlfeld gegen dasselbe Vokabular — nur, wenn es sich ändert", () => {
    const f = rumpf("speaker_profile_check");
    for (const [feld, vokabular] of Object.entries(EINORDNUNG_VOKABULAR)) {
      assert.match(f, new RegExp(`is_vocab_key\\('${vokabular}', new\\.${feld}\\)`), `${feld} ↔ ${vokabular}`);
      assert.match(f, new RegExp(`new\\.${feld} is distinct from old\\.${feld}`), `${feld} wird bei jeder Änderung geprüft`);
    }
  });

  it("die Längen der Eingabefelder sind die des Triggers", () => {
    const f = rumpf("speaker_profile_check");
    assert.match(f, new RegExp(`length\\(new\\.topic_role\\), 0\\) > ${MAX_THEMA}`));
    assert.match(f, new RegExp(`length\\(new\\.contact_via\\), 0\\) > ${MAX_KONTAKT_VIA}`));
  });

  it("manager_speakers und speaker_detail geben alle Felder und die Bühnen aus", () => {
    const ms = rumpf("manager_speakers");
    const sd = rumpf("speaker_detail");
    for (const k of EINORDNUNG_FELDER) {
      assert.match(ms, new RegExp(`sp\\.${k}\\b`), `manager_speakers ohne ${k}`);
      assert.match(sd, new RegExp(`'${k}', v_sp\\.${k}`), `speaker_detail ohne ${k}`);
    }
    assert.match(ms, /stage_candidates jsonb/);
    assert.match(sd, /'stage_candidates'/);
    // Die Spalte, die 0099 schon einmal verlor, bleibt (db-konventionen §6).
    assert.match(ms, /internal_notes text/);
  });
});

describe("Einordnung: Fehlerschlüssel kommen als eigene Meldung an", () => {
  const FAELLE = [
    { code: "22023", message: "invalid_category" },
    { code: "22023", message: "invalid_topic_cluster" },
    { code: "22023", message: "invalid_priority" },
    { code: "22023", message: "invalid_format" },
    { code: "22023", message: "invalid_outreach_channel" },
    { code: "22023", message: "text_too_long" },
    { code: "22023", message: "contact_details_not_allowed" },
    { code: "P0001", message: "stage_not_in_edition" },
  ];
  for (const f of FAELLE) {
    it(`${f.message} → eigener Schlüssel, Text in DE und EN`, () => {
      const res = toRpcFailure({ code: f.code, message: f.message, details: "", hint: "", name: "PostgrestError" } as Parameters<
        typeof toRpcFailure
      >[0]);
      assert.equal(res.key, f.message);
      assert.ok(woerterbuch("de").rpc[f.message], `de.rpc.${f.message} fehlt`);
      assert.ok(woerterbuch("en").rpc[f.message], `en.rpc.${f.message} fehlt`);
      assert.match(sql(), new RegExp(`'${f.message}'`), `${f.message} kommt in der Migration nicht vor`);
    });
  }
});

describe("Einordnung: was die Oberfläche schickt", () => {
  const vorher = einordnungEntwurf({
    category: "politics",
    topic_cluster: null,
    topic_role: "Rolle",
    priority: "a",
    recommended_format: null,
    contact_via: null,
    outreach_channel: "linkedin",
    stage_candidates: [
      { stage_id: "s1", name: "Main" },
      { stage_id: "s2", name: "Side" },
    ],
  });

  it("nur geänderte Felder, geleert als leere Zeichenkette", () => {
    const jetzt = { ...vorher, priority: "b", topic_role: "", contact_via: "  über Konrad " };
    assert.deepEqual(einordnungAenderungen(vorher, jetzt), {
      topic_role: "",
      priority: "b",
      contact_via: "über Konrad",
    });
    assert.deepEqual(einordnungAenderungen(vorher, { ...vorher }), {});
  });

  it("die Reihenfolge der Bühnen ist keine Änderung", () => {
    assert.equal(buehnenGeaendert(vorher, { ...vorher, stage_ids: ["s2", "s1"] }), false);
    assert.equal(buehnenGeaendert(vorher, { ...vorher, stage_ids: ["s1"] }), true);
  });

  it("eine Adresse in „Kontakt via“ erkennt die Oberfläche wie der Trigger", () => {
    assert.equal(kontaktViaHatAdresse("über Office, max@beispiel.de"), true);
    assert.equal(kontaktViaHatAdresse("über Konrad"), false);
    assert.match(rumpf("speaker_profile_check"), /strpos\(coalesce\(new\.contact_via, ''\), '@'\) > 0/);
  });
});
