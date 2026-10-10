import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { istVorschlag, migrationText } from "@/tests/migration-datei";

/**
 * PART-148 Option B (Plan 10.10.2026) — der Helfer `session_partner_org`: die Organisation einer Session für Partnerrechte wird **abgeleitet** (`partner_org_id`, sonst die Organisation der
 * gebrandeten Bühne des Slots), nie gespeichert. Quelltext-Test: die Form der Migration, ihr Eingriff gegen die Live-Fassung im Snapshot (solange sie ein Vorschlag ist) und ein Wächter über
 * alle `partner_*`-Funktionen — wer `session.partner_org_id` liest, nimmt den Helfer oder steht mit Grund in der Ausnahmeliste. Das ist der Preis der Ableitung: jede künftige Partnerfunktion
 * muss sich entscheiden. Das Verhalten belegt der SQL-Test `supabase/tests/v6_partner_session_org.sql` (und der unveränderte von 0293, `v6_eure_buehne`).
 */

const NAME = "v6_partner_session_org";
const migration = () => migrationText(NAME);
/** Kommentare raus: ein Satz, der etwas erwähnt, ist keine Anweisung. */
const sqlCode = (sql: string) => sql.replace(/--[^\n]*/g, "");

/** Alle `create or replace function <name>(…) … $$ … $$` eines Textes, nach Namen. */
function funktionen(sql: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of sql.matchAll(/create or replace function (\w+)\(/gi)) {
    const start = x.index ?? 0;
    const auf = sql.indexOf("$$", start);
    const zu = auf < 0 ? -1 : sql.indexOf("$$", auf + 2);
    assert.ok(zu > 0, `${x[1]}: Rumpf nicht gefunden`);
    m.set(x[1], sql.slice(start, zu + 2));
  }
  return m;
}

const SNAPSHOT = "supabase/snapshot/functions";
const snapshotText = (name: string) => readFileSync(`${SNAPSHOT}/${name}.sql`, "utf8");
const VIER = ["partner_format_sessions", "partner_update_session", "partner_add_speaker", "partner_speakers"] as const;

/** Zeilen, die in `a`, aber nicht in `b` stehen (als Vielfachmenge, ohne Leerraum am Rand und ohne leere Zeilen). */
function zeilenNur(a: string, b: string): string[] {
  const norm = (t: string) => t.split("\n").map((z) => z.trim()).filter((z) => z !== "");
  const rest = new Map<string, number>();
  for (const z of norm(b)) rest.set(z, (rest.get(z) ?? 0) + 1);
  const aus: string[] = [];
  for (const z of norm(a)) {
    const n = rest.get(z) ?? 0;
    if (n > 0) rest.set(z, n - 1);
    else aus.push(z);
  }
  return aus;
}

