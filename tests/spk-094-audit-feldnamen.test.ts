import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

/**
 * SPK-094 (Befund aus #452, Plan 09.10.2026): ändert die **Assistenz** ein Speaker-Profil, protokolliert `update_my_speaker_profile` nur die Namen der
 * geänderten Felder und die `person_id` der Speakerin — nie einen Wert (Telefonnummer, Namen und Adressen standen im Klartext im Audit); ohne Änderung kein
 * Eintrag; Bestandseinträge bleiben. Die Datenbank-Seite belegt `supabase/tests/v6_speaker_audit_feldnamen.sql` (9 Erwartungen, echte Claims, die Assistenz
 * gegen die Speakerin selbst); hier steht, was sich ohne Datenbank festhalten lässt.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const sql = () => migrationText("v6_speaker_audit_feldnamen");
const code = (text: string) => text.replace(/--[^\n]*/g, "");

/** Der Text einer Funktion der Migration: von `create or replace function <name>(` bis zum nächsten `end $$;`. */
function funktion(text: string, name: string): string {
  const von = text.indexOf(`create or replace function ${name}(`);
  assert.ok(von >= 0, `${name} fehlt`);
  const ende = text.indexOf("end $$;", von);
  assert.ok(ende >= 0, `${name}: kein Ende gefunden`);
  return text.slice(von, ende);
}

/** Der Block, den die Funktion bis SPK-094 hatte: der ganze Eingabeblock ins Audit. */
const ALTES_AUDIT =
  "  if v_sp.person_id <> v_me then\n    perform log_audit('speaker.assistant_update', 'speaker_profile', v_sp.id::text, null, p_data - 'id');\n  end if;\n";

/**
 * Macht SPK-094 rückgängig — auf der Migration wie auf dem Snapshot: nach dem Anwenden steht die neue Fassung dort, und der Vergleich „bis auf die
 * Audit-Zeilen gleich“ muss dann trotzdem halten.
 */
const OHNE_SPK094 = (text: string) =>
  text
    .replace("  v_alt_p person%rowtype; v_felder text[];\n", () => "")
    .replace(/  -- SPK-094: Aendert die Assistenz[\s\S]*?  end if;\n\n(?=  update person set)/, () => "")
    .replace(/  -- SPK-094: nur die Namen[\s\S]*?\n  end if;\n(?=  return v_sp\.id;)/, () => ALTES_AUDIT);

