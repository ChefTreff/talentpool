import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { einordnungAenderungen, einordnungEntwurf } from "@/lib/speaker/einordnung";
import { toRpcFailure } from "@/lib/rpc-error";
import { istVorschlag, migrationText } from "@/tests/migration-datei";

/**
 * LEAD-053 (Feedbackrunde Konrad und Paulina 05.10.2026; Plan 10.10.2026): die A-/B-/C-Einstufung (`speaker_profile.priority`, „Prio“) ist Sache des Teams — Stage Leads sehen sie
 * nirgends und setzen sie nicht, auch nicht direkt über die Tabelle. Rechteänderung in einer Migration: drei Funktionen (je eine Zeile) und Spalten-Grants auf `speaker_profile`
 * (`revoke select … from authenticated`, dann eine **ausgeschriebene** Spaltenliste). Die Datenbank-Seite belegt `supabase/tests/v6_lead053_prio_nur_team.sql` (8 Erwartungen mit
 * Rollenwechsel, auch direkt gegen die Tabelle). Hier steht, was sich ohne Datenbank festhalten lässt: die Migration selbst, die **erlaubten direkten Lesestellen der App — positiv
 * aufgelistet**, die Oberfläche, die Fehlerschlüssel und die Doku. Vergleiche mit dem lebenden Snapshot gelten nur, solange die Migration ein Vorschlag ist (`istVorschlag()`).
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const sql = () => migrationText("v6_lead053_prio_nur_team");
const code = (text: string) => text.replace(/--[^\n]*/g, "");

/** Der Text einer Funktion der Migration: von `create or replace function <name>(` bis zum schließenden `end $$;`. */
function funktion(text: string, name: string): string {
  const von = text.indexOf(`create or replace function ${name}(`);
  assert.ok(von >= 0, `${name} fehlt`);
  const ende = text.indexOf("\nend $$;", von);
  assert.ok(ende > von, `${name}: kein Ende gefunden`);
  return text.slice(von, ende + "\nend $$;".length);
}

/** Die gewährten Spalten aus `grant select (…) on speaker_profile to authenticated;` der Migration. */
function gewaehrt(): string[] {
  const m = code(sql()).match(/grant select \(([^)]*)\) on speaker_profile to authenticated;/);
  assert.ok(m, "grant select (…) fehlt");
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

const AUSGENOMMEN = ["priority", "created_by", "created_by_org_id", "partner_editable_until_login", "stage_guest_consent_at", "companion_quota"];
/** Alle 56 Spalten von `speaker_profile` (live gelesen am 10.10.2026) — gewährt plus ausgenommen. */
const ALLE_SPALTEN = 56;

