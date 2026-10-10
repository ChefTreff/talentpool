import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { leseWiederGeoeffnet, SCHRITTE, schrittStaende } from "@/lib/speaker/checkliste";
import { toRpcFailure } from "@/lib/rpc-error";
import { istVorschlag, migrationText } from "@/tests/migration-datei";

/**
 * SPK-082 (Feedbackrunde Konrad und Paulina 05.10.2026): ein Punkt der Speaker-Checkliste, den das Portal selbst als erledigt kennt (das Foto liegt, die
 * Einwilligung steht …), lässt sich **wieder öffnen** und danach wieder abhaken. Gespeichert wird die Ausnahme („wieder geöffnet“), nicht der Haken — die abgeleitete
 * Wahrheit (`speaker_next_steps`) bleibt unberührt, und von Hand umlegen lässt sich nur, was abgeleitet erledigt ist („abgehakt, aber kein Foto da“, Paulina). Dazu das
 * Rechte-Angleich an `my_speaker_tasks`/`set_speaker_task_tick` (Kontakte mit Zugang) und: ohne Session fehlen „Inhalt der Session“ und „Präsentation“ in der Liste.
 * Die Datenbank-Seite belegt `supabase/tests/v6_speaker_checkliste.sql` (16 Erwartungen mit Rollenwechsel). Hier steht, was sich ohne Datenbank festhalten lässt:
 * die Migration selbst (Muster, Härtung, Rechte), die reine Zustandsrechnung der Liste — ausgeführt, nicht nur gelesen — und die Verdrahtung der Oberfläche.
 * Der Test vergleicht nichts mit dem lebenden Snapshot, solange die Migration nicht unter `vorschlag/` liegt (db-konventionen, Nachtrag 09.10.2026).
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const sql = () => migrationText("v6_speaker_checkliste");
const code = (text: string) => text.replace(/--[^\n]*/g, "");

/** Der Text einer Funktion der Migration: von `create or replace function <name>(` bis zum schließenden `end $$;`. */
function funktion(text: string, name: string): string {
  const von = text.indexOf(`create or replace function ${name}(`);
  assert.ok(von >= 0, `${name} fehlt`);
  const ende = text.indexOf("\nend $$;", von);
  assert.ok(ende > von, `${name}: kein Ende gefunden`);
  return text.slice(von, ende + "\nend $$;".length);
}

const SIEBEN = "'profile', 'photo', 'consents', 'session', 'session_content', 'presentation', 'ticket'";

describe("SPK-082: die Migration `v6_speaker_checkliste` — Tabelle", () => {
  it("eine Zeile je Profil und Schlüssel; cascade am Profil, der Verweis auf die Person bleibt leer, wenn sie fällt; RLS an, keine Policy, keine Grants", () => {
    const c = code(sql());
    const tabelle = c.slice(c.indexOf("create table if not exists speaker_step_reopen"), c.indexOf("comment on table speaker_step_reopen"));
    assert.match(tabelle, /profile_id\s+uuid not null references speaker_profile\(id\) on delete cascade,/);
    assert.match(tabelle, /step_key\s+text not null,/);
    assert.match(tabelle, /reopened_by uuid references person\(id\) on delete set null,/);
    assert.match(tabelle, /reopened_at timestamptz not null default now\(\),/);
    assert.match(tabelle, /primary key \(profile_id, step_key\),/);
    assert.match(c, /alter table speaker_step_reopen enable row level security;/);
    assert.match(c, /revoke all on speaker_step_reopen from anon, authenticated;/);
    assert.doesNotMatch(c, /create policy/i);
    assert.doesNotMatch(c, /grant\s+[^;]*\bon\s+(table\s+)?speaker_step_reopen\b/i);
  });

  it("die Schlüsselprüfung der Tabelle, die der Funktion und `SCHRITTE` der Oberfläche sind dieselben sieben", () => {
    const c = code(sql());
    const tabelle = c.match(/check \(step_key in \(([^)]*)\)\)/);
    assert.ok(tabelle, "check der Tabelle fehlt");
    const funk = funktion(c, "set_speaker_step_reopened").match(/p_step_key not in \(([^)]*)\)/);
    assert.ok(funk, "Schlüsselprüfung der Funktion fehlt");
    const liste = (roh: string) => roh.split(",").map((k) => k.trim().replace(/'/g, ""));
    assert.deepEqual(liste(tabelle[1]), [...SCHRITTE]);
    assert.deepEqual(liste(funk[1]), [...SCHRITTE]);
    assert.equal(tabelle[1].trim(), SIEBEN);
  });
});