describe("PART-148 B: die Migration", () => {
  it("setzt den Pfad zuerst, endet mit der Härtung und definiert genau den Helfer und die vier Funktionen — nichts sonst", () => {
    const sql = sqlCode(migration());
    const code = sql.split("\n").map((z) => z.trim()).filter((z) => z !== "");
    assert.equal(code[0], "set search_path = public, extensions;");
    assert.equal(code.at(-1), "select harden_definer_functions();");
    assert.deepEqual([...funktionen(sql).keys()], ["session_partner_org", ...VIER]);
    assert.ok(!migration().includes("$$;;"), "kein doppeltes Semikolon hinter einem Rumpf");
    // Keine Spalte, keine Tabelle, kein Recht, keine Zeile, kein Trigger: ableiten statt speichern — außerhalb der Rümpfe (die vier Funktionen schreiben wie bisher).
    const aussen = sql.replace(/\$\$[\s\S]*?\$\$/g, () => "<RUMPF>");
    assert.doesNotMatch(aussen, /\b(alter table|create table|drop |insert into|update |delete from|create trigger|create policy|grant )/i);
    // Das einzige Recht, das die Datei anfasst, ist der Entzug am Helfer.
    assert.equal([...aussen.matchAll(/\brevoke\b/gi)].length, 1);
    // LEAD-063 (Änderungsmail) bleibt unberührt (Plan 10.10.) — `partner_add_speaker` mailt weiter wie bisher (Verwaltet-Fall), das ist nicht LEAD-063.
    assert.doesNotMatch(sql, /session_change_notify/);
  });

  it("der Helfer: erst die eigene Organisation, sonst die der gebrandeten Bühne des Slots, sonst NULL — Definer, stable, nur für den Eigentümer", () => {
    const sql = sqlCode(migration());
    const h = funktionen(sql).get("session_partner_org") ?? "";
    assert.match(h, /returns uuid\s+language sql stable security definer set search_path = public, extensions as \$\$/);
    // Reihenfolge im coalesce: `se.partner_org_id` zuerst (eine Session mit eigener Organisation bleibt bei dieser, auch auf der Bühne einer anderen).
    assert.match(h, /coalesce\(\s*se\.partner_org_id,\s*\(select st\.partner_org_id from slot sl join stage st on st\.id = sl\.stage_id\s+where sl\.id = se\.slot_id and st\.kind = 'branded'\)\)/);
    assert.match(h, /from session se\s+where se\.id = p_session_id\s+\$\$/);
    assert.match(sql, /revoke execute on function session_partner_org\(uuid\) from public, anon, authenticated;/);
    // Der Helfer steht vor seinem ersten Einsatz.
    assert.ok(sql.indexOf("create or replace function session_partner_org") < sql.indexOf("create or replace function partner_format_sessions"));
  });

  it("die vier Funktionen nehmen den Helfer — und lesen `partner_org_id` der Session nicht mehr selbst", () => {
    const f = funktionen(sqlCode(migration()));
    for (const n of VIER) {
      const t = f.get(n) ?? "";
      assert.match(t, /session_partner_org\(/, `${n}: nimmt den Helfer`);
      assert.doesNotMatch(t, /partner_org_id/, `${n}: keine eigene Ableitung mehr`);
    }
    // Die Einsätze im Einzelnen.
    assert.match(f.get("partner_format_sessions") ?? "", /where session_partner_org\(se\.id\) = p_org_id/);
    assert.match(f.get("partner_update_session") ?? "", /v_org := session_partner_org\(p_session_id\);\s+if v_org is null or not partner_can_edit\(v_org\)/);
    assert.match(f.get("partner_add_speaker") ?? "", /v_org := session_partner_org\(p_session_id\);\s+if v_org is null or not partner_can_edit\(v_org\)/);
    assert.match(f.get("partner_speakers") ?? "", /left join session se on se\.id = ss\.session_id and session_partner_org\(se\.id\) = p_org_id/);
  });

  it("Eingriff gegen die Live-Fassung: genau die genannten Zeilen — solange die Migration ein Vorschlag ist", (t) => {
    if (!istVorschlag(NAME)) return t.skip("angewendet: der Snapshot ist maßgeblich");
    const neu = funktionen(migration());
    const erwartet: Record<string, { weg: RegExp[]; dazu: RegExp[] }> = {
      partner_format_sessions: { weg: [/^where se\.partner_org_id = p_org_id$/], dazu: [/^-- PART-148: auch eine Session ohne Organisation/, /^where session_partner_org\(se\.id\) = p_org_id$/] },
      partner_update_session: { weg: [/^v_org := v_se\.partner_org_id;$/], dazu: [/^-- PART-148: die Organisation der Session/, /^v_org := session_partner_org\(p_session_id\);$/] },
      partner_add_speaker: {
        weg: [/^-- PART-138: die Organisation, für die der Partner hier eintragen darf/, /^-- angelegt\), die Organisation, die diese Bühne gebrandet hat\./, /^v_org := v_se\.partner_org_id;$/, /^if v_org is null then$/, /^select st\.partner_org_id into v_org from slot sl join stage st on st\.id = sl\.stage_id$/, /^where sl\.id = v_se\.slot_id and st\.kind = 'branded';$/, /^end if;$/],
        dazu: [/^-- PART-138\/148: die Organisation, für die der Partner hier eintragen darf/, /^-- angelegt\), die Organisation, die diese Bühne gebrandet hat \(Helfer/, /^v_org := session_partner_org\(p_session_id\);$/],
      },
      partner_speakers: {
        weg: [/^-- PART-138: auch eine Session ohne Organisation/, /^left join session se on se\.id = ss\.session_id$/, /^and \(se\.partner_org_id = p_org_id$/, /^or \(se\.partner_org_id is null$/, /^and exists \(select 1 from slot sl join stage st on st\.id = sl\.stage_id$/, /^where sl\.id = se\.slot_id and st\.kind = 'branded' and st\.partner_org_id = p_org_id\)\)\)$/],
        dazu: [/^-- PART-138\/148: auch eine Session ohne Organisation/, /^left join session se on se\.id = ss\.session_id and session_partner_org\(se\.id\) = p_org_id$/],
      },
    };
    for (const n of VIER) {
      const live = snapshotText(n).replace(/;\s*$/, "");
      const mig = (neu.get(n) ?? "").replace(/;\s*$/, "");
      const weg = zeilenNur(live, mig);
      const dazu = zeilenNur(mig, live);
      const e = erwartet[n];
      assert.equal(weg.length, e.weg.length, `${n}: verschwindende Zeilen: ${JSON.stringify(weg)}`);
      assert.equal(dazu.length, e.dazu.length, `${n}: neue Zeilen: ${JSON.stringify(dazu)}`);
      for (const z of weg) assert.ok(e.weg.some((r) => r.test(z)), `${n}: unerwartet verschwunden: ${z}`);
      for (const z of dazu) assert.ok(e.dazu.some((r) => r.test(z)), `${n}: unerwartet dazugekommen: ${z}`);
    }
  });
});

