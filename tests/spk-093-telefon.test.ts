import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { istVorschlag, migrationText } from "@/tests/migration-datei";

/**
 * SPK-093 (Plan 09.10.2026, Folgepunkt aus 0292/ADM-108): das Speaker-Formular schreibt die Telefonnummer als freie Eingabe in `person.phone`;
 * `phone_e164` entsteht nur über den Trigger `trg_person_contact_keys`. Die Datenbank-Seite belegt `supabase/tests/v6_speaker_telefon.sql`
 * (14 Erwartungen, echter Rollenwechsel, vorher/nachher je Schritt); hier steht, was sich ohne Datenbank festhalten lässt.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") => JSON.parse(quelle(`lib/i18n/${sprache}.json`));
const sql = () => migrationText("v6_speaker_telefon");
const code = (text: string) => text.replace(/--[^\n]*/g, "");
/** TypeScript ohne Kommentare — damit eine Erklärung im Quelltext nicht als Treffer zählt. */
const tscode = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Seit SPK-088 steht das Telefon im Reiter „Person“ (vorher im einen großen Formular). */
const FORMULAR = "app/(speaker)/speaker/profil/PersonTab.tsx";
const TYPEN = "app/(speaker)/speaker/types.ts";

/** Der Text einer Funktion der Migration: von `create or replace function <name>(` bis zum nächsten `end $$;`. */
function funktion(text: string, name: string): string {
  const von = text.indexOf(`create or replace function ${name}(`);
  assert.ok(von >= 0, `${name} fehlt`);
  const ende = text.indexOf("end $$;", von);
  assert.ok(ende >= 0, `${name}: kein Ende gefunden`);
  return text.slice(von, ende);
}

/**
 * Macht SPK-093 an `my_speaker_profile` rückgängig — auf der Migration wie auf dem Snapshot: nach dem Anwenden steht die neue Fassung dort, und der
 * Vergleich „bis auf die Telefon-Zeilen gleich“ muss dann trotzdem halten.
 */
const OHNE_ANZEIGE = (text: string) =>
  text.replace(
    /       'preferred_language', v_p\.preferred_language,\n       -- SPK-093[^\n]*\n       -- `phone_e164` bleibt[^\n]*\n       'phone', coalesce\(v_p\.phone, v_p\.phone_e164\), 'phone_e164', v_p\.phone_e164,\n/,
    () => "       'preferred_language', v_p.preferred_language, 'phone_e164', v_p.phone_e164,\n",
  );

/** Dasselbe für `update_my_speaker_profile`: Deklaration, Berechnung und die zwei Spalten-Zeilen. */
const OHNE_SCHREIBEN = (text: string) =>
  text
    .replace("  v_tel_gegeben boolean; v_tel text;\n", () => "")
    .replace(/  -- SPK-093: Die Nummer ist freie Eingabe[\s\S]*?  v_tel := [^\n]*\n\n/, () => "")
    .replace(
      /    phone              = case when v_tel_gegeben then v_tel else phone end,\n    -- Leert[^\n]*\n    phone_e164         = case when v_tel_gegeben and v_tel is null then null else phone_e164 end,\n/,
      () => "    phone_e164         = case when p_data ? 'phone_e164'         then nullif(btrim(p_data->>'phone_e164'), '')         else phone_e164 end,\n",
    );

