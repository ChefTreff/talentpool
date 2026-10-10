import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { targetProfileLabels } from "@/app/(talent)/programm/types";
import { PROFIL_AUSGENOMMEN, PROFIL_FELDER, profilFelderAus } from "@/components/partner/profil";
import { istVorschlag, migrationText } from "@/tests/migration-datei";

/**
 * K-94, Matching Stufe 1, Teil A (Partner-Seite; Konrad 09.10.2026 „wie empfohlen“, Plan 10.10.2026): das Wunschprofil der Partner nutzt denselben Kern wie die
 * Teilnehmenden — Status, Studienfeld, **Skills, Fachbereich und Kategorie** (`career_opportunities`); `career_level` fällt heraus, „nicht interessiert“ ist
 * gesperrt, die Masterclass trägt `target_profile`. Die Whitelist steht an vier Stellen (zwei SQL-Funktionen, `PROFIL_FELDER`, `targetProfileLabels`), und dieser
 * Test hält sie zusammen. Die Datenbank belegt `supabase/tests/v6_matching_vokabular.sql` (33 Schritte).
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ohneKommentare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const leer = (text: string) => text.replace(/\s+/g, " ").trim();
const FUENF = ["occupation_status", "study_field", "skill", "function_area", "career_opportunities"];

describe("Die Felder des Wunschprofils", () => {
  it("fünf Felder in der Reihenfolge der Fragen; `career_level` gehört nicht dazu", () => {
    assert.deepEqual([...PROFIL_FELDER], FUENF);
    assert.ok(!(PROFIL_FELDER as readonly string[]).includes("career_level"));
  });

  it("die Auswahllisten kommen je Feld aus der Vokabulargruppe gleichen Namens, in deren Reihenfolge", () => {
    const gefragt: string[] = [];
    const felder = profilFelderAus((name) => {
      gefragt.push(name);
      return { zwei: `Zwei (${name})`, eins: `Eins (${name})` };
    });
    assert.deepEqual(gefragt, FUENF, "eine Gruppe je Feld, in der Reihenfolge der Felder");
    assert.deepEqual(Object.keys(felder), FUENF);
    assert.deepEqual(felder.skill, [{ key: "zwei", label: "Zwei (skill)" }, { key: "eins", label: "Eins (skill)" }], "Reihenfolge der Gruppe bleibt");
  });

  it("„nicht interessiert“ gibt es nur in der Kategorie nicht — und nur dort wird er ausgeblendet", () => {
    assert.deepEqual(PROFIL_AUSGENOMMEN, { career_opportunities: ["nicht-interessiert"] });
    const felder = profilFelderAus(() => ({ praktikum: "Praktikum", "nicht-interessiert": "Ich bin aktuell nicht interessiert", werkstudium: "Werkstudium" }));
    assert.deepEqual(felder.career_opportunities.map((o) => o.key), ["praktikum", "werkstudium"]);
    for (const feld of ["occupation_status", "study_field", "skill", "function_area"] as const) {
      assert.deepEqual(felder[feld].map((o) => o.key), ["praktikum", "nicht-interessiert", "werkstudium"], `${feld}: nichts ausgeblendet`);
    }
  });

  it("eine leere Gruppe ergibt eine leere Liste, kein Fehler", () => {
    const felder = profilFelderAus(() => ({}));
    for (const feld of PROFIL_FELDER) assert.deepEqual(felder[feld], []);
  });
});

describe("Talent-Programmseite: die gesuchten Profile als Beschriftungen", () => {
  const label = (v: string, k: string) => `${v}:${k}`;

  it("alle fünf Merkmale in fester Reihenfolge; `career_level` und Fremdes erscheinen nicht", () => {
    const tp = {
      career_opportunities: ["praktikum"],
      skill: ["programming", "design"],
      function_area: ["data_ai"],
      career_level: ["junior"],
      study_field: ["business"],
      occupation_status: ["master"],
      fremd: ["x"],
    } as Record<string, string[]>;
    assert.deepEqual(targetProfileLabels(tp, label), [
      "occupation_status:master",
      "study_field:business",
      "skill:programming",
      "skill:design",
      "function_area:data_ai",
      "career_opportunities:praktikum",
    ]);
  });

  it("kein Profil, ein leeres Objekt und ein Merkmal, das keine Liste ist, ergeben nichts", () => {
    assert.deepEqual(targetProfileLabels(null, label), []);
    assert.deepEqual(targetProfileLabels({}, label), []);
    assert.deepEqual(targetProfileLabels({ skill: "programming" } as unknown as Record<string, string[]>, label), []);
  });

  it("dieselbe Liste wie die Felder der Partnerseite — sonst zeigt die eine Seite, was die andere nicht kennt", () => {
    const stand = Object.fromEntries(PROFIL_FELDER.map((f) => [f, [f]])) as Record<string, string[]>;
    assert.deepEqual(targetProfileLabels(stand, (v, k) => k), [...PROFIL_FELDER]);
  });
});

describe("Die drei Seiten bauen die Auswahllisten mit demselben Helfer", () => {
  it("Company Tour, Interview Tables und die Organisation im Admin: `profilFelderAus`, keine eigene Liste, kein `career_level`", () => {
    const s = (p: string) => ohneKommentare(quelle(p));
    const tour = s("app/(partner)/partner/company-tour/page.tsx");
    const tische = s("app/(partner)/partner/interview-tables/page.tsx");
    const admin = s("app/(admin)/admin/partner/[org]/page.tsx");
    assert.match(tour, /const felder = profilFelderAus\(\(name\) => vgroup\(vocab, name\)\);/);
    assert.match(tische, /const profilFelder = profilFelderAus\(\(name\) => vgroup\(vocab, name\)\);/);
    assert.match(tische, /profilFelder=\{profilFelder\}/);
    assert.match(admin, /tourFelder=\{profilFelderAus\(\(name\) => vgroup\(vocab, name\)\)\}/);
    for (const [name, text] of [["Company Tour", tour], ["Interview Tables", tische], ["Admin", admin]] as const) {
      assert.doesNotMatch(text, /career_level/, `${name}: kein career_level im Wunschprofil`);
      assert.match(text, /import \{ profilFelderAus \} from "@\/components\/partner\/profil";/, `${name}: Import`);
    }
    // Die Maske der Interview Tables nimmt genau die Felder des Wunschprofils, kein eigener Typ mehr.
    assert.match(s("app/(partner)/partner/interview-tables/TischeView.tsx"), /profilFelder: Record<ProfilFeld, ProfilOption\[\]>;/);
  });

  it("die Auswahl zeichnet jedes Feld aus `PROFIL_FELDER` mit der Beschriftung `profile_<Feld>`", () => {
    const a = ohneKommentare(quelle("components/partner/ProfilAuswahl.tsx"));
    assert.match(a, /PROFIL_FELDER\.map\(\(feld\) => \{/);
    assert.match(a, /label=\{t\[`profile_\$\{feld\}`\]\}/);
  });
});

describe("Texte: ein Satz je Feld, in beiden Sprachen, `career_level` ist weg", () => {
  it("`profile_<Feld>` steht in Tour und Interview Tables, DE und EN; die neuen deutschen Beschriftungen sprechen ihr an oder nennen nur das Wort", () => {
    for (const sprache of ["de", "en"] as const) {
      const d = JSON.parse(quelle(`lib/i18n/${sprache}.json`)) as Record<string, Record<string, string>>;
      for (const abschnitt of ["partnerTour", "partnerInterviewTables"]) {
        for (const feld of PROFIL_FELDER) assert.equal(typeof d[abschnitt][`profile_${feld}`], "string", `${sprache}.${abschnitt}.profile_${feld}`);
        assert.ok(!("profile_career_level" in d[abschnitt]), `${sprache}.${abschnitt}: profile_career_level ist weg`);
      }
    }
    const de = JSON.parse(quelle("lib/i18n/de.json")) as Record<string, Record<string, string>>;
    for (const abschnitt of ["partnerTour", "partnerInterviewTables"]) {
      assert.equal(de[abschnitt].profile_career_opportunities, "Was ihr anbietet", abschnitt);
      for (const feld of PROFIL_FELDER) assert.ok(!/\bSie\b|\bIhre[mnrs]?\b/.test(de[abschnitt][`profile_${feld}`]), `${abschnitt}.profile_${feld}`);
    }
  });
});

describe("Migration `v6_matching_vokabular`", () => {
  const sql = () => migrationText("v6_matching_vokabular");
  const code = (text: string) => text.replace(/--[^\n]*/g, "");
  /** Der Text einer Funktion von `create or replace function <name>(` bis einschließlich ihres Abschlusses (`end $$;`, `$$;` auf eigener Zeile oder `end $f$;`). */
  const funktion = (text: string, name: string) => {
    const von = text.indexOf(`create or replace function ${name}(`);
    assert.ok(von >= 0, `${name} fehlt`);
    const treffer = ["end $$;", "\n$$;", "end $f$;"]
      .map((marke) => ({ marke, i: text.indexOf(marke, von) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i)[0];
    assert.ok(treffer, `${name}: kein Ende gefunden`);
    return text.slice(von, treffer.i + treffer.marke.length);
  };

  it("vier Funktionen — drei bestehende, ein interner Helfer —, keine Tabelle, Spalte, Policy oder Trigger; am Ende die Härtung", () => {
    const c = code(sql());
    assert.deepEqual(
      [...c.matchAll(/create or replace function (\w+)\(/g)].map((m) => m[1]),
      ["format_detail_keys", "check_format_details", "partner_update_tour_stop", "matching_career_level_entfernen"],
    );
    assert.doesNotMatch(c, /\b(create|alter|drop) table\b|\badd column\b|\bcreate (trigger|index|policy)\b/i);
    assert.match(c.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("die Whitelist beider Funktionen ist dieselbe Liste wie `PROFIL_FELDER` — in derselben Reihenfolge, ohne `career_level`", () => {
    const c = code(sql());
    const listen = [...c.matchAll(/v_key = any\(array\[([^\]]*)\]\)/g)].map((m) => [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]));
    assert.equal(listen.length, 2, "check_format_details und partner_update_tour_stop");
    for (const liste of listen) assert.deepEqual(liste, [...PROFIL_FELDER]);
    assert.doesNotMatch(c, /'career_level'\s*[,\]]/);
  });

  it("„nicht-interessiert“ ist in beiden Wegen gesperrt (22023 `invalid_vocab`), und nur in der Kategorie", () => {
    const c = leer(code(sql()));
    const regel = "if v_key = 'career_opportunities' and v_el = 'nicht-interessiert' then raise exception 'invalid_vocab' using errcode = '22023', detail = v_key || ':' || v_el; end if;";
    assert.equal(c.split(regel).length - 1, 2, "in check_format_details und in partner_update_tour_stop");
    // Die Regel steht hinter der Vokabularprüfung — erst „gibt es den Wert“, dann „darf ein Partner ihn anbieten“.
    for (const name of ["check_format_details", "partner_update_tour_stop"]) {
      const f = leer(code(funktion(sql(), name)));
      assert.ok(f.indexOf("if not is_vocab_key(v_key, v_el)") > 0 && f.indexOf("if not is_vocab_key(v_key, v_el)") < f.indexOf(regel), name);
    }
  });

  it("die Masterclass trägt `target_profile` neben `goodies_planned`; Side-Event und Company Tour unverändert", () => {
    const f = leer(code(funktion(sql(), "format_detail_keys")));
    assert.match(f, /when 'masterclass' then array\['goodies_planned', 'target_profile'\]/);
    assert.match(f, /when 'side_event' then array\['location_text', 'image_asset_id'\]/);
    assert.match(f, /when 'interview_table' then array\['job_title', 'job_posting_text', 'job_posting_url', 'target_profile', 'interview_mode'\]/);
    assert.match(f, /else array\[\]::text\[\] end/);
  });

  it("die Datenkorrektur nimmt nur `career_level` heraus, ruft kein Audit, ist intern und läuft einmal mit Gegenprobe", () => {
    const text = sql();
    const helfer = leer(code(funktion(text, "matching_career_level_entfernen")));
    assert.match(helfer, /set target_profile = target_profile - 'career_level' where jsonb_typeof\(target_profile\) = 'object' and target_profile \? 'career_level'/);
    assert.match(helfer, /jsonb_set\(format_details, '\{target_profile\}', \(format_details->'target_profile'\) - 'career_level'\)/);
    assert.doesNotMatch(helfer, /log_audit|insert into/);
    assert.match(leer(code(text)), /revoke execute on function matching_career_level_entfernen\(\) from public, anon, authenticated;/);
    const lauf = leer(code(text.slice(text.indexOf("do $mig$"))));
    assert.match(lauf, /v_n := matching_career_level_entfernen\(\);/);
    assert.match(lauf, /if v_rest <> 0 then raise exception 'Korrektur unvollstaendig: % Wunschprofile tragen noch career_level', v_rest using errcode = 'P0001'; end if;/);
    assert.equal((text.match(/matching_career_level_entfernen\(\);/g) ?? []).length, 1, "genau ein Aufruf in der Migration");
  });

  it("solange die Migration Vorschlag ist, sind die drei Funktionen bis auf die benannten Zeilen der Snapshot — nichts anderes ist verschwunden", (t) => {
    // db-konventionen, Nachtrag 09.10.2026: nach dem Anwenden ist der Snapshot maßgeblich und wandert mit späteren Migrationen derselben Funktion weiter.
    if (!istVorschlag("v6_matching_vokabular")) {
      t.skip("angewendet: der Snapshot ist maßgeblich");
      return;
    }
    const REGEL = "if v_key = 'career_opportunities' and v_el = 'nicht-interessiert' then raise exception 'invalid_vocab' using errcode = '22023', detail = v_key || ':' || v_el; end if;";
    const zurueck = (s: string) =>
      s
        .replace("array['occupation_status','study_field','skill','function_area','career_opportunities']", "array['occupation_status','career_level','study_field']")
        .replace(REGEL + " ", "")
        .replace("array['goodies_planned', 'target_profile']", "array['goodies_planned']");
    for (const name of ["format_detail_keys", "check_format_details", "partner_update_tour_stop"]) {
      const neu = zurueck(leer(code(funktion(sql(), name))));
      const alt = leer(code(quelle(`supabase/snapshot/functions/${name}.sql`)));
      assert.equal(neu, alt, `${name} weicht vom Snapshot ab`);
    }
  });
});