describe("LEAD-053: die Migration `v6_lead053_prio_nur_team` — Funktionen", () => {
  it("genau drei Funktionen, aus dem Snapshot, am Ende die Härtung; neue Rechte nur über `harden_definer_functions`, keine neue Tabelle", () => {
    const c = code(sql());
    const namen = [...c.matchAll(/create or replace function (\w+)\(/g)].map((m) => m[1]);
    assert.deepEqual(namen, ["manager_speakers", "speaker_detail", "update_speaker"]);
    assert.match(c.trimEnd(), /select harden_definer_functions\(\);$/);
    assert.doesNotMatch(c, /\bcreate table\b|\balter table\b|\bcreate policy\b/i);
    assert.match(c, /^set search_path = public, extensions;/m);
  });

  it("`manager_speakers` und `speaker_detail` liefern `priority` nur an das Team — NULL sonst; `update_speaker` zählt `priority` zu den Team-Feldern", () => {
    const m = code(funktion(sql(), "manager_speakers"));
    assert.match(m, /sp\.topic_role, case when is_speaker_team\(sp\.edition_id\) then sp\.priority end, sp\.recommended_format,/);
    assert.doesNotMatch(m, /sp\.priority,/, "kein ungeschützter Zugriff");
    const d = code(funktion(sql(), "speaker_detail"));
    assert.match(d, /'priority', case when v_team then v_sp\.priority end,/);
    assert.doesNotMatch(d, /v_sp\.priority,/, "kein ungeschützter Zugriff");
    const u = code(funktion(sql(), "update_speaker"));
    assert.match(u, /array\['lounge_access', 'pass_type', 'hotel_tier', 'hospitality_status',\s+'org_id', 'travel_costs_approved', 'owner_person_id', 'priority'\]\) then\s+raise exception 'team_only_fields' using errcode = '42501';/);
    // die übrigen Einordnungsfelder und die Notiz bleiben für alle Manager (K-36 F1)
    const teamFelder = u.match(/\?\| array\[([^\]]*)\]/)?.[1] ?? "";
    assert.ok(teamFelder.includes("'priority'"), "priority steht in der Liste der Team-Felder");
    for (const feld of ["category", "topic_cluster", "topic_role", "recommended_format", "contact_via", "outreach_channel", "internal_notes"]) {
      assert.ok(!teamFelder.includes(`'${feld}'`), `${feld} ist kein Team-Feld`);
    }
  });

  it("gegen die Live-Fassung (Snapshot) unterscheidet sich je Funktion genau die eine Zeile — nur, solange die Migration ein Vorschlag ist", { skip: !istVorschlag("v6_lead053_prio_nur_team") }, () => {
    const erwartet: Record<string, [string, string]> = {
      manager_speakers: ["sp.category, sp.topic_cluster, sp.topic_role, sp.priority, sp.recommended_format,", "sp.category, sp.topic_cluster, sp.topic_role, case when is_speaker_team(sp.edition_id) then sp.priority end, sp.recommended_format,"],
      speaker_detail: ["'priority', v_sp.priority,", "'priority', case when v_team then v_sp.priority end,"],
      update_speaker: ["'org_id', 'travel_costs_approved', 'owner_person_id']) then", "'org_id', 'travel_costs_approved', 'owner_person_id', 'priority']) then"],
    };
    for (const [name, [alt, neu]] of Object.entries(erwartet)) {
      const live = quelle(`supabase/snapshot/functions/${name}.sql`).trim();
      assert.equal(live.split(alt).length - 1, 1, `${name}: die alte Zeile steht einmal im Snapshot`);
      assert.equal(funktion(sql(), name).trim(), live.replace(alt, neu), `${name}: mehr als die eine Zeile geändert`);
    }
  });
});