/**
 * Jede `partner_*`-Funktion, die `partner_org_id` liest, aber den Helfer nicht nimmt, steht hier — mit dem Grund. Neue Funktionen müssen sich entscheiden: Helfer nehmen oder
 * hier eintragen (und begründen). PART-148 (c) holt `partner_request_publish` und `partner_withdraw_publish` aus dieser Liste.
 */
const AUSNAHMEN: Record<string, string> = {
  partner_assign_stage_guest: "Gäste der Standbühne (PART-081): vergleicht Bühne, Gastgeber und Session bewusst mit der Organisation des Gastes",
  partner_create_session: "legt die Session an: `partner_org_id` wird geschrieben, die Bühne muss der Organisation gehören",
  partner_created_speakers: "`partner_org_id` ist hier eine Spalte des Speaker-Profils in der Rückgabe, keine Session",
  partner_copy_table_questions: "Interview Tables: die Gespräche tragen ihre Organisation selbst (der Partner legt sie an), der Vergleich Quelle ↔ Ziel ist Absicht",
  partner_delete_session: "löschen darf nur, wer die Session selbst angelegt hat (eigene Organisation); eine vom Team angelegte löscht der Partner nicht",
  partner_entitlement: "Zählung gegen das Kontingent: nur Sessions, die der Partner selbst angelegt hat, zählen",
  partner_overview: "Bühnenbesitz (`stage.partner_org_id`), keine Session",
  partner_remove_stage_guest: "Gäste der Standbühne, wie partner_assign_stage_guest",
  partner_request_question: "eigene Fragen an Format-Sessions des Partners (Masterclass, Interview Table, Side-Event); an der gebrandeten Bühne gibt es keine Bewerbungsfragen",
  partner_request_publish: "PART-148 (c): `kind in ('booth','branded')` mit dem Helfer folgt in einem eigenen PR",
  partner_sessions_pending: "Liste der Freigabeanfragen für das Team: nur Sessions mit eigener Organisation fragen an",
  partner_set_session_questions: "Katalogfragen der Format-Sessions des Partners, wie partner_request_question",
  partner_stage_guests: "Gäste der Standbühne (PART-081)",
  partner_window_binds: "Bühnenbesitz (`stage.partner_org_id`), keine Session",
  partner_withdraw_publish: "PART-148 (c), wie partner_request_publish",
};

