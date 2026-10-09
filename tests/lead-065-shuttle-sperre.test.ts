import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { istVorschlag, migrationText } from "@/tests/migration-datei";
import { sperreAusAntwort, sperrHinweis, sperrZeit, type ShuttleSperre } from "@/lib/speaker/shuttle-sperre";

/**
 * LEAD-065 (K-64, Konrad 08.10.2026): Shuttle-Sperre ab Beginn der Shuttle-Periode. Die Datenbank-Seite belegt `supabase/tests/v6_shuttle_sperre.sql`
 * (15 Erwartungen, echter Rollenwechsel, Gegenstücke zu jeder Abweisung); hier steht, was sich ohne Datenbank festhalten lässt — und, wo es geht,
 * **ausgeführt** wird: der Hinweistext mit den echten Wörterbüchern, die Zeit, die Auswertung der Antwort.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));
const sql = () => migrationText("v6_shuttle_sperre");
const code = (text: string) => text.replace(/--[^\n]*/g, "");

const SEITE = "app/(speaker)/speaker/travel/page.tsx";
const ANSICHT = "app/(speaker)/speaker/travel/ShuttleView.tsx";
const LEADS_SEITE = "app/(speaker-leads)/speaker-leads/shuttle/page.tsx";
const LEADS_ANSICHT = "app/(speaker-leads)/speaker-leads/shuttle/LeadShuttle.tsx";
const LADER = "lib/speaker/shuttle-sperre-server.ts";
const KARTE = "components/shuttle/SperreHinweis.tsx";
const LIB = "lib/speaker/shuttle-sperre.ts";

/** Der Text einer Funktion der Migration: von `create or replace function <name>(` bis zum nächsten `end $$;` bzw. `$$;`. */
function funktion(text: string, name: string): string {
  const von = text.indexOf(`create or replace function ${name}(`);
  assert.ok(von >= 0, `${name} fehlt in der Migration`);
  const ende = [text.indexOf("end $$;", von), text.indexOf("\n$$;", von)].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  assert.ok(ende !== undefined, `${name}: kein Ende gefunden`);
  return text.slice(von, ende);
}

/** Der eingefügte Sperrblock samt seinem Kommentar (`-- LEAD-065 …` bis zum `end if;`). */
const OHNE_SPERRBLOCK = (text: string) => text.replace(/  -- LEAD-065[\s\S]*?  end if;\n/, "").replace(/\n\n\n/g, "\n\n");

const sperre = (x: Partial<ShuttleSperre> = {}): ShuttleSperre => ({
  locked: true,
  lock_from: "2027-04-01T07:00:00Z",
  contact_name: "Paula Beispiel",
  contact_phone: "+49 40 5551234",
  contact_email: "paula@chef-treff.de",
  ...x,
});