describe("SPK-082: die Migration — Lesen und Schreiben", () => {
  it("vier Funktionen (zwei neue, zwei angeglichene), am Ende die Härtung; neue Funktionen nur für authenticated", () => {
    const c = code(sql());
    const namen = [...c.matchAll(/create or replace function (\w+)\(/g)].map((m) => m[1]);
    assert.deepEqual(namen, ["my_speaker_step_reopened", "set_speaker_step_reopened", "my_speaker_tasks", "set_speaker_task_tick"]);
    assert.match(c.trimEnd(), /select harden_definer_functions\(\);$/);
    assert.match(c, /revoke all on function my_speaker_step_reopened\(uuid\) from public, anon;\s+grant execute on function my_speaker_step_reopened\(uuid\) to authenticated;/);
    assert.match(c, /revoke all on function set_speaker_step_reopened\(text, boolean, uuid\) from public, anon;\s+grant execute on function set_speaker_step_reopened\(text, boolean, uuid\) to authenticated;/);
    assert.doesNotMatch(c, /grant execute[^;]*\bto\b[^;]*\banon\b/i);
  });

  it("Lesen: eigenes Profil, Assistenz oder Team — NULL-sicher; liefert nur Schlüssel, die abgeleitet erledigt sind (`= 'true'`), und nie NULL", () => {
    const f = code(funktion(sql(), "my_speaker_step_reopened"));
    assert.match(f, /returns text\[\]\s+language plpgsql stable security definer set search_path = public, extensions/);
    assert.match(f, /if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;/);
    assert.match(f, /where id = coalesce\(p_profile_id, my_speaker_profile_id\(null\)\);/);
    assert.match(f, /if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;/);
    assert.match(f, /if not coalesce\(\(v_sp\.person_id = v_me or is_speaker_assistant\(v_sp\.id, v_me\)\s+or can_manage_speaker\(v_sp\.id\)\), false\) then\s+raise exception 'not allowed' using errcode = '42501';/);
    assert.match(f, /v_steps := speaker_next_steps\(v_sp\.id\);/);
    assert.match(f, /where r\.profile_id = v_sp\.id\s+and \(v_steps ->> r\.step_key\) = 'true'\), '\{\}'::text\[\]\);/);
    assert.match(f, /return coalesce\(\(\s+select array_agg\(r\.step_key order by r\.step_key\)/);
    assert.doesNotMatch(f, /\b(insert|update|delete)\b\s+\w/i, "Lesen schreibt nichts (STABLE)");
  });

  it("Schreiben: nur die Speakerin und ihre Assistenz — nicht das Team; Rechte vor der Eingabeprüfung; Öffnen nur bei abgeleitet Erledigtem, Abhaken löscht (idempotent), kein Audit", () => {
    const f = code(funktion(sql(), "set_speaker_step_reopened"));
    assert.match(f, /language plpgsql security definer set search_path = public, extensions/);
    assert.match(f, /if not coalesce\(\(v_sp\.person_id = v_me or is_speaker_assistant\(v_sp\.id, v_me\)\), false\) then\s+raise exception 'not allowed' using errcode = '42501';/);
    assert.doesNotMatch(f, /can_manage_speaker/, "das Team sagt nicht für die Speakerin, was sie erledigt hat");
    // Reihenfolge: Anmeldung, Profil, Recht, Schlüssel, dann erst Öffnen/Abhaken
    const stellen = ["'not authenticated'", "'speaker_not_found'", "'not allowed'", "'invalid_step'", "'step_not_done'", "insert into speaker_step_reopen", "delete from speaker_step_reopen"].map((s) => f.indexOf(s));
    assert.ok(stellen.every((i) => i > 0), "eine Stelle fehlt");
    assert.deepEqual([...stellen].sort((a, b) => a - b), stellen, "Reihenfolge der Prüfungen");
    assert.match(f, /raise exception 'invalid_step' using errcode = '22023', detail = coalesce\(p_step_key, 'null'\);/);
    assert.match(f, /if p_step_key is null\s+or p_step_key not in \(/);
    assert.match(f, /if p_reopened is true then\s+if coalesce\(speaker_next_steps\(v_sp\.id\) ->> p_step_key, ''\) <> 'true' then\s+raise exception 'step_not_done' using errcode = 'P0001', detail = p_step_key;/);
    assert.match(f, /values \(v_sp\.id, p_step_key, v_me\)\s+on conflict \(profile_id, step_key\) do nothing;/);
    assert.match(f, /delete from speaker_step_reopen where profile_id = v_sp\.id and step_key = p_step_key;/);
    assert.doesNotMatch(f, /log_audit\(/, "Selbstauskunft, kein Audit (Plan 09.10.)");
  });

  it("Rechte-Angleich: `my_speaker_tasks` und `set_speaker_task_tick` fragen `is_speaker_assistant` statt `assistant_person_id`; sonst unverändert", () => {
    const c = code(sql());
    for (const name of ["my_speaker_tasks", "set_speaker_task_tick"]) {
      const f = funktion(c, name);
      assert.match(f, /is_speaker_assistant\(v_sp\.id, v_me\)/, `${name}: Assistenz über is_speaker_assistant`);
      assert.doesNotMatch(f, /assistant_person_id/, `${name}: nicht mehr die alte Spalte`);
    }
    // Lesen darf weiter das Team, Abhaken nicht
    assert.match(funktion(c, "my_speaker_tasks"), /or can_manage_speaker\(v_sp\.id\)/);
    assert.doesNotMatch(funktion(c, "set_speaker_task_tick"), /can_manage_speaker/);
  });

  it("gegen die Live-Fassung (Snapshot) unterscheidet sich je angeglichener Funktion genau die eine Zeile — nur, solange die Migration ein Vorschlag ist", { skip: !istVorschlag("v6_speaker_checkliste") }, () => {
    for (const name of ["my_speaker_tasks", "set_speaker_task_tick"]) {
      const live = quelle(`supabase/snapshot/functions/${name}.sql`).trim();
      const neu = funktion(sql(), name).trim();
      const erwartet = live.replace("v_sp.assistant_person_id = v_me", "is_speaker_assistant(v_sp.id, v_me)");
      assert.notEqual(erwartet, live, `${name}: die alte Zeile steht im Snapshot`);
      assert.equal(neu, erwartet, `${name}: mehr als die eine Zeile geändert`);
    }
  });
});

describe("SPK-082: die Zustände der Checkliste (ausgeführt)", () => {
  const alle = { profile: true, photo: true, consents: true, session: true, session_content: true, presentation: true, ticket: true, open: [] as string[] };

  it("alles erledigt: alle sieben Punkte, alle erledigt und schaltbar, keiner wieder geöffnet", () => {
    const s = schrittStaende(alle, []);
    assert.deepEqual(s.map((x) => x.key), [...SCHRITTE]);
    assert.ok(s.every((x) => x.erledigt && x.abgeleitetErledigt && x.schaltbar && !x.wiederGeoeffnet));
  });

  it("ohne Session fehlen „Inhalt der Session“ und „Präsentation“ ganz (nicht anwendbar, `null`) — die Zahl im Band rechnet mit fünf Punkten", () => {
    const s = schrittStaende({ profile: true, photo: true, consents: true, session: false, session_content: null, presentation: null, ticket: true, open: ["session"] }, []);
    assert.deepEqual(s.map((x) => x.key), ["profile", "photo", "consents", "session", "ticket"]);
    const session = s.find((x) => x.key === "session");
    assert.ok(session && !session.erledigt && !session.schaltbar, "der offene Punkt ist nicht von Hand abhakbar");
  });

  it("mit Session, aber ohne Inhalt: der Punkt steht offen in der Liste und lässt sich nicht von Hand abhaken", () => {
    const s = schrittStaende({ ...alle, session_content: false, presentation: false, open: ["session_content", "presentation"] }, []);
    assert.equal(s.length, 7);
    for (const key of ["session_content", "presentation"]) {
      const x = s.find((e) => e.key === key);
      assert.ok(x && !x.erledigt && !x.abgeleitetErledigt && !x.schaltbar && !x.wiederGeoeffnet, key);
    }
  });

  it("wieder geöffnet: der Punkt steht offen, ist aber schaltbar (wieder abhaken) und trägt die Markierung; die übrigen bleiben erledigt", () => {
    const s = schrittStaende(alle, ["photo"]);
    const foto = s.find((x) => x.key === "photo");
    assert.ok(foto);
    assert.deepEqual({ ...foto }, { key: "photo", erledigt: false, abgeleitetErledigt: true, wiederGeoeffnet: true, schaltbar: true });
    assert.equal(s.filter((x) => x.erledigt).length, 6);
  });

  it("eine Markierung zu einem Punkt, den das Portal wieder als offen kennt (Foto gelöscht), zählt nicht: offen, nicht schaltbar, nicht „wieder geöffnet“", () => {
    const s = schrittStaende({ ...alle, photo: false, open: ["photo"] }, ["photo"]);
    const foto = s.find((x) => x.key === "photo");
    assert.ok(foto);
    assert.deepEqual({ ...foto }, { key: "photo", erledigt: false, abgeleitetErledigt: false, wiederGeoeffnet: false, schaltbar: false });
  });

  it("eine Markierung zu einem nicht anwendbaren Punkt (ohne Session) bringt ihn nicht zurück in die Liste", () => {
    const s = schrittStaende({ ...alle, session: false, session_content: null, presentation: null, open: ["session"] }, ["session_content", "presentation"]);
    assert.deepEqual(s.map((x) => x.key), ["profile", "photo", "consents", "session", "ticket"]);
  });

  it("unbekannte Schlüssel in der Liste ändern nichts; fehlende Angaben (kein `next_steps`, keine Liste) ergeben die Liste ohne Ausnahmen", () => {
    assert.equal(schrittStaende(alle, ["gibt_es_nicht"]).filter((x) => x.wiederGeoeffnet).length, 0);
    for (const next of [null, undefined]) {
      const s = schrittStaende(next, null);
      assert.equal(s.length, 7);
      assert.ok(s.every((x) => x.erledigt && !x.wiederGeoeffnet));
    }
  });

  it("die Antwort der RPC: nur eine Liste von Texten zählt, alles andere ist die leere Liste", () => {
    assert.deepEqual(leseWiederGeoeffnet(["photo", "ticket"]), ["photo", "ticket"]);
    assert.deepEqual(leseWiederGeoeffnet(["photo", 3, null, "ticket"]), ["photo", "ticket"]);
    for (const roh of [null, undefined, "photo", {}, 7]) assert.deepEqual(leseWiederGeoeffnet(roh), []);
  });
});

describe("SPK-082: die Oberfläche", () => {
  it("die Aktion ruft `set_speaker_step_reopened` mit Schlüssel und Wunsch, hinter `requireArea`, und lädt die Seiten neu", () => {
    const a = quelle("app/(speaker)/speaker/actions.ts");
    const f = a.slice(a.indexOf("export async function setSpeakerStepReopened("));
    const rumpf = f.slice(0, f.indexOf("\n}\n"));
    assert.match(rumpf, /const supabase = await client\(\);/);
    assert.match(rumpf, /supabase\.rpc\("set_speaker_step_reopened", \{\s+p_step_key: stepKey,\s+p_reopened: reopened,\s+\}\)/);
    assert.match(rumpf, /if \(error\) return fail\(error\);\s+refresh\(\);/);
    assert.doesNotMatch(rumpf, /p_profile_id/, "das gewählte Profil (SPK-071) gilt, wie bei den Aufgaben");
  });

  it("der Schalter hat zwei Ziele: Aufgabe (Zustand, `aria-pressed`) oder Punkt (Aktion); ein erledigter Punkt wird mit dem Klick geöffnet, ein offener wieder abgehakt", () => {
    const h = quelle("app/(speaker)/speaker/HakenSchalter.tsx");
    assert.match(h, /& \(\{ taskId: string \} \| \{ stepKey: string \}\)/);
    assert.match(h, /"stepKey" in props \? await setSpeakerStepReopened\(props\.stepKey, done\) : await setSpeakerTaskTick\(props\.taskId, !done\)/);
    assert.match(h, /aria-pressed=\{istPunkt \? undefined : done\}/);
    assert.match(h, /if \(!res\.ok\) toast\("error", fehler\);\s+router\.refresh\(\);/);
  });

  it("die Liste zeigt den Schalter nur an Punkten mit `schrittKey`, die Aktion als Beschriftung, den Hinweis nur bei „wieder geöffnet“", () => {
    const c = quelle("app/(speaker)/speaker/Checkliste.tsx");
    assert.match(c, /a\.schrittKey \? \(\s+<HakenSchalter\s+stepKey=\{a\.schrittKey\}\s+done=\{a\.erledigt\}\s+label=\{`\$\{a\.titel\} — \$\{a\.erledigt \? t\.reopen : t\.tickAgain\}`\}/);
    assert.match(c, /\{a\.wiederGeoeffnet && <p className="ct-help">\{t\.reopenedHint\}<\/p>\}/);
    // ohne `schrittKey` (noch offen) bleibt es der Ring ohne Klick — kein Haken, bevor die Arbeit da ist
    assert.match(c, /\) : \(\s+<CheckMark done=\{a\.erledigt\} label=\{a\.erledigt \? t\.done : t\.open\} \/>/);
  });

  it("die Startseite lädt die geöffneten Punkte mit der ersten Runde, rechnet mit `schrittStaende` (nicht mehr mit `open.includes`) und reicht die Texte weiter", () => {
    const p = quelle("app/(speaker)/speaker/page.tsx");
    assert.match(p, /supabase\.rpc\("my_speaker_step_reopened"\)/);
    assert.match(p, /const wiederGeoeffnet = leseWiederGeoeffnet\(geoeffnetRows\);/);
    assert.match(p, /schrittStaende\(profile\.next_steps, wiederGeoeffnet\)\.map\(\(s\) => \{/);
    assert.match(p, /erledigt: s\.erledigt,\s+schrittKey: s\.schaltbar \? s\.key : undefined,\s+wiederGeoeffnet: s\.wiederGeoeffnet,/);
    assert.doesNotMatch(p, /open\.includes\(/);
    assert.match(p, /reopen: t\.speaker\.checkReopen,\s+tickAgain: t\.speaker\.checkTickAgain,\s+reopenedHint: t\.speaker\.checkReopenedHint,/);
    // die sieben Texte der Liste tragen dieselben Schlüssel wie die Zustandsrechnung
    const steps = p.slice(p.indexOf("const STEPS: Record"), p.indexOf("// --- Checkliste (SPK-024)"));
    assert.deepEqual([...steps.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]).slice(0, 7), [...SCHRITTE]);
  });

  it("jeder der sieben Punkte hat ein Ziel (`STEP_HREF`) — auch die geöffneten führen dorthin, wo man den Punkt erledigt", () => {
    const t = quelle("app/(speaker)/speaker/types.ts");
    const href = t.slice(t.indexOf("export const STEP_HREF"), t.indexOf("/** Der Bucket aller Speaker-Dateien"));
    for (const k of SCHRITTE) assert.match(href, new RegExp(`\\b${k}:`), k);
  });

  it("Wörterbücher DE und EN: die drei Texte der Liste und die beiden Fehlertexte; die Fehlerschlüssel kommen in der Oberfläche an", () => {
    for (const lang of ["de", "en"]) {
      const d = JSON.parse(quelle(`lib/i18n/${lang}.json`)) as { speaker: Record<string, string>; rpc: Record<string, string> };
      for (const k of ["checkReopen", "checkTickAgain", "checkReopenedHint"]) assert.ok((d.speaker[k] ?? "").length > 3, `${lang}.speaker.${k}`);
      for (const k of ["invalid_step", "step_not_done"]) assert.ok((d.rpc[k] ?? "").length > 10, `${lang}.rpc.${k}`);
    }
    assert.equal(toRpcFailure({ code: "P0001", message: "step_not_done", details: "photo" } as never).key, "step_not_done");
    assert.equal(toRpcFailure({ code: "22023", message: "invalid_step", details: "bogus" } as never).key, "invalid_step");
  });
});

describe("SPK-082: der DB-Test hält die Regeln fest", () => {
  const test = () => quelle("supabase/tests/v6_speaker_checkliste.sql");

  it("16 Erwartungen im Muster `t_erw`; Wegwerf-Konten für alle Rollen, Rollenwechsel auch für `anon`/`authenticated`", () => {
    const t = test();
    const erw = t.slice(t.indexOf("insert into t_erw values"), t.indexOf("-- Hilfen"));
    assert.deepEqual(
      [...erw.matchAll(/^\s+\('(\d\d_[a-z_]+)', /gm)].map((m) => m[1]),
      [
        "00_form",
        "01_tabelle",
        "02_vor_erledigung",
        "03_aufbau",
        "04_oeffnen_abhaken",
        "05_wahrheit_unberuehrt",
        "06_randlage_foto",
        "07_randlage_session",
        "08_lesen",
        "09_schreiben",
        "10_eingabe",
        "11_profil",
        "12_anmeldung",
        "13_aufgaben",
        "14_loeschen",
        "15_kein_audit",
      ],
    );
    for (const rolle of ["A", "B", "C", "D", "E", "F", "G", "H", "I"]) assert.match(t, new RegExp(`v_${rolle.toLowerCase()} := pg_temp\\.person\\('ZZCheck ${rolle}'\\)`), `Konto ${rolle}`);
    assert.match(t, /insert into auth\.users/);
    assert.match(t, /set local role authenticated/);
    assert.match(t, /set local role anon/);
    assert.match(t, /'area_lead_speaker'/);
  });

  it("die Fixtures decken ab: Kontakt mit und ohne Zugang, Profil ohne Assistenz (NULL-sicher), Zeilen eines anderen Profils, zweites Öffnen mit zurückgesetztem Urheber", () => {
    const t = test();
    assert.match(t, /'assistant', v_c, 'zz-spk082-c@example\.org', true/);
    assert.match(t, /'office', v_d, 'ZZ Office', false/);
    assert.match(t, /v_p3 := pg_temp\.profil\(v_h, v_ed, null\)/);
    assert.match(t, /insert into speaker_step_reopen \(profile_id, step_key, reopened_by\) values \(v_p3, 'photo', v_h\), \(v_p3, 'ticket', v_h\)/);
    assert.match(t, /set reopened_at = '2020-01-01 00:00\+00', reopened_by = v_g/);
  });

  it("README der DB-Tests: eine Zeile für `v6_speaker_checkliste.sql`", () => {
    const zeile = quelle("supabase/tests/README.md").split("\n").find((l) => l.startsWith("| `v6_speaker_checkliste.sql` |"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /SPK-082/);
    assert.match(zeile, /16 Erwartungen/);
  });
});

describe("SPK-082: Doku", () => {
  it("Testleitfaden: eine Zeile zur Checkliste auf `/speaker` (Wieder öffnen, Abhaken, noch offener Punkt ohne Haken, ohne Session ohne Inhalt/Präsentation)", () => {
    const zeile = quelle("docs/team-testleitfaden.md").split("\n").find((l) => l.includes("(SPK-082"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /Wieder öffnen/);
    assert.match(zeile, /Als erledigt abhaken/);
    assert.match(zeile, /Inhalt der Session/);
  });

  it("Backlog: SPK-082 trägt die PR-Nummer und nennt die Migration und die Rechteänderung", () => {
    const zeile = quelle("docs/feedback/speaker.md").split("\n").find((l) => l.startsWith("| SPK-082 |"));
    assert.ok(zeile && /\| P1 \| (geplant|gebaut|abgenommen) #\d+/.test(zeile), "SPK-082 trägt keine PR-Nummer");
    assert.match(zeile, /Migration enthalten/);
    assert.match(zeile, /is_speaker_assistant/);
  });
});