describe("SPK-093: die Migration `v6_speaker_telefon`", () => {
  it("zwei bestehende Funktionen — keine Tabelle, keine Spalte, keine neue Funktion; am Ende die Härtung", () => {
    const c = code(sql());
    const namen = [...c.matchAll(/create or replace function (\w+)\(/g)].map((m) => m[1]);
    assert.deepEqual(namen, ["my_speaker_profile", "update_my_speaker_profile"]);
    assert.doesNotMatch(c, /\b(create|alter|drop) table\b|\badd column\b|\bcreate (trigger|index|policy)\b/i);
    assert.match(c.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("beide Funktionen sind bis auf die Telefon-Zeilen der Snapshot — nichts anderes ist verschwunden (solange die Migration noch Vorschlag ist)", (t) => {
    // Nach dem Anwenden ist der Snapshot maßgeblich — und kann durch spätere Migrationen weitergewandert sein: `update_my_speaker_profile` hat SPK-094
    // (0301) erneut geändert, der Vergleich mit der Fassung nach 0300 gälte dann nicht mehr. Der Vergleich schützt den Vorschlag, nicht die Geschichte.
    if (!istVorschlag("v6_speaker_telefon")) {
      t.skip("angewendet (0300): der Snapshot ist maßgeblich");
      return;
    }
    const c = sql();
    const profilNeu = OHNE_ANZEIGE(funktion(c, "my_speaker_profile")).trimEnd();
    const profilAlt = OHNE_ANZEIGE(quelle("supabase/snapshot/functions/my_speaker_profile.sql")).replace(/end \$\$;\s*$/, "").trimEnd();
    assert.equal(profilNeu, profilAlt, "my_speaker_profile weicht vom Snapshot ab");
    const schreibenNeu = OHNE_SCHREIBEN(funktion(c, "update_my_speaker_profile")).trimEnd();
    const schreibenAlt = OHNE_SCHREIBEN(quelle("supabase/snapshot/functions/update_my_speaker_profile.sql")).replace(/end \$\$;\s*$/, "").trimEnd();
    assert.equal(schreibenNeu, schreibenAlt, "update_my_speaker_profile weicht vom Snapshot ab");
  });

  it("Schreiben: `phone` ist freie Eingabe (getrimmt, leer ⇒ null), der alte Schlüssel `phone_e164` gilt als dieselbe Eingabe, `phone` gewinnt; ohne beide bleibt die Nummer", () => {
    const f = code(funktion(sql(), "update_my_speaker_profile"));
    assert.match(f, /v_tel_gegeben := p_data \? 'phone' or p_data \? 'phone_e164';/);
    assert.match(f, /v_tel := nullif\(btrim\(case when p_data \? 'phone' then p_data->>'phone' else p_data->>'phone_e164' end\), ''\);/);
    assert.match(f, /phone\s+= case when v_tel_gegeben then v_tel else phone end,/);
  });

  it("`phone_e164` schreibt die Funktion nur, um es zu leeren — sonst leitet der Trigger ab (nie ein Rohwert aus der Eingabe)", () => {
    const f = code(funktion(sql(), "update_my_speaker_profile"));
    const zuweisungen = [...f.matchAll(/^\s+phone_e164\s+= (.+)$/gm)].map((m) => m[1]);
    assert.deepEqual(zuweisungen, ["case when v_tel_gegeben and v_tel is null then null else phone_e164 end,"]);
    assert.doesNotMatch(f, /p_data\s*(->>?|\?)\s*'phone_e164'\s*\)?\s*(then|,)\s*nullif/, "keine direkte Zuweisung aus dem Schlüssel `phone_e164`");
  });

  it("Anzeige: `person.phone` fällt bei Altbeständen auf `phone_e164` zurück; `phone_e164` bleibt im JSON, solange ein Formular vor SPK-093 es liest", () => {
    const f = code(funktion(sql(), "my_speaker_profile"));
    assert.match(f, /'phone', coalesce\(v_p\.phone, v_p\.phone_e164\), 'phone_e164', v_p\.phone_e164,/);
    assert.match(f, /'person', jsonb_build_object\(/);
  });

  it("Rechte, Pfad und Anmeldung bleiben, wie sie waren: DEFINER mit gepinntem `search_path`, 28000 ohne Anmeldung, nur die Person selbst oder ihre Assistenz", () => {
    const c = sql();
    const schreiben = funktion(c, "update_my_speaker_profile");
    assert.match(schreiben, /RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'extensions'\n/);
    assert.match(schreiben, /if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;/);
    assert.match(schreiben, /and \(sp\.person_id = v_me or is_speaker_assistant\(sp\.id, v_me\)\)/);
    assert.match(schreiben, /raise exception 'speaker_not_found' using errcode = 'P0002';/);
    const lesen = funktion(c, "my_speaker_profile");
    assert.match(lesen, /RETURNS jsonb\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'public', 'extensions'\n/);
    assert.match(lesen, /if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;/);
    // Das Audit der Assistenz-Änderung bleibt, wie es war.
    assert.match(schreiben, /perform log_audit\('speaker\.assistant_update', 'speaker_profile', v_sp\.id::text, null, p_data - 'id'\);/);
  });
});

describe("SPK-093: das Formular schickt `phone`", () => {
  it("der Entwurf trägt `phone`, geladen aus `person.phone`; er geht unverändert an die RPC (`...draft`) — kein `phone_e164` mehr", () => {
    const f = tscode(quelle(FORMULAR));
    assert.match(f, /type Draft = \{[\s\S]*?\n  phone: string;\n[\s\S]*?\};/);
    assert.match(f, /    phone: p\.phone \?\? "",/);
    assert.match(f, /await saveSpeakerProfile\(\{ id: profile\.id, \.\.\.draft \}\)/);
    assert.doesNotMatch(f, /phone_e164/);
  });

  it("das Feld zeigt und ändert `draft.phone`, als Telefonfeld ohne Formatzwang", () => {
    const f = tscode(quelle(FORMULAR));
    assert.match(f, /<Input id="phone" type="tel" value=\{draft\.phone\} onChange=\{\(e\) => set\("phone", e\.target\.value\)\} \/>/);
    assert.doesNotMatch(f, /pattern=|inputMode=|maxLength=/, "keine Formatvorgabe am Telefonfeld");
  });

  it("der Typ `SpeakerPerson` kennt `phone` (die RPC rechnet den Rückfall) und nicht mehr `phone_e164`", () => {
    const t = tscode(quelle(TYPEN));
    const person = t.slice(t.indexOf("export type SpeakerPerson"), t.indexOf("export type SpeakerAssistant"));
    assert.match(person, /\n  phone: string \| null;\n/);
    assert.doesNotMatch(person, /phone_e164/);
  });

  it("die Beschriftung bleibt „Telefon“/„Phone“ — „Telefon (Format)“ steht nur in der Dublettenansicht des Admins", () => {
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache);
      assert.doesNotMatch(w.speaker.fieldPhone, /Format/i, sprache);
      assert.equal(w.speaker.fieldPhone, sprache === "de" ? "Telefon" : "Phone");
    }
    assert.equal(woerterbuch("de").duplicateFields.phone_e164, "Telefon (Format)");
  });

  it("keine Stelle in app/, components/ oder lib/ liest oder schreibt `phone_e164` — die Schlüsselspalte gehört dem Trigger", () => {
    const treffer: string[] = [];
    for (const wurzel of ["app", "components", "lib"]) {
      for (const datei of readdirSync(new URL(`../${wurzel}`, import.meta.url), { recursive: true }) as string[]) {
        if (!/\.(ts|tsx|mjs)$/.test(datei)) continue;
        if (/phone_e164/.test(tscode(quelle(`${wurzel}/${datei}`)))) treffer.push(`${wurzel}/${datei}`);
      }
    }
    assert.deepEqual(treffer, []);
  });
});

describe("SPK-093: der DB-Test hält die Regeln fest", () => {
  const test = () => quelle("supabase/tests/v6_speaker_telefon.sql");

  it("14 Erwartungen im Muster `t_erw`, jede mit Stand vorher und nachher; echte Claims, die Rolle `anon`, Assistenz und fremdes Profil", () => {
    const t = test();
    const erw = t.slice(t.indexOf("insert into t_erw values"), t.indexOf("-- Hilfen:"));
    assert.equal((erw.match(/^\s+\('\d\d_[a-z_]+', /gm) ?? []).length, 14);
    assert.match(t, /request\.jwt\.claims/);
    assert.match(t, /set local role anon/);
    assert.match(t, /assistant_person_id/);
    assert.match(t, /'12_fremdes_profil'/);
    for (const schritt of ["01_neue_eingabe", "04_aenderung", "05_leeren", "06_leeren_altwert", "09_unberuehrt"]) {
      assert.ok(new RegExp(`\\('${schritt}', '\\^ok vorher=`).test(t), `${schritt}: ohne Stand vorher`);
    }
  });

  it("die Randfälle sind belegt: unlesbar bleibt in `phone` (nicht in `phone_e164`), derselbe Wert erneut, Leeren auch bei einem Altwert, alter Schlüssel, beide Schlüssel", () => {
    const t = test();
    for (const stelle of [
      "' Büro, Durchwahl 12 '",
      "'ZZ-Altwert 12'",
      "'phone_e164', '0171 2222222'",
      "'phone', '0171 1111111', 'phone_e164', '0171 2222222'",
      "'+49 (0) 40 5551234'",
    ]) {
      assert.ok(t.includes(stelle), stelle);
    }
    assert.match(t, /\('03_erneut_gleich', '\^ok lesbar=.*unlesbar=\\\[phone=Büro, Durchwahl 12 e164=NULL ok phone=Büro, Durchwahl 12 e164=NULL\\\]\$'\)/);
  });
});

describe("SPK-093: Doku", () => {
  it("Testleitfaden: eine Zeile für das Telefon im Speaker-Profil mit dem Weg zur Gegenprobe im Admin", () => {
    const d = quelle("docs/team-testleitfaden.md");
    const zeile = d.split("\n").find((l) => l.includes("Telefon im Speaker-Profil (SPK-093)"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /\/speaker\/profil/);
    assert.match(zeile, /\/admin\/personen/);
  });

  it("Backlog: SPK-093 steht nicht mehr auf „offen“ und nennt die Migration (der Auftrag sagte „ohne Migration“)", () => {
    const zeile = quelle("docs/feedback/speaker.md").split("\n").find((l) => l.startsWith("| SPK-093 |"));
    assert.ok(zeile, "Zeile SPK-093 fehlt");
    assert.doesNotMatch(zeile, /\| offen —/);
    assert.match(zeile, /Migration enthalten/);
  });
});