describe("LEAD-053: die Migration — Spalten-Grants", () => {
  it("erst `revoke select` für `authenticated` (nimmt auch Spaltenrechte), dann **eine** ausgeschriebene Liste — kein Tabellen-Grant, kein dynamisches SQL, nichts für `anon`", () => {
    const c = code(sql());
    assert.match(c, /revoke select on speaker_profile from authenticated;\s+grant select \(/);
    assert.ok(c.indexOf("revoke select on speaker_profile") < c.indexOf("grant select ("), "erst entziehen, dann gewähren");
    assert.equal((c.match(/^grant select/gm) ?? []).length, 1, "genau ein Grant (der Hinweis im Tabellenkommentar zählt nicht)");
    assert.doesNotMatch(c, /grant select on speaker_profile/);
    assert.doesNotMatch(c, /\bexecute\b|\bdo \$|format\(/i, "kein dynamisches SQL");
    assert.doesNotMatch(c, /grant [^;]*speaker_profile[^;]*\banon\b/i);
  });

  it("die Liste: 50 Spalten, keine doppelt, keine der sechs ausgenommenen — und gewährt plus ausgenommen sind alle 56 Spalten der Tabelle", () => {
    const g = gewaehrt();
    assert.equal(g.length, 50);
    assert.equal(new Set(g).size, 50, "Spalte doppelt");
    for (const s of AUSGENOMMEN) assert.ok(!g.includes(s), `${s} darf nicht gewährt sein`);
    assert.equal(g.length + AUSGENOMMEN.length, ALLE_SPALTEN);
    // Was Policies anderer Tabellen und die App mit dem Nutzer-Client lesen, steht drin
    for (const s of ["id", "person_id", "assistant_person_id", "edition_id"]) assert.ok(g.includes(s), `${s} fehlt in der Liste`);
  });

  it("der Kopf der Migration nennt dieselben Listen wie der Grant (Inventar im Review lesbar): die sechs Ausgenommenen und das Wort „Inventar“", () => {
    const text = sql();
    assert.match(text, /Inventar der Spalten \(live gelesen am 10\.10\.2026, 56 Spalten\)/);
    for (const s of AUSGENOMMEN) assert.ok(text.includes(`\`${s}\``) || text.includes(s), s);
    for (const s of gewaehrt()) assert.ok(text.includes(s), `${s} fehlt im Inventar-Kopf`);
  });
});

/** Alle .ts/.tsx-Dateien unter den Quellordnern der App. */
function appDateien(): string[] {
  const out: string[] = [];
  for (const dir of ["app", "lib", "components"]) {
    for (const rel of readdirSync(dir, { recursive: true }) as string[]) {
      if (/\.(ts|tsx)$/.test(rel) && !rel.includes("node_modules")) out.push(join(dir, rel).split("\\").join("/"));
    }
  }
  return out;
}

describe("LEAD-053: direkte Lesestellen der App — positiv aufgelistet", () => {
  const ohneKommentare = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // Jede Stelle, die `speaker_profile` direkt abfragt; mit dem Nutzer-Client gelten die Spaltenrechte, mit dem Admin-Schlüssel nicht.
  const ERLAUBT: Record<string, { client: "nutzer" | "admin"; muster: RegExp; spalten: string[] }> = {
    "lib/speaker/praesentationen.ts": {
      client: "nutzer",
      muster: /\.from\("speaker_profile"\)\.select\("id, person_id"\)\.eq\("edition_id", editionId\)\.in\("person_id", personen\)/,
      spalten: ["id", "person_id", "edition_id"],
    },
    "lib/speaker/foto.ts": {
      client: "nutzer",
      muster: /supabase\.from\("speaker_profile"\)\.select\("edition_id"\)\.eq\("id", profileId\)\.maybeSingle\(\)/,
      spalten: ["edition_id", "id"],
    },
    "lib/expenses/store-invoice.ts": {
      client: "admin",
      muster: /admin\s+\.from\("speaker_profile"\)\s+\.select\("edition_id"\)\s+\.eq\("id", input\.profileId\)/,
      spalten: ["edition_id", "id"],
    },
  };

  it("genau diese drei Dateien fragen die Tabelle ab — eine vierte (oder ein `select(\"*\")`, ein eingebetteter Zugriff) macht den Test rot, bevor es zur Laufzeit 42501 gibt", () => {
    const treffer = appDateien().filter((f) => /\.from\(\s*["']speaker_profile["']\s*\)/.test(ohneKommentare(quelle(f))));
    assert.deepEqual(treffer.sort(), Object.keys(ERLAUBT).sort());
    for (const f of appDateien()) {
      const t = ohneKommentare(quelle(f));
      for (const m of t.matchAll(/\.from\(\s*["']speaker_profile["']\s*\)/g)) {
        assert.doesNotMatch(t.slice(m.index + m[0].length, m.index + m[0].length + 80), /^\s*\.select\(\s*["'`]\*/, `${f}: select("*") auf speaker_profile`);
      }
      assert.doesNotMatch(t, /select\(\s*["'`][^"'`]*\bspeaker_profile\s*[!(]/, `${f}: eingebetteter Zugriff auf speaker_profile`);
    }
  });

  it("jede Stelle liest und filtert nur gewährte Spalten (mit dem Nutzer-Client) — und nennt sie genau so, wie es der Test erwartet", () => {
    const g = new Set(gewaehrt());
    for (const [datei, e] of Object.entries(ERLAUBT)) {
      const t = ohneKommentare(quelle(datei));
      assert.match(t, e.muster, `${datei}: Abfrage geändert — Spalten neu prüfen`);
      if (e.client === "nutzer") for (const s of e.spalten) assert.ok(g.has(s), `${datei}: ${s} ist nicht gewährt`);
    }
    // `lib/speaker/foto.ts` und `praesentationen.ts` arbeiten mit der übergebenen Nutzer-Sitzung, nicht mit dem Admin-Schlüssel
    for (const datei of ["lib/speaker/praesentationen.ts", "lib/speaker/foto.ts"]) assert.doesNotMatch(ohneKommentare(quelle(datei)), /createSupabaseAdminClient/, datei);
    assert.match(ohneKommentare(quelle("lib/expenses/store-invoice.ts")), /const admin = createSupabaseAdminClient\(\);/);
  });

  it("die Skripte lesen mit dem Dienstschlüssel (von Spaltenrechten unberührt): kein Skript nutzt den Nutzer-Client auf speaker_profile", () => {
    for (const rel of readdirSync("scripts")) {
      if (!/\.(mjs|cjs|js|ts)$/.test(rel)) continue;
      const t = quelle(`scripts/${rel}`);
      if (!/from\(\s*["']speaker_profile["']\s*\)/.test(t)) continue;
      assert.match(t, /secretKey|SUPABASE_SECRET_KEY|service/i, `scripts/${rel}: liest speaker_profile ohne Dienstschlüssel`);
    }
  });
});

describe("LEAD-053: die Oberfläche", () => {
  it("die Einordnung hat eine Option `ohnePrio`: das Feld „Prio“ fehlt dann; das Fenster der Stage Leads setzt sie für alle ohne Team-Rolle, das Admin-Detail nie", () => {
    const e = quelle("components/speaker/Einordnung.tsx");
    assert.match(e, /\n  ohnePrio,\n\}: \{/);
    assert.match(e, /\{!ohnePrio && auswahl\("priority", t\.priority\)\}/);
    assert.match(quelle("app/(speaker-leads)/speaker-leads/SpeakerFenster.tsx"), /disabled=\{pending\}\s+ohnePrio=\{!isTeam\}/);
    assert.doesNotMatch(quelle("app/(admin)/admin/speaker/[id]/Detail.tsx"), /ohnePrio/);
  });

  it("die Pipeline-Liste: Spalte, Filter und Zelle „Prio“ nur mit `scope.team`; ein alter `?prio=` filtert Stage Leads nicht ins Leere", () => {
    const p = quelle("app/(speaker-leads)/speaker-leads/PipelineView.tsx");
    assert.match(p, /const \{ status, query, kategorie, cluster, betreuung \} = filter;/);
    assert.match(p, /const team = scope\.team;\s+const prio = team \? filter\.prio : "";/);
    assert.match(p, /\{team && \(\s+<Field label=\{te\.priority\} htmlFor="lead-prio" className="min-w-36">/);
    assert.match(p, /\{team && <Th>\{te\.priority\}<\/Th>\}/);
    assert.match(p, /\{team && \(\s+<Td label=\{te\.priority\}>/);
    assert.match(p, /\.filter\(\(s\) => !prio \|\| s\.priority === prio\)/);
  });

  it("der Kopf des Fensters zeigt die Prio nur dem Team (wie seit LEAD-055)", () => {
    assert.match(quelle("app/(speaker-leads)/speaker-leads/SpeakerFenster.tsx"), /const prio = isTeam && speaker\.priority \?/);
  });

  it("ein unveränderter Entwurf schickt `priority` nie mit — ohne das Feld bleibt es leer auf beiden Seiten; geändert wird nur, was man sieht (ausgeführt)", () => {
    const vorher = einordnungEntwurf({ topic_role: "Thema", priority: null, category: null });
    assert.deepEqual(einordnungAenderungen(vorher, { ...vorher }), {});
    assert.deepEqual(einordnungAenderungen(vorher, { ...vorher, topic_role: "Neu" }), { topic_role: "Neu" });
    // Das Team ändert die Prio: dann steht sie im Aufruf
    assert.deepEqual(einordnungAenderungen(vorher, { ...vorher, priority: "b" }), { priority: "b" });
  });

  it("der Fehlerschlüssel `team_only_fields` kommt in der Oberfläche an (BUSINESS_KEYS, DE und EN)", () => {
    assert.equal(toRpcFailure({ code: "42501", message: "team_only_fields" } as never).key, "team_only_fields");
    for (const lang of ["de", "en"]) {
      const d = JSON.parse(quelle(`lib/i18n/${lang}.json`)) as { rpc: Record<string, string> };
      assert.ok((d.rpc.team_only_fields ?? "").length > 10, lang);
    }
  });
});

describe("LEAD-053: der DB-Test und die Doku", () => {
  const test = () => quelle("supabase/tests/v6_lead053_prio_nur_team.sql");

  it("8 Erwartungen im Muster `t_erw`; Rollenwechsel direkt gegen die Tabelle (`authenticated` und `anon`), Stage Lead mit Bühne als Bereich, alle 50 gewährten und die 5 ausgenommenen Spalten einzeln", () => {
    const t = test();
    const erw = t.slice(t.indexOf("insert into t_erw values"), t.indexOf("-- Hilfen"));
    assert.deepEqual(
      [...erw.matchAll(/^\s+\('(\d\d_[a-z_]+)', /gm)].map((m) => m[1]),
      ["00_form", "01_manager_speakers", "02_speaker_detail", "03_update_speaker", "04_tabelle_direkt", "05_policies", "06_rechte", "07_eigentuemer"],
    );
    assert.match(t, /execute 'set local role ' \|\| quote_ident\(p_rolle\)/);
    assert.match(t, /pg_temp\.lies\(null, format\('select id from speaker_profile where id = %L', v_p\), 'anon'\)/);
    assert.match(t, /insert into role_assignment \(person_id, role, scope_type, scope_id, edition_id\) values \(v_l, 'speaker_manager', 'stage', v_st, v_ed\)/);
    assert.match(t, /foreach v_k in array v_gewaehrt loop/);
    assert.match(t, /foreach v_k in array v_ausgenommen loop/);
    // die Liste im Test ist dieselbe wie die der Migration
    const imTest = [...t.slice(t.indexOf("v_gewaehrt text[] := array["), t.indexOf("v_ausgenommen text[]")).matchAll(/'(\w+)'/g)].map((m) => m[1]);
    assert.deepEqual(imTest, gewaehrt());
    const ausTest = [...t.slice(t.indexOf("v_ausgenommen text[] := array[")).split(";")[0].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    assert.deepEqual(ausTest, AUSGENOMMEN.filter((s) => s !== "priority"));
  });

  it("der DB-Test von LEAD-039 folgt den neuen Regeln: der Stage Lead schreibt die sechs übrigen Felder, sieht die Prio als NULL und setzt sie nicht (42501)", () => {
    const t = quelle("supabase/tests/v6_lead039_einordnung.sql");
    assert.match(t, /seit LEAD-053 nur das Team/);
    assert.match(t, /update speaker_profile set priority = 'a' where id = v_sp;/);
    assert.match(t, /v_r\.priority is null and v_r\.category = 'politics'/);
    assert.match(t, /sqlstate = '42501' and sqlerrm = 'team_only_fields'/);
  });

  it("README der DB-Tests: eine Zeile für `v6_lead053_prio_nur_team.sql`", () => {
    const zeile = quelle("supabase/tests/README.md").split("\n").find((l) => l.startsWith("| `v6_lead053_prio_nur_team.sql` |"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /LEAD-053/);
    assert.match(zeile, /8 Erwartungen/);
  });

  it("db-konventionen §5: der Satz zu `speaker_profile` — ausgeschriebene Spaltenliste, neue Spalten brauchen ihren eigenen Grant", () => {
    const d = quelle("docs/db-konventionen.md");
    assert.match(d, /\*\*`speaker_profile` liest `authenticated` nur über eine ausgeschriebene Spaltenliste\*\*/);
    assert.match(d, /\*\*Neue Spalten auf `speaker_profile` brauchen ihren eigenen `grant select \(spalte\)`, wenn ein direkter Lesezugriff sie braucht\*\*/);
  });

  it("Testleitfaden: die Pipeline-Zeile sagt, dass die Prio nur Team und Admin gehört, und was ein Stage Lead sieht", () => {
    const zeile = quelle("docs/team-testleitfaden.md").split("\n").find((l) => l.startsWith("| `/pipeline` Pipeline |"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /Prio — \*\*nur Team und Admin, LEAD-053\*\*/);
    assert.match(zeile, /Ein Stage Lead \*\*ohne Team-Rolle\*\* hat in der Liste weder Spalte noch Filter/);
    assert.match(zeile, /Mit Konrads Konto \(Admin = Team\) ist die Stage-Lead-Sicht nicht anzuklicken/);
  });

  it("Backlog: LEAD-053 trägt die PR-Nummer und nennt Migration, Spalten-Grants und Tier-Frage; LEAD-058 steht auf „gebaut #476“", () => {
    const l53 = quelle("docs/feedback/speaker-leads.md").split("\n").find((l) => l.startsWith("| LEAD-053 |"));
    assert.ok(l53 && /\| P1 \| (geplant|gebaut|abgenommen) #\d+/.test(l53), "LEAD-053 trägt keine PR-Nummer");
    assert.match(l53, /Migration enthalten/);
    assert.match(l53, /Spalten-Grants/);
    assert.match(l53, /K-98/);
    const l58 = quelle("docs/feedback/speaker-leads.md").split("\n").find((l) => l.startsWith("| LEAD-058 |"));
    assert.ok(l58 && /\| P1 \| gebaut #476/.test(l58), "LEAD-058 nicht auf gebaut #476");
  });
});
