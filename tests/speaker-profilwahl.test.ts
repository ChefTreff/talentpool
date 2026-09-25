import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

/**
 * Profilwahl im Speaker-Portal (SPK-071): Konten mit mehreren Profilen (eigenes
 * plus Assistenz oder Kontakt eines Partners) wählen, für wen sie arbeiten.
 * Die Wahl liegt in der Datenbank, damit alle `my_*`-Funktionen ihr folgen.
 */
const sql = () => migrationText("v6_speaker_profilwahl");
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

function funktion(name: string): string {
  const s = sql();
  const start = s.search(new RegExp(`create (or replace )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} fehlt in der Migration`);
  return s.slice(start, s.indexOf("$$;", s.indexOf("AS $$", start) + 5));
}

describe("Profilwahl: Datenbank", () => {
  it("die Wahl liegt in einer Tabelle ohne Grants, nur über die Funktionen erreichbar", () => {
    assert.match(sql(), /create table if not exists speaker_portal_selection/);
    assert.match(sql(), /alter table speaker_portal_selection enable row level security;/);
    assert.match(sql(), /revoke all on speaker_portal_selection from public, anon, authenticated;/);
  });

  it("my_speaker_profile_id nimmt die Wahl nur, solange das Recht besteht", () => {
    const f = funktion("my_speaker_profile_id");
    assert.match(f, /from speaker_portal_selection w/);
    assert.match(f, /is_speaker_assistant\(sp\.id, current_person_id\(\)\)/);
    // Rückfall wie bisher: eigenes zuerst, dann das neueste.
    assert.match(f, /order by \(sp\.person_id = current_person_id\(\)\) desc, sp\.created_at desc limit 1/);
  });

  it("die Portal-Funktionen, die selbst wählten, gehen über my_speaker_profile_id", () => {
    assert.match(funktion("my_speaker_profile"), /where sp\.id = my_speaker_profile_id\(p_edition_id\)/);
    assert.match(funktion("update_my_speaker_profile"), /where sp\.id = coalesce\(v_id, my_speaker_profile_id\(\)\)/);
    assert.match(funktion("my_sessions"), /sp\.person_id = \(select x\.person_id from speaker_profile x where x\.id = my_speaker_profile_id\(\)\)/);
  });

  it("wählen darf man nur ein eigenes oder betreutes Profil", () => {
    const f = funktion("set_my_speaker_profile");
    assert.match(f, /raise exception 'speaker_not_found' using errcode = 'P0002'/);
    assert.match(f, /raise exception 'not allowed' using errcode = '42501'/);
    assert.match(f, /on conflict \(person_id\) do update/);
  });

  it("die Migration endet mit harden_definer_functions", () => {
    assert.match(sql().trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("Profilwahl: Portal", () => {
  it("das Layout baut den Wechsler aus my_speaker_profiles", () => {
    const l = quelle("app/(speaker)/layout.tsx");
    assert.match(l, /rpc\("my_speaker_profiles"\)/);
    assert.match(l, /<ProfilWechsler /);
  });

  it("die Aktion schreibt über set_my_speaker_profile und lädt das Layout neu", () => {
    const a = quelle("app/(speaker)/speaker/actions.ts");
    assert.match(a, /rpc\("set_my_speaker_profile", \{ p_profile_id: profileId \}\)/);
    assert.match(a, /revalidatePath\(PATH, "layout"\)/);
  });

  it("der Wechsler erscheint erst ab zwei Profilen", () => {
    assert.match(quelle("app/(speaker)/ProfilWechsler.tsx"), /if \(profile\.length < 2\) return null;/);
  });

  it("die Texte stehen in DE und EN", () => {
    for (const sprache of ["de", "en"] as const) {
      const s = woerterbuch(sprache).speaker;
      assert.ok(s.profileSwitch, `${sprache}.speaker.profileSwitch fehlt`);
      assert.ok(s.profileOwn?.includes("{name}"), `${sprache}.speaker.profileOwn fehlt`);
    }
  });
});