describe("SPK-094: die Migration `v6_speaker_audit_feldnamen`", () => {
  it("eine bestehende Funktion — keine Tabelle, keine Spalte, keine neue Funktion; am Ende die Härtung", () => {
    const c = code(sql());
    const namen = [...c.matchAll(/create or replace function (\w+)\(/g)].map((m) => m[1]);
    assert.deepEqual(namen, ["update_my_speaker_profile"]);
    assert.doesNotMatch(c, /\b(create|alter|drop) table\b|\badd column\b|\bcreate (trigger|index|policy)\b/i);
    assert.match(c.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("Bestandseinträge bleiben: die Migration schreibt nicht an `audit_log`", () => {
    assert.doesNotMatch(code(sql()), /\b(insert\s+into|update|delete\s+from|truncate)\s+audit_log\b/i);
  });

  it("die Funktion ist bis auf die Audit-Zeilen der Snapshot — nichts anderes ist verschwunden (vor wie nach dem Anwenden)", () => {
    const neu = OHNE_SPK094(funktion(sql(), "update_my_speaker_profile")).trimEnd();
    const alt = OHNE_SPK094(quelle("supabase/snapshot/functions/update_my_speaker_profile.sql")).replace(/end \$\$;\s*$/, "").trimEnd();
    assert.equal(neu, alt, "update_my_speaker_profile weicht vom Snapshot ab");
  });

  it("das Protokoll nennt nur Feldnamen und die Person: kein `p_data`, `before` leer, ein Eintrag nur bei einer Änderung, nur für die Assistenz", () => {
    const f = code(funktion(sql(), "update_my_speaker_profile"));
    const aufruf = f.match(/perform log_audit\(([\s\S]*?)\);/);
    assert.ok(aufruf, "kein log_audit-Aufruf");
    assert.doesNotMatch(aufruf[1], /p_data/, "der Eingabeblock gehört nicht ins Audit");
    assert.match(aufruf[0], /perform log_audit\('speaker\.assistant_update', 'speaker_profile', v_sp\.id::text, null,\s+jsonb_build_object\('felder', to_jsonb\(v_felder\), 'person_id', v_sp\.person_id\)\);/);
    assert.equal((f.match(/perform log_audit\(/g) ?? []).length, 1, "genau ein Aufruf");
    // die Namen sortiert, und nur bei mindestens einem geänderten Feld
    assert.match(f, /where f\.geaendert\s+order by f\.name\s+\);/);
    assert.match(f, /if cardinality\(v_felder\) > 0 then\s+perform log_audit\(/);
    // nur die Assistenz: Lesen des alten Stands und Protokollieren stehen je hinter `person_id <> v_me`
    assert.match(f, /if v_sp\.person_id <> v_me then\s+select \* into v_alt_p from person where id = v_sp\.person_id;\s+end if;/);
    assert.match(f, /if v_sp\.person_id <> v_me then\s+v_felder := array\(/);
    assert.equal((f.match(/v_sp\.person_id <> v_me/g) ?? []).length, 2);
  });

  it("der alte Stand der Person wird vor dem Schreiben gelesen, der Vergleich steht nach dem Schreiben", () => {
    const f = code(funktion(sql(), "update_my_speaker_profile"));
    const lesen = f.indexOf("select * into v_alt_p from person");
    const schreiben = f.indexOf("update person set");
    const vergleich = f.indexOf("v_felder := array(");
    assert.ok(lesen > 0 && lesen < schreiben, "der Stand der Person wird nach dem Schreiben gelesen");
    assert.ok(schreiben < vergleich, "der Vergleich steht vor dem Schreiben");
    // die Felder von `speaker_profile` vergleicht die Funktion mit `v_sp` — dem Stand vor dem Update (`select … for update` ganz oben)
    assert.match(f, /select \* into v_sp from speaker_profile sp/);
    assert.match(f, /is distinct from v_sp\.job_title/);
    assert.match(f, /is distinct from v_alt_p\.first_name/);
  });

  it("die protokollierten Namen decken jedes Feld, das die Funktion schreiben kann — ein neues Feld ohne Audit fiele hier auf", () => {
    const f = code(funktion(sql(), "update_my_speaker_profile"));
    const schreibteil = f.slice(0, f.indexOf("v_felder := array("));
    const gelesen = new Set([...schreibteil.matchAll(/p_data \? '(\w+)'/g)].map((m) => m[1]));
    gelesen.delete("phone_e164"); // der alte Schlüssel der Formulare vor SPK-093 ist dasselbe Feld wie `phone`
    const block = f.slice(f.indexOf("from (values"), f.indexOf(") as f(name, geaendert)"));
    const protokolliert = new Set([...block.matchAll(/^\s+\('(\w+)',/gm)].map((m) => m[1]));
    assert.deepEqual([...protokolliert].sort(), [...gelesen].sort());
    assert.equal(protokolliert.size, 20);
  });

  it("jedes Feld hat seine eigene Bedingung: Schlüssel da und Wert anders als vorher (Sprache nur `de`/`en`, Links und Technik nur als Objekt)", () => {
    const f = code(funktion(sql(), "update_my_speaker_profile"));
    assert.match(f, /\('phone',\s+v_tel_gegeben\s+and v_tel\s+is distinct from v_alt_p\.phone\)/);
    assert.match(f, /\('preferred_language', p_data \? 'preferred_language' and p_data->>'preferred_language' in \('de', 'en'\)\s+and p_data->>'preferred_language' is distinct from v_alt_p\.preferred_language\)/);
    assert.match(f, /\('socials',\s+p_data \? 'socials'\s+and jsonb_typeof\(p_data->'socials'\) = 'object'\s+and p_data->'socials'\s+is distinct from v_sp\.socials\)/);
    assert.match(f, /\('tech_rider',\s+p_data \? 'tech_rider' and jsonb_typeof\(p_data->'tech_rider'\) = 'object' and p_data->'tech_rider' is distinct from v_sp\.tech_rider\)/);
    // die Kontaktfelder gegen die ausgerechneten Werte (sie sind es, die geschrieben werden), nicht gegen die rohe Eingabe
    for (const [feld, rechnung, alt] of [
      ["contact_first_name", "v_kontakt_vor", "contact_first_name"],
      ["contact_last_name", "v_kontakt_nach", "contact_last_name"],
      ["contact_email", "v_kontakt_mail::citext", "contact_email"],
      ["contact_phone", "v_kontakt_tel", "contact_phone"],
      ["contact_kind", "v_kontakt_art", "contact_kind"],
      ["contact_consent_at", "v_kontakt_ok", "contact_consent_at"],
    ]) {
      assert.match(f, new RegExp(`\\('${feld}',\\s+${rechnung.replace(":", "\\:")}\\s+is distinct from v_sp\\.${alt}\\)`), feld);
    }
  });

  it("Rechte und Fehlerschlüssel bleiben: DEFINER mit gepinntem `search_path`, 28000, P0002, Einwilligung beim Kontakt (22023)", () => {
    const f = funktion(sql(), "update_my_speaker_profile");
    assert.match(f, /RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'extensions'\n/);
    assert.match(f, /if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;/);
    assert.match(f, /and \(sp\.person_id = v_me or is_speaker_assistant\(sp\.id, v_me\)\)/);
    assert.match(f, /raise exception 'speaker_not_found' using errcode = 'P0002';/);
    assert.match(f, /raise exception 'speaker_contact_consent_required' using errcode = '22023'/);
    assert.match(f, /raise exception 'invalid_contact_kind' using errcode = '22023'/);
  });
});

describe("SPK-094: der DB-Test hält die Regeln fest", () => {
  const test = () => quelle("supabase/tests/v6_speaker_audit_feldnamen.sql");

  it("9 Erwartungen im Muster `t_erw`; echte Claims, die Rolle `anon`, die Assistenz gegen die Speakerin selbst, ein fremdes Profil", () => {
    const t = test();
    const erw = t.slice(t.indexOf("insert into t_erw values"), t.indexOf("-- Hilfen:"));
    assert.equal((erw.match(/^\s+\('\d\d_[a-z_]+', /gm) ?? []).length, 9);
    assert.match(t, /request\.jwt\.claims/);
    assert.match(t, /set local role anon/);
    assert.match(t, /assistant_person_id/);
    assert.match(t, /'05_speakerin_selbst'/);
    assert.match(t, /'07_abgewiesen'/);
  });

  it("die Randfälle sind belegt: kein Wert im Eintrag, ohne Änderung kein Eintrag, alle 17 Arten sortiert, ungültige Sprache, Einwilligung beim Kontakt", () => {
    const t = test();
    assert.match(t, /\('01_felder_ohne_werte', '\^ok speichern=ok eintraege=1 felder=bio_short_en,first_name,phone person_id=true before_null=true akteur=true ohne_werte=true\$'\)/);
    assert.match(t, /\('02_ohne_aenderung', '\^ok gleich=1 getrimmt=1 nur_id=1\$'\)/);
    assert.match(t, /felder=bio_long_de,bio_long_en,bio_short_de,contact_consent_at,contact_email,contact_first_name,contact_kind,contact_last_name,contact_phone,job_title,last_name,linkedin_url,organization_name,preferred_language,socials,tech_rider,title anzahl=17 ohne_werte=true/);
    assert.match(t, /anzahl=17 ohne_werte=true wiederholt=1\$'\)/);
    assert.match(t, /\('04_sprache', '\^ok fr=0 kein_objekt=0 gleich=0 de=1 felder=preferred_language\$'\)/);
    assert.match(t, /ohne_einwilligung=22023 speaker_contact_consent_required eintraege=0 vorname=Xaver/);
    assert.match(t, /pg_temp\.ohne_werte\(v_s1, 'ZZAuditNeu', '9990001', 'ZZ Bio Audit geheim'\)/);
  });
});

describe("SPK-094: Doku", () => {
  it("Testleitfaden: eine Zeile mit dem Weg über „Du arbeitest für“ zum Protokoll und dem, was dort stehen darf (nur Namen) und nicht (Werte)", () => {
    const zeile = quelle("docs/team-testleitfaden.md").split("\n").find((l) => l.includes("Assistenz-Änderung im Profil (SPK-094)"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /`\/admin\/verwaltung\/protokoll`/);
    assert.match(zeile, /Du arbeitest für/);
    assert.match(zeile, /„Assistenz eines Speakers geändert“/);
    assert.match(zeile, /nur die \*\*Namen\*\* der geänderten Felder/);
  });

  it("Backlog: SPK-094 trägt die PR-Nummer und nennt die Migration; SPK-088 steht auf „gebaut“", () => {
    const backlog = quelle("docs/feedback/speaker.md").split("\n");
    const s94 = backlog.find((l) => l.startsWith("| SPK-094 |"));
    assert.ok(s94 && /\| P2 \| (geplant|gebaut|abgenommen) #\d+/.test(s94), "SPK-094 trägt keine PR-Nummer");
    assert.match(s94, /Migration enthalten/);
    const s88 = backlog.find((l) => l.startsWith("| SPK-088 |"));
    assert.ok(s88 && /\| P1 \| (gebaut|abgenommen) #454/.test(s88), "SPK-088 steht nicht auf gebaut #454");
  });
});
