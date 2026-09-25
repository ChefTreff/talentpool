import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { toRpcFailure } from "@/lib/rpc-error";
import {
  LETZTES_ENDE,
  MINUTEN_NACH_OEFFNUNG,
  fehlendAusDetail,
  fehlendFuerFreigabe,
  fensterText,
  imFenster,
  partnerStatus,
  standFenster,
} from "@/components/partner/standbuehne";

const sql = () => migrationText("v6_standbuehne_regeln");
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Rumpf einer Funktion aus dem Migrationstext, bis zum nächsten `$$;`. */
function rumpf(name: string): string {
  const s = sql();
  const start = s.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `${name} fehlt`);
  return s.slice(start, s.indexOf("$$;", start));
}

describe("Standbühne: Zeitfenster und Partner-Status (PART-079, PART-080)", () => {
  it("das Fenster steht einmal in der Datenbank: 90 Minuten nach Öffnung, Ende 19:00", () => {
    const f = rumpf("partner_booth_window");
    assert.match(f, /open_from \+ interval '90 minutes'/);
    assert.match(f, /least\(coalesce\(sd\.open_to, time '19:00'\), time '19:00'\)/);
    assert.match(f, /st\.type = 'partner_booth'/);
  });

  it("create_slot und move_slot prüfen das Fenster für den Partner", () => {
    for (const name of ["create_slot", "move_slot"]) {
      const f = rumpf(name);
      assert.match(f, /if partner_window_binds\(p_stage_id\) then/, name);
      assert.match(f, /raise exception 'outside_partner_window' using errcode = 'P0001'/, name);
    }
  });

  it("die Helfer sind intern, die RPCs laufen als SECURITY DEFINER mit festem search_path", () => {
    const s = sql();
    assert.match(s, /revoke execute on function partner_booth_window\(uuid, uuid\) from public, anon, authenticated;/);
    assert.match(s, /revoke execute on function partner_window_binds\(uuid\) from public, anon, authenticated;/);
    for (const name of ["partner_request_publish", "partner_withdraw_publish"]) {
      const f = rumpf(name);
      assert.match(f, /security definer/, name);
      assert.match(f, /set search_path = public, extensions/, name);
      assert.match(f, /can_edit_slot\(/, name);
      assert.match(f, /log_audit\(/, name);
    }
    assert.match(s.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("Veröffentlichen anfragen setzt review und die Partner-Organisation, nie published", () => {
    const f = rumpf("partner_request_publish");
    assert.match(f, /publish_status = 'review'/);
    assert.match(f, /partner_org_id = coalesce\(/);
    assert.doesNotMatch(f, /publish_status = 'published'/);
  });

  it("der Fehler kommt als eigener Schlüssel mit dem Fenster im detail an", () => {
    const res = toRpcFailure({
      code: "P0001",
      message: "outside_partner_window",
      details: "10:30–19:00",
      hint: "",
      name: "PostgrestError",
    } as Parameters<typeof toRpcFailure>[0]);
    assert.equal(res.key, "outside_partner_window");
    assert.equal(res.detail, "10:30–19:00");
  });
});

describe("Standbühne in der Oberfläche (PART-078…080)", () => {
  it("das angezeigte Fenster folgt denselben Zahlen wie die Datenbank", () => {
    const f = rumpf("partner_booth_window");
    assert.match(f, new RegExp(`open_from \\+ interval '${MINUTEN_NACH_OEFFNUNG} minutes'`));
    assert.match(f, new RegExp(`time '${LETZTES_ENDE}'`));
    assert.deepEqual(standFenster("09:00:00", "20:00:00"), { von: 630, bis: 1140 });
    assert.deepEqual(standFenster("09:00", "18:00"), { von: 630, bis: 1080 });
    assert.deepEqual(standFenster(null, null), { von: null, bis: 1140 });
    assert.equal(fensterText(standFenster("09:00", "20:00"), "bis {bis}"), "10:30–19:00");
    assert.equal(fensterText(standFenster(null, null), "bis {bis}"), "bis 19:00");
  });

  it("imFenster zieht dieselben Grenzen wie create_slot und move_slot", () => {
    const f = standFenster("09:00", "20:00");
    assert.equal(imFenster(f, 630, 660), true, "10:30–11:00");
    assert.equal(imFenster(f, 600, 630), false, "10:00–10:30");
    assert.equal(imFenster(f, 1110, 1140), true, "18:30–19:00");
    assert.equal(imFenster(f, 1125, 1155), false, "18:45–19:15");
    assert.equal(imFenster(standFenster(null, null), 480, 510), true, "ohne Rahmen kein Beginn");
  });

  it("Partner-Status: der interne Slot-Status taucht nicht auf, Rückgabe nur im Entwurf", () => {
    assert.equal(partnerStatus({ sessionId: null, publishStatus: null }), "offen");
    assert.equal(partnerStatus({ sessionId: "s", publishStatus: "draft" }), "in_bearbeitung");
    assert.equal(partnerStatus({ sessionId: "s", publishStatus: "draft", returnNote: "Titel fehlt" }), "zurueckgegeben");
    assert.equal(partnerStatus({ sessionId: "s", publishStatus: "review", returnNote: "Titel fehlt" }), "zur_freigabe");
    assert.equal(partnerStatus({ sessionId: "s", publishStatus: "published" }), "veroeffentlicht");
    assert.equal(partnerStatus({ sessionId: "s", publishStatus: "cancelled" }), "abgesagt");
    const rueckgabe = src("app/(partner)/partner/Rueckgabe.tsx");
    assert.match(rueckgabe, /x\.publish_status === "draft"/);
    assert.match(rueckgabe, /returnNote && publishStatus === "draft"/);
  });

  it("was für die Anfrage fehlt, prüft die Oberfläche wie partner_request_publish", () => {
    const leer = { title_de: "Titel", title_en: " ", description_de: null, description_en: "" };
    assert.deepEqual(fehlendFuerFreigabe(leer), ["title_en", "description"]);
    assert.deepEqual(fehlendFuerFreigabe({ ...leer, title_en: "Title", description_en: "Text" }), []);
    assert.deepEqual(fehlendAusDetail("title_de, description_de|description_en"), ["title_de", "description"]);
    assert.match(rumpf("partner_request_publish"), /'description_de\|description_en'/);
  });

  it("die Tabelle schreibt über die Board-RPCs und die Partner-Anfrage, nie mit service_role", () => {
    const tabelle = src("app/(partner)/partner/buehne/StandTabelle.tsx");
    for (const fn of ["createSlot", "moveSlot", "upsertSession", "attachSession", "requestStagePublish", "withdrawStagePublish"]) {
      assert.match(tabelle, new RegExp(`\\b${fn}\\(`), fn);
    }
    assert.match(tabelle, /<ConfirmDialog/);
    const seite = src("app/(partner)/partner/buehne/tabelle/page.tsx");
    assert.match(seite, /requireArea\("partner"/);
    assert.match(seite, /s\.type === "partner_booth"/);
    assert.match(seite, /<TableTabs basePath=\{BASE\}/);
    const actions = src("app/(partner)/partner/actions.ts");
    assert.match(actions, /rpc\("partner_request_publish", \{ p_session_id: sessionId \}\)/);
    assert.match(actions, /rpc\("partner_withdraw_publish", \{ p_session_id: sessionId \}\)/);
    for (const datei of [tabelle, seite, src("app/(partner)/partner/buehne/daten.ts")]) {
      assert.doesNotMatch(datei, /service_role|createSupabaseAdminClient|SUPABASE_SECRET/);
    }
  });

  it("Felder bleiben beim Speichern bearbeitbar, ein leerer Slot bekommt nur eine Session", () => {
    const tabelle = src("app/(partner)/partner/buehne/StandTabelle.tsx");
    // Hinge `bearbeitbar` an `pending`, würden die Felder während jeder Speicherung zu Text.
    assert.match(tabelle, /const bearbeitbar = z\.can_edit;/);
    // Zweites Feld vor dem Neuladen: dieselbe Session, keine zweite (verwaiste) im Backlog.
    assert.match(tabelle, /neuAngelegt\.current\.get\(z\.slot_id\)/);
    assert.match(tabelle, /neuAngelegt\.current\.set\(z\.slot_id, anlegen\)/);
  });

  it("jeder Text der Standbühne steht in beiden Wörterbüchern", () => {
    const code = ["StandTabelle.tsx", "StandInfo.tsx"].map((d) => src(`app/(partner)/partner/buehne/${d}`)).join("\n");
    const benutzt = [...new Set([...code.matchAll(/\bt\.([a-zA-Z]+)/g)].map((m) => m[1]))];
    assert.ok(benutzt.length > 40, `nur ${benutzt.length} Schlüssel gefunden`);
    for (const sprache of ["de", "en"]) {
      const block = JSON.parse(src(`lib/i18n/${sprache}.json`)).partnerStage as Record<string, string>;
      for (const key of benutzt) assert.equal(typeof block[key], "string", `${sprache}: partnerStage.${key}`);
    }
  });
});