/** Die Fassung, die gilt: die Live-Fassung im Snapshot, überdeckt von den Funktionen der Migration (solange sie ein Vorschlag ist; danach steht sie im Snapshot). */
function geltende(): Map<string, string> {
  const m = new Map<string, string>();
  for (const datei of readdirSync(SNAPSHOT)) {
    if (!/^partner_.*\.sql$/.test(datei)) continue;
    m.set(datei.replace(/\.sql$/, ""), readFileSync(`${SNAPSHOT}/${datei}`, "utf8"));
  }
  for (const [n, t] of funktionen(migration())) if (n.startsWith("partner_")) m.set(n, t);
  return m;
}

describe("PART-148 B: Wächter über alle partner_*-Funktionen", () => {
  it("wer `partner_org_id` liest, nimmt den Helfer (und liest die der Session nicht selbst) oder steht mit Grund in der Ausnahmeliste", () => {
    const f = geltende();
    assert.ok(f.size > 40, `zu wenige partner_*-Funktionen gefunden (${f.size})`);
    const ohneEntscheidung: string[] = [];
    for (const [name, text] of f) {
      const code = sqlCode(text);
      if (!/\bpartner_org_id\b/.test(code) && !/session_partner_org\(/.test(code)) continue;
      if (/session_partner_org\(/.test(code)) {
        // Wer den Helfer nimmt, liest die Organisation der Session nicht zusätzlich selbst (Bühne `st.` ist etwas anderes).
        assert.doesNotMatch(code, /\b(se|v_se|s|sess)\.partner_org_id\b/, `${name}: Helfer und eigene Ableitung nebeneinander`);
        continue;
      }
      if (!(name in AUSNAHMEN)) ohneEntscheidung.push(name);
    }
    assert.deepEqual(ohneEntscheidung, [], `Funktionen, die partner_org_id lesen, ohne den Helfer zu nehmen und ohne Ausnahme: ${ohneEntscheidung.join(", ")}`);
  });

  it("die Ausnahmeliste ist ehrlich: jeder Eintrag gibt es, liest `partner_org_id`, nimmt den Helfer nicht — und hat einen Grund", () => {
    const f = geltende();
    for (const [name, grund] of Object.entries(AUSNAHMEN)) {
      const text = f.get(name);
      assert.ok(text, `${name}: gibt es nicht mehr — Eintrag streichen`);
      const code = sqlCode(text);
      assert.match(code, /\bpartner_org_id\b/, `${name}: liest partner_org_id nicht mehr — Eintrag streichen`);
      assert.doesNotMatch(code, /session_partner_org\(/, `${name}: nimmt den Helfer inzwischen — Eintrag streichen`);
      assert.ok(grund.trim().length > 20, `${name}: Grund fehlt`);
    }
  });

  it("die vier Funktionen der Migration stehen im Wächter auf der Seite des Helfers (nicht in der Ausnahmeliste)", () => {
    for (const n of VIER) assert.ok(!(n in AUSNAHMEN), `${n} gehört nicht in die Ausnahmeliste`);
  });
});

describe("PART-148 B: Test und Doku", () => {
  it("der SQL-Test steht im README der Tests, mit Bezug auf PART-148", () => {
    const readme = readFileSync("supabase/tests/README.md", "utf8");
    const zeile = readme.split("\n").find((z) => z.includes("`v6_partner_session_org.sql`")) ?? "";
    assert.match(zeile, /PART-148/);
    assert.match(zeile, /session_partner_org/);
    const test = readFileSync("supabase/tests/v6_partner_session_org.sql", "utf8");
    assert.match(test, /\brollback;\s*$/);
    assert.match(test, /99_auswertung/);
  });
});
