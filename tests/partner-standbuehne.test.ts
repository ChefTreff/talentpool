import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { toRpcFailure } from "@/lib/rpc-error";
import {
  OHNE_ENDE,
  fehlendAusDetail,
  fehlendFuerFreigabe,
  fensterText,
  imFenster,
  partnerStatus,
  standFenster,
} from "@/components/partner/standbuehne";

const sql = () => migrationText("v6_standbuehne_regeln");
/** PART-090: das Fenster aus den Öffnungszeiten ersetzt die Regel aus 0179. */
const sqlOeffnung = () => migrationText("v6_standbuehne_oeffnungszeiten");
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Rumpf einer Funktion aus dem Migrationstext, bis zum nächsten `$$;`. */
function rumpf(name: string, text: string = sql()): string {
  const start = text.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `${name} fehlt`);
  return text.slice(start, text.indexOf("$$;", start));
}

describe("Standbühne: Zeitfenster und Partner-Status (PART-090, PART-080)", () => {
  it("das Fenster sind die Öffnungszeiten der Bühne, sonst der Tagesrahmen — ohne Aufschlag und ohne 19:00", () => {
    const text = sqlOeffnung();
    const f = rumpf("partner_booth_window", text);
    assert.match(f, /coalesce\(sd\.open_from, ed\.programme_start\)/);
    // Ende nie NULL: create_slot und move_slot bauen das detail als `von–bis`.
    assert.match(f, /coalesce\(sd\.open_to, ed\.programme_end, time '24:00'\)/);
    assert.match(f, /st\.type = 'partner_booth'/);
    assert.doesNotMatch(f, /90 minutes|19:00/);
    assert.match(f, /security definer/);
    assert.match(f, /set search_path = public, extensions/);
    assert.match(text, /revoke execute on function partner_booth_window\(uuid, uuid\) from public, anon, authenticated;/);
    assert.match(text.trimEnd(), /select harden_definer_functions\(\);$/);
    // Nur die Fensterfunktion: create_slot und move_slot bleiben die Live-Fassung aus 0179.
    assert.doesNotMatch(text, /create or replace function (create_slot|move_slot)\(/);
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
  it("das angezeigte Fenster folgt derselben Rückfallfolge wie die Datenbank", () => {
    assert.match(rumpf("partner_booth_window", sqlOeffnung()), new RegExp(`time '${OHNE_ENDE / 60}:00'`));
    // Öffnungszeiten der Bühne gelten, wie sie sind.
    assert.deepEqual(standFenster("12:00:00", "20:00:00", "13:00:00", "20:30:00"), { von: 720, bis: 1200 });
    // Ohne Zeile der Programmrahmen des Tages, je Grenze einzeln.
    assert.deepEqual(standFenster(null, null, "13:00:00", "20:30:00"), { von: 780, bis: 1230 });
    assert.deepEqual(standFenster("10:00", null, null, "19:30"), { von: 600, bis: 1170 });
    // Ganz ohne Rahmen: kein Beginn, Ende 24:00.
    assert.deepEqual(standFenster(null, null), { von: null, bis: OHNE_ENDE });
    assert.equal(fensterText(standFenster("12:00", "20:00"), "bis {bis}"), "12:00–20:00");
    assert.equal(fensterText(standFenster(null, null, null, "19:30"), "bis {bis}"), "bis 19:30");
    // 24:00 bleibt 24:00 — wie im detail der Datenbank, nicht 00:00.
    assert.equal(fensterText(standFenster("10:00", null), "bis {bis}"), "10:00–24:00");
  });

  it("imFenster zieht dieselben Grenzen wie create_slot und move_slot", () => {
    const f = standFenster("12:00", "20:00");
    assert.equal(imFenster(f, 720, 740), true, "12:00–12:20, direkt zur Öffnung");
    assert.equal(imFenster(f, 705, 725), false, "11:45–12:05");
    assert.equal(imFenster(f, 1180, 1200), true, "19:40–20:00, bis zum Schluss");
    assert.equal(imFenster(f, 1190, 1210), false, "19:50–20:10");
    assert.equal(imFenster(standFenster(null, null), 360, 380), true, "ohne Rahmen keine Grenze");
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
    assert.match(seite, /<BuehnenTabs/);
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