describe("LEAD-065: die Migration `v6_shuttle_sperre`", () => {
  it("vier neue Funktionen, zwei geänderte — keine Tabelle, keine Spalte; die Helfer sind intern, die Lesefunktion nicht", () => {
    const c = code(sql());
    const namen = [...c.matchAll(/create or replace function (\w+)\(/g)].map((m) => m[1]);
    assert.deepEqual(namen, ["shuttle_lock_at", "shuttle_locked", "shuttle_lock_text", "request_shuttle", "cancel_shuttle", "shuttle_lock_status"]);
    assert.doesNotMatch(c, /\b(create|alter|drop) table\b|\badd column\b/i);
    for (const helfer of ["shuttle_lock_at", "shuttle_locked", "shuttle_lock_text"]) {
      assert.match(c, new RegExp(`revoke execute on function ${helfer}\\(uuid\\) from public, anon, authenticated;`), helfer);
    }
    assert.doesNotMatch(c, /revoke execute on function shuttle_lock_status/);
    assert.match(c.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("die Frist: eine Systemfrist je Edition mit dem Datum 31.12.2099 — nichts gesperrt, bis das Team das Datum setzt; fehlt sie, gibt es keine Sperre", () => {
    const c = code(sql());
    assert.match(c, /select e\.id, 'shuttle_lock_from', 'speaker', timestamptz '2099-12-31 12:00:00\+00',/);
    assert.match(c, /\n       false\n  from event e\n where e\.is_edition\non conflict \(edition_id, key\) do nothing;/);
    // Fehlt die Zeile, liefert `shuttle_lock_at` NULL und `shuttle_locked` falsch — der Code verlässt sich nicht auf den Seed.
    assert.match(funktion(c, "shuttle_locked"), /select coalesce\(shuttle_lock_at\(p_profile_id\) <= now\(\), false\)/);
    assert.match(funktion(c, "shuttle_lock_at"), /join deadline d on d\.edition_id = sp\.edition_id and d\.key = 'shuttle_lock_from'/);
  });

  it("`request_shuttle` und `cancel_shuttle` sind bis auf den Sperrblock der Snapshot — nichts anderes ist verschwunden (solange die Migration noch Vorschlag ist)", (t) => {
    // db-konventionen, Nachtrag 09.10.2026: nach dem Anwenden ist der Snapshot maßgeblich und wandert mit späteren Migrationen derselben Funktionen weiter.
    if (!istVorschlag("v6_shuttle_sperre")) {
      t.skip("angewendet (0299): der Snapshot ist maßgeblich");
      return;
    }
    const c = sql();
    for (const name of ["request_shuttle", "cancel_shuttle"]) {
      const neu = OHNE_SPERRBLOCK(funktion(c, name)).trimEnd();
      const alt = OHNE_SPERRBLOCK(quelle(`supabase/snapshot/functions/${name}.sql`)).replace(/end \$\$;\s*$/, "").trimEnd();
      assert.equal(neu, alt, `${name} weicht vom Snapshot ab`);
    }
  });

  it("die Sperre steht in der Reihenfolge: Rechte zuerst (Fremde bekommen 42501, nicht „gesperrt“), dann die Sperre, dann die Eingabeprüfung bzw. die Abfrage „schon storniert“", () => {
    const c = code(sql());
    const anfrage = funktion(c, "request_shuttle");
    assert.ok(anfrage.indexOf("can_request_shuttle(p_profile_id)") < anfrage.indexOf("shuttle_locked(p_profile_id)"));
    assert.ok(anfrage.indexOf("shuttle_locked(p_profile_id)") < anfrage.indexOf("fields_required"));
    const storno = funktion(c, "cancel_shuttle");
    assert.ok(storno.indexOf("can_request_shuttle(v_b.profile_id)") < storno.indexOf("shuttle_locked(v_b.profile_id)"));
    assert.ok(storno.indexOf("shuttle_locked(v_b.profile_id)") < storno.indexOf("if v_b.status = 'cancelled' then return; end if;"));
  });

  it("gesperrt sind alle außer dem Speaker-Team: P0001 `shuttle_locked` mit dem Zeitpunkt, in beiden Funktionen derselbe Satz", () => {
    const c = code(sql());
    assert.match(funktion(c, "request_shuttle"), /if shuttle_locked\(p_profile_id\) and not coalesce\(is_speaker_team\(null\), false\) then\s+raise exception 'shuttle_locked' using errcode = 'P0001', detail = shuttle_lock_text\(p_profile_id\);/);
    assert.match(funktion(c, "cancel_shuttle"), /if shuttle_locked\(v_b\.profile_id\) and not coalesce\(is_speaker_team\(null\), false\) then\s+raise exception 'shuttle_locked' using errcode = 'P0001', detail = shuttle_lock_text\(v_b\.profile_id\);/);
    assert.doesNotMatch(c, /confirm_shuttle/, "die finale Freigabe bleibt unberührt");
  });

  it("`shuttle_lock_status`: Recht wie `can_request_shuttle` vor jeder Auskunft, `locked` für den Aufrufer (Team nie), Kontakt wie `my_contacts()`", () => {
    const f = funktion(code(sql()), "shuttle_lock_status");
    assert.match(f, /returns table\(locked boolean, lock_from timestamptz, contact_name text, contact_phone text, contact_email text\)/);
    assert.match(f, /language plpgsql stable security definer set search_path to 'public', 'extensions'/);
    assert.ok(f.indexOf("errcode = '28000'") < f.indexOf("errcode = '42501'"));
    assert.match(f, /if not coalesce\(can_request_shuttle\(p_profile_id\), false\) then raise exception 'not allowed' using errcode = '42501'; end if;/);
    assert.match(f, /select \(v_at is not null and v_at <= now\(\) and not coalesce\(is_speaker_team\(null\), false\)\),/);
    assert.match(f, /ec\.type = 'speaker_lead'/);
    assert.match(f, /coalesce\(\(select sp\.lead_contact_id from speaker_profile sp where sp\.id = p_profile_id\),\s+\(select d\.id from edition_contact d where d\.edition_id = v_ed and d\.type = 'speaker_lead' and d\.is_default limit 1\)\)/);
    assert.doesNotMatch(f, /\binsert\b|\bupdate\b|\bdelete\b|log_audit/i, "nur lesend");
  });
});

describe("LEAD-065: der DB-Test hält die Regeln fest", () => {
  const test = () => quelle("supabase/tests/v6_shuttle_sperre.sql");

  it("15 Erwartungen im Muster `t_erw`, mit echtem Rollenwechsel (Speaker, Assistenz, Stage Lead, Team in drei Rollen) und der Rolle `authenticated`", () => {
    const t = test();
    const erw = t.slice(t.indexOf("insert into t_erw values"), t.indexOf("create function pg_temp.fahrt"));
    assert.equal((erw.match(/^\s+\('\d\d_[a-z_]+', /gm) ?? []).length, 15);
    assert.match(t, /set local role authenticated/);
    for (const rolle of ["'admin'", "'area_lead_speaker'", "'programme_team'", "'speaker_manager'"]) assert.ok(t.includes(rolle), rolle);
    assert.match(t, /assistant_person_id = v_pid/);
  });

  it("zu jeder Abweisung das Gegenstück: ohne Frist, in der Zukunft, andere Edition, Team; die Grenzen „genau jetzt“, Winter und Sommer, schon storniert", () => {
    const t = test();
    assert.match(t, /'02_ohne_frist', '\^ok fahrt=ok storno=ok locked=false lock_from_leer=true intern_gesperrt=false\$'/);
    assert.match(t, /frist_jetzt_gesperrt=true/);
    assert.match(t, /\\\| 2026-01-15 09:00 storno=P0001 shuttle_locked \\\| 2026-01-15 09:00/);
    assert.match(t, /sommer=2026-07-01 09:00/);
    assert.match(t, /\|\| ' sommer=' \|\| substr\(v_sommer, length\('P0001 shuttle_locked \| '\) \+ 1\)/, "der Sommertext wird gerechnet, nicht nur erwartet");
    assert.match(t, /storno_schon_storniert=P0001 shuttle_locked/);
    assert.match(t, /'09_andere_edition'/);
    assert.match(t, /'07_team_frei', '\^ok admin=ok area_lead_speaker=ok programme_team=ok/);
    assert.match(t, /'08_freigabe', '\^ok confirmed\$'/);
  });

  it("der Seed wird geprüft (Schritt 00) und die Frist des Tests entsteht nur in der Transaktion", () => {
    const t = test();
    assert.match(t, /'00_seed', '\^ok editionen=\[0-9\]\+ geseedet=\[0-9\]\+ gleich=true system_speaker_2099=true gesperrt=false beschriftet=true\$'/);
    assert.match(t, /\nrollback;\s*$/);
  });
});

describe("LEAD-065: Auswertung, Zeit und Hinweistext (ausgeführt)", () => {
  it("die Antwort der Funktion: erste Zeile, leere Texte werden NULL, alles andere ist kein Stand", () => {
    const zeile = { locked: true, lock_from: "2027-04-01T07:00:00Z", contact_name: "Paula", contact_phone: " ", contact_email: "p@chef-treff.de" };
    assert.deepEqual(sperreAusAntwort([zeile]), { locked: true, lock_from: "2027-04-01T07:00:00Z", contact_name: "Paula", contact_phone: null, contact_email: "p@chef-treff.de" });
    assert.deepEqual(sperreAusAntwort(zeile)?.locked, true);
    assert.equal(sperreAusAntwort(null), null);
    assert.equal(sperreAusAntwort([]), null);
    assert.equal(sperreAusAntwort([{ lock_from: "x" }]), null, "ohne `locked` ist es kein Stand");
    assert.equal(sperreAusAntwort("kaputt"), null);
  });

  it("die Zeit läuft (kein TypeError) und zeigt die Zeit der Veranstaltung — Sommer und Winter, deutsch und englisch; ein unlesbares Datum ergibt nichts", () => {
    assert.equal(sperrZeit("de-DE", "2027-04-01T07:00:00Z"), "01.04.2027, 09:00");
    assert.equal(sperrZeit("de-DE", "2027-01-15T08:00:00Z"), "15.01.2027, 09:00");
    assert.equal(sperrZeit("de-DE", "2027-03-31T22:30:00Z"), "01.04.2027, 00:30", "22:30 UTC ist in Berlin schon der nächste Tag — auch das Datum folgt der Zone");
    assert.equal(sperrZeit("en-GB", "2027-04-01T07:00:00Z"), "1 Apr 2027, 09:00");
    assert.equal(sperrZeit("de-DE", "kein Datum"), "");
  });

  it("deutsch: Zeitpunkt, zuständige Person aus dem Kontakt, Telefon und E-Mail — in dieser Reihenfolge", () => {
    const t = woerterbuch("de").speaker;
    assert.deepEqual(sperrHinweis(sperre(), "de-DE", t), {
      lead: "Seit 01.04.2027, 09:00 gehen neue Fahrten und Änderungen nicht mehr über das Portal.",
      kontakt: "Anfragen ab jetzt direkt über Paula Beispiel.",
      zeilen: ["Telefon: +49 40 5551234", "E-Mail: paula@chef-treff.de"],
    });
  });

  it("englisch: dieselben Teile aus dem englischen Wörterbuch", () => {
    const t = woerterbuch("en").speaker;
    assert.deepEqual(sperrHinweis(sperre(), "en-GB", t), {
      lead: "Since 1 Apr 2027, 09:00, new rides and changes are no longer taken in the portal.",
      kontakt: "Please send requests directly to Paula Beispiel from now on.",
      zeilen: ["Phone: +49 40 5551234", "Email: paula@chef-treff.de"],
    });
  });

  it("die Handynummer steht nur, wenn der Kontakt sie führt; ohne Kontakt steht „das Speaker-Team“, ohne Zeitpunkt der Satz ohne Datum", () => {
    const t = woerterbuch("de").speaker;
    assert.deepEqual(sperrHinweis(sperre({ contact_phone: null }), "de-DE", t).zeilen, ["E-Mail: paula@chef-treff.de"]);
    assert.deepEqual(sperrHinweis(sperre({ contact_phone: null, contact_email: null }), "de-DE", t).zeilen, []);
    const ohneKontakt = sperrHinweis(sperre({ contact_name: null }), "de-DE", t);
    assert.equal(ohneKontakt.kontakt, "Anfragen ab jetzt direkt über das Speaker-Team.");
    assert.deepEqual(ohneKontakt.zeilen, [], "ohne Namen keine Nummer und keine Adresse — sie gehörten niemandem");
    assert.equal(sperrHinweis(sperre({ lock_from: null }), "de-DE", t).lead, "Neue Fahrten und Änderungen gehen nicht mehr über das Portal.");
  });

  it("im Lead-Portal (`leads`-Texte) steht dieselbe Aussage ohne Kontakt", () => {
    const t = woerterbuch("de").leads;
    assert.deepEqual(sperrHinweis(sperre({ contact_name: null, contact_phone: null, contact_email: null }), "de-DE", t), {
      lead: "Seit 01.04.2027, 09:00 gehen neue Fahrten und Änderungen nicht mehr über das Portal.",
      kontakt: "Anfragen ab jetzt direkt über das Speaker-Team.",
      zeilen: [],
    });
  });

  it("niemand ist fest verdrahtet: weder ein Name noch eine Nummer steht im Code des Hinweises", () => {
    const ohneKommentare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
    for (const datei of [LIB, KARTE, LADER, ANSICHT, LEADS_ANSICHT]) {
      const text = ohneKommentare(quelle(datei));
      assert.doesNotMatch(text, /Paulina|\+49|@chef-treff\.de/, datei);
    }
  });
});

describe("LEAD-065: Wörterbücher und Fehlerschlüssel", () => {
  const sperrKeys = (gruppe: "speaker" | "leads", sprache: "de" | "en") =>
    Object.keys(woerterbuch(sprache)[gruppe]).filter((k) => k.startsWith("shuttleLocked")).sort();

  it("deutsch und englisch haben dieselben Schlüssel mit denselben Platzhaltern (sechs im Speaker-Portal, drei im Lead-Portal)", () => {
    for (const gruppe of ["speaker", "leads"] as const) {
      assert.deepEqual(sperrKeys(gruppe, "de"), sperrKeys(gruppe, "en"), gruppe);
    }
    assert.equal(sperrKeys("speaker", "de").length, 6);
    assert.equal(sperrKeys("leads", "de").length, 3);
    const p = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const gruppe of ["speaker", "leads"] as const) {
      for (const k of sperrKeys(gruppe, "de")) assert.equal(p(woerterbuch("de")[gruppe][k]), p(woerterbuch("en")[gruppe][k]), `${gruppe}.${k}`);
    }
  });

  it("jeder Schlüssel, den der Hinweis braucht, steht in beiden Gruppen, in denen er gebraucht wird", () => {
    const text = quelle(LIB);
    const gebraucht = [...text.matchAll(/t\.(shuttleLocked\w+)/g)].map((m) => m[1]);
    assert.ok(gebraucht.length >= 6);
    for (const k of new Set(gebraucht)) for (const s of ["de", "en"] as const) assert.ok(k in woerterbuch(s).speaker, `speaker.${k} (${s})`);
    for (const k of ["shuttleLockedLead", "shuttleLockedLeadNoDate", "shuttleLockedTeam"]) for (const s of ["de", "en"] as const) assert.ok(k in woerterbuch(s).leads, `leads.${k} (${s})`);
  });

  it("der Fehlerschlüssel `shuttle_locked` gehört zu den fachlichen Schlüsseln und hat in beiden Sprachen eine Meldung", () => {
    assert.match(quelle("lib/rpc-error.ts"), /\n  "shuttle_locked",\n/);
    for (const s of ["de", "en"] as const) assert.ok(String(woerterbuch(s).rpc.shuttle_locked).length > 20, s);
  });
});

describe("LEAD-065: die Seiten bieten bei einer Sperre weder Formular noch Stornieren an", () => {
  it("der Lader liest mit der Sitzung, antwortet bei einem Fehler mit `null` und meldet fehlendes Recht oder fehlende Anmeldung nicht ins Protokoll", () => {
    const l = quelle(LADER);
    assert.match(l, /^import "server-only";/);
    assert.match(l, /supabase\.rpc\("shuttle_lock_status", \{ p_profile_id: profileId \}\)/);
    assert.match(l, /if \(error\) \{\s+if \(error\.code !== "42501" && error\.code !== "28000"\) console\.error/);
    assert.match(l, /return null;\s+\}\s+return sperreAusAntwort\(data\);/);
  });

  it("Speaker-Seite: der Stand wird für das eigene Profil gelesen und an die Ansicht gegeben", () => {
    const s = quelle(SEITE);
    assert.match(s, /const sperre = await ladeShuttleSperre\(supabase, profile\.id\);/);
    assert.match(s, /<ShuttleView[\s\S]*?sperre=\{sperre\}/);
  });

  it("Speaker-Ansicht: gesperrt heißt kein Knopf „Fahrt anfragen“, kein Formular, kein Stornieren — und die Hinweiskarte mit dem Kontakt", () => {
    const a = quelle(ANSICHT);
    assert.match(a, /const gesperrt = sperre\?\.locked === true;/);
    assert.match(a, /\{!offen && !gesperrt && \(\s+<Button size="sm" onClick=\{\(\) => setOffen\(true\)\}[^>]*>\s+\{t\.shuttleAdd\}/);
    assert.match(a, /\{offen && !gesperrt && \(\s+<Card className="p-4">/);
    assert.match(a, /\{!gesperrt && \(\s+<Button\s+variant="ghost"\s+size="sm"\s+disabled=\{pending\}\s+onClick=\{\(\) => setAskCancel\(b\)\}/);
    assert.match(a, /\{gesperrt && sperre && <SperreHinweis hinweis=\{sperrHinweis\(sperre, dateLocale, t\)\} \/>\}/);
  });

  it("Lead-Seite: der Stand kommt für das erste betreute Profil, der Kontakt bleibt weg (er ist je Speaker zugeordnet) — das Team ist nie gesperrt", () => {
    const s = quelle(LEADS_SEITE);
    assert.match(s, /const stand = speakers\[0\] \? await ladeShuttleSperre\(supabase, speakers\[0\]\.profile_id\) : null;/);
    assert.match(s, /\{ \.\.\.stand, contact_name: null, contact_phone: null, contact_email: null \}/);
    assert.match(s, /<LeadShuttle[\s\S]*?sperre=\{sperre\}/);
  });

  it("Lead-Ansicht: kein Knopf, kein Formular, kein Stornieren in der Zeile; die Hinweiskarte steht darüber", () => {
    const a = quelle(LEADS_ANSICHT);
    assert.match(a, /const gesperrt = sperre\?\.locked === true;/);
    assert.match(a, /\{!offen && !gesperrt && \(\s+<Button size="sm" onClick=\{\(\) => setOffen\(true\)\} disabled=\{speakers\.length === 0\}>/);
    assert.match(a, /\{gesperrt && sperre && <SperreHinweis hinweis=\{sperrHinweis\(sperre, dateLocale, t\)\} \/>\}/);
    assert.match(a, /\{offen && !gesperrt && \(\s+<Card>/);
    assert.match(a, /\{r\.status !== "cancelled" && !gesperrt && \(\s+<Button/);
  });

  it("die Hinweiskarte ist ein Status (role=status) mit dem Satz, der zuständigen Person und den Wegen zu ihr", () => {
    const k = quelle(KARTE);
    assert.match(k, /role="status"/);
    assert.match(k, /<p>\{hinweis\.lead\}<\/p>/);
    assert.match(k, /<p className="ct-label mt-1">\{hinweis\.kontakt\}<\/p>/);
    assert.match(k, /\{hinweis\.zeilen\.length > 0 && <p className="mt-1 tabular-nums">\{hinweis\.zeilen\.join\(" · "\)\}<\/p>\}/);
  });
});

describe("LEAD-065: Admin-Weg, Testen und Doku", () => {
  it("die Frist liegt unter /admin/fristen (Speaker) — der Abschnitt gehört dem Speaker-Team; der Admin-Weg für Fahrten bleibt, die Sperre trifft ihn nicht", () => {
    assert.match(quelle("lib/admin-sections.ts"), /\{ key: "deadlinesSpeaker", path: "\/admin\/fristen\/speaker"/);
    const c = code(sql());
    assert.match(c, /not coalesce\(is_speaker_team\(null\), false\)/);
  });

  it("der Testleitfaden führt die Klickanleitung (Frist setzen, Seite ansehen, Frist zurücksetzen), die Doku der Testdaten sagt, dass es keinen Schritt gibt", () => {
    const leitfaden = quelle("docs/team-testleitfaden.md");
    assert.ok(/`\/speaker\/travel` Shuttle-Sperre \(LEAD-065, K-64\) \|[^\n]*Datum auf „jetzt“[^\n]*wieder auf 31\.12\.2099/.test(leitfaden), "Zeile Shuttle-Sperre im Testleitfaden");
    assert.ok(/\*\*Shuttle-Sperre \(LEAD-065, K-64\):\*\* kein Testdaten-Schritt/.test(quelle("docs/testdaten-konrad.md")), "Absatz in testdaten-konrad.md");
  });

  it("die README führt die Zeile des Tests, und die Backlog-Zeile LEAD-065 trägt die PR-Nummer", () => {
    assert.ok(/\| `v6_shuttle_sperre\.sql` \|/.test(quelle("supabase/tests/README.md")), "README-Zeile");
    assert.ok(/\| LEAD-065 \|[^\n]*\| P2 \|[^\n]*(geplant|gebaut|abgenommen) #\d+/.test(quelle("docs/feedback/speaker-leads.md")), "LEAD-065 ohne PR-Nummer");
  });
});
