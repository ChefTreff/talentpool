import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { GEHEIME_VARS } from "@/lib/mail/geheimnisse";
import { fillVars, markdownToHtml, markdownToText } from "@/lib/mail/render";

/**
 * LEAD-063 / PART-124: Warteschlange mit Frist, Stornieren und die Änderungsmail für veröffentlichte Slots. Die Datenbank-Seite belegt
 * `supabase/tests/v6_mail_verzoegert.sql` (43 Erwartungen, echter Rollenwechsel, Gegenstücke zu jeder Abweisung); hier steht, was sich ohne
 * Datenbank festhalten lässt — und, wo es geht, **ausgeführt** wird: die Vorlagen werden mit den Variablen der Datenbank gerendert, die Liste
 * der Geheimnisse wird mit der in der Migration verglichen.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));
const sql = () => migrationText("v6_mail_verzoegert");
const code = (text: string) => text.replace(/--[^\n]*/g, "");

/** Der Text einer Funktion der Migration: von `create or replace function <name>(` bis zum nächsten `end $$;`. */
function funktion(text: string, name: string): string {
  const von = text.indexOf(`create or replace function ${name}(`);
  assert.ok(von >= 0, `${name} fehlt in der Migration`);
  const bis = text.indexOf("end $$;", von);
  const sprachBis = text.indexOf("\n$$;", von);
  const ende = [bis, sprachBis].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  assert.ok(ende !== undefined, `${name}: kein Ende gefunden`);
  return text.slice(von, ende);
}

type Vorlage = { subject: string; body: string };
/** Die vier Vorlagen aus Abschnitt 4 der Migration: `(key, locale, version, 'Betreff', E'Text', 'Beschreibung', true)`. */
function vorlagen(text: string): Map<string, Vorlage> {
  const abschnitt = text.slice(text.indexOf("-- === 4 · Vorlagen"), text.indexOf("-- === 5 · Rechte"));
  const treffer = abschnitt.matchAll(/\('([a-z_]+)', '(de|en)', 1, '((?:[^']|'')*)',\s*E'((?:[^'\\]|\\.|'')*)',/g);
  const aus = new Map<string, Vorlage>();
  for (const [, key, locale, subject, body] of treffer) {
    aus.set(`${key}/${locale}`, { subject: subject.replace(/''/g, "'"), body: body.replace(/''/g, "'").replace(/\\n/g, "\n") });
  }
  return aus;
}

describe("LEAD-063: der Versandlauf lädt nur fällige Zeilen", () => {
  const q = quelle("lib/mail/queue.ts");

  it("Zeilen mit `send_after` in der Zukunft bleiben liegen, alle anderen gehen wie bisher", () => {
    assert.match(
      q,
      /\.eq\("status", "queued"\)\s+\.or\(`send_after\.is\.null,send_after\.lte\.\$\{new Date\(\)\.toISOString\(\)\}`\)\s+\.order\("queued_at"\)\s+\.limit\(BATCH\)/,
    );
  });

  it("die reale Verzögerung steht im Kommentar: alle zehn Minuten, Frist bis Frist + 10", () => {
    assert.match(q, /alle[\s*]+zehn Minuten; die reale Verzögerung ist also die Frist bis Frist \+ 10 Minuten/);
  });

  it("der Cron läuft wirklich alle zehn Minuten (sonst stimmt die Aussage nicht)", () => {
    const cron = JSON.parse(quelle("vercel.json")) as { crons: { path: string; schedule: string }[] };
    assert.equal(cron.crons.find((c) => c.path === "/api/cron/mail")?.schedule, "*/10 * * * *");
  });
});

describe("LEAD-063: die Migration", () => {
  it("Kopf, Reihenfolge und Härtung stimmen", () => {
    const s = sql();
    assert.match(code(s).trimStart(), /^set search_path = public, extensions;/);
    assert.match(code(s).trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("Spalte `send_after` und Status `cancelled` im Check", () => {
    const s = sql();
    assert.match(s, /alter table mail_log add column if not exists send_after timestamptz;/);
    assert.match(s, /add constraint mail_log_status_check\s+check \(status in \('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'suppressed', 'cancelled'\)\);/);
  });

  it("`queue_mail` selbst bleibt unverändert (die Hilfsfunktionen setzen darauf auf)", () => {
    assert.doesNotMatch(code(sql()), /create or replace function queue_mail\(/);
    assert.doesNotMatch(code(sql()), /create or replace function queue_speaker_mail\(/);
  });

  it("alle zehn Funktionen sind für `authenticated` und `anon` gesperrt", () => {
    const s = code(sql());
    const namen = [
      "mail_locale_for\\(uuid\\)",
      "queue_mail_debounced\\(text, uuid, jsonb, text, uuid, interval, text\\)",
      "queue_speaker_mail_debounced\\(text, uuid, jsonb, text, uuid, interval, text\\)",
      "cancel_queued_mail\\(text, uuid, uuid, text\\)",
      "session_change_state\\(text, text, uuid\\)",
      "session_change_lines\\(jsonb, jsonb, text, text\\)",
      "session_change_queue\\(text, uuid, uuid, uuid, uuid, jsonb, jsonb, text, text\\)",
      "session_change_notify\\(uuid, jsonb, jsonb\\)",
      "slot_session_change_mail\\(\\)",
      "session_change_mail\\(\\)",
    ];
    for (const n of namen) {
      assert.match(s, new RegExp(`revoke execute on function ${n} from public, anon, authenticated;`), n);
    }
  });

  it("die beiden Trigger hören auf genau die Spalten, die eine Änderung ausmachen", () => {
    const s = code(sql());
    assert.match(s, /create trigger trg_slot_session_change_mail after update of start_at, end_at, stage_id on slot\s+for each row execute function slot_session_change_mail\(\);/);
    assert.match(s, /create trigger trg_session_change_mail after update of title_de, title_en, slot_id on session\s+for each row execute function session_change_mail\(\);/);
  });

  it("nur eine handelnde Person löst etwas aus, nur veröffentlichte Sessions, und der Mailweg bricht nie ab", () => {
    const s = code(sql());
    assert.match(funktion(s, "session_change_notify"), /if current_person_id\(\) is null then return; end if;/);
    assert.match(funktion(s, "session_change_notify"), /publish_status is distinct from 'published'/);
    // beide Trigger-Funktionen fangen Fehler ab (Warnung statt Abbruch)
    assert.match(funktion(s, "slot_session_change_mail"), /exception when others then[\s\S]+raise warning 'slot_session_change_mail/);
    assert.match(funktion(s, "session_change_mail"), /exception when others then[\s\S]+raise warning 'session_change_mail/);
    // die Veröffentlichung selbst ist keine Änderung: der Trigger auf session verlangt vorher UND nachher „veröffentlicht“
    assert.match(
      funktion(s, "session_change_mail"),
      /if old\.publish_status is distinct from 'published' or new\.publish_status is distinct from 'published' then\s+return coalesce\(new, old\);/,
    );
  });

  it("die Frist von 15 Minuten steht in der Datenbank und in den Texten des Boards — und nirgends sonst abweichend", () => {
    const s = code(sql());
    assert.equal((funktion(s, "session_change_queue").match(/interval '15 minutes'/g) ?? []).length, 2);
    assert.doesNotMatch(funktion(s, "session_change_queue"), /interval '(?!15 minutes)\d+ /);
    for (const [sprache, muster] of [["de", /15 Minuten/], ["en", /15 minutes/]] as const) {
      const programm = woerterbuch(sprache).admin.programme;
      assert.match(programm.confirmMoveBody, muster, `${sprache}.admin.programme.confirmMoveBody`);
      assert.match(programm.dragConfirmPublished, muster, `${sprache}.admin.programme.dragConfirmPublished`);
    }
  });

  it("`cancel_queued_mail` entfernt genau die Geheimnisse aus lib/mail/geheimnisse.ts — und `side_event_token` ist die einzige", () => {
    const f = funktion(sql(), "cancel_queued_mail");
    const entfernt = [...f.matchAll(/ - '([a-z_]+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(entfernt, [...GEHEIME_VARS].sort());
  });

  it("die Gründe, die die Migration vergibt, haben im Mail-Protokoll eine Beschriftung", () => {
    const s = code(sql());
    const gruende = new Set([...s.matchAll(/cancel_queued_mail\([^;]*?, '([a-z_]+)'\)/g)].map((m) => m[1]));
    assert.deepEqual([...gruende].sort(), ["no_longer_recipient", "unchanged"]);
    for (const sprache of ["de", "en"] as const) {
      const log = woerterbuch(sprache).adminMailLog;
      for (const g of gruende) assert.equal(typeof log[`cancelReason_${g}`], "string", `${sprache}.adminMailLog.cancelReason_${g}`);
    }
  });
});

describe("LEAD-063: die Vorlagen", () => {
  const v = vorlagen(sql());
  const BEKANNT = new Set(["first_name", "portal_url", "session_title", "event_name", "changes", "org_name"]);

  it("vier Vorlagen: Speaker und Partner, je Deutsch und Englisch", () => {
    assert.deepEqual([...v.keys()].sort(), ["session_changed/de", "session_changed/en", "session_changed_partner/de", "session_changed_partner/en"]);
  });

  it("jeder Platzhalter wird geliefert — und nur der Partner-Text kennt `org_name`", () => {
    const geliefert = funktion(code(sql()), "session_change_queue");
    for (const k of ["session_title", "event_name", "changes", "org_name"]) assert.match(geliefert, new RegExp(`'${k}'`), k);
    for (const [name, vorlage] of v) {
      const platzhalter = new Set([...(vorlage.subject + vorlage.body).matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)].map((m) => m[1]));
      for (const p of platzhalter) assert.ok(BEKANNT.has(p), `${name}: unbekannter Platzhalter ${p}`);
      assert.equal(platzhalter.has("org_name"), name.startsWith("session_changed_partner"), `${name}: org_name`);
      assert.ok(platzhalter.has("changes") && platzhalter.has("session_title"), `${name}: Änderung und Titel gehören hinein`);
    }
  });

  it("gerendert mit dem, was die Datenbank liefert: Liste der Änderungen, kein Platzhalter bleibt stehen, Link ins Portal", () => {
    const vars = {
      first_name: "Ana",
      portal_url: "https://portal.example",
      session_title: "Führung im Wandel",
      event_name: "Future Leader Summit 2027",
      org_name: "Muster GmbH",
      changes:
        "- **Zeit:** bisher 16.04.2027, 20:00–20:30 Uhr, jetzt 16.04.2027, 21:00–21:30 Uhr\n- **Bühne:** bisher Main Stage, jetzt Industry Stage",
    };
    for (const [name, vorlage] of v) {
      const md = fillVars(vorlage.body, vars);
      assert.doesNotMatch(md, /\{\{/, name);
      const html = markdownToHtml(md);
      // die Änderungen stehen als Liste mit fettem Etikett — genau ein Punkt je Zeile
      assert.equal((html.match(/<li>/g) ?? []).length, 2, `${name}: Listenpunkte`);
      assert.match(html, /<li><strong>(Zeit|Time):<\/strong> /, name);
      assert.match(html, /<strong>Führung im Wandel<\/strong>/, name);
      assert.match(html, name.startsWith("session_changed_partner") ? /portal\.example\/partner"/ : /portal\.example\/speaker"/, name);
      assert.match(markdownToText(md), /Industry Stage/, name);
      assert.doesNotMatch(fillVars(vorlage.subject, vars), /\{\{/, name);
    }
    assert.match(fillVars(v.get("session_changed_partner/de")!.subject, vars), /Muster GmbH/);
  });

  it("die Sprachen sind getrennt: der deutsche Text sagt „du“, der englische bleibt englisch", () => {
    for (const [name, vorlage] of v) {
      if (name.endsWith("/de")) assert.match(vorlage.body, /Hallo \{\{first_name\}\}/, name);
      else assert.match(vorlage.body, /Hi \{\{first_name\}\}/, name);
      assert.doesNotMatch(vorlage.body, name.endsWith("/de") ? /\bthe\b|\bplease\b/i : /\bund\b|\bbitte\b/i, name);
    }
  });
});

describe("LEAD-063: Mail-Protokoll im Admin zeigt „Storniert“ und die Frist", () => {
  const view = quelle("app/(admin)/admin/mail/ProtokollView.tsx");

  it("Status, Frist und Grund der Stornierung stehen im Detail", () => {
    assert.match(view, /cancelled: "neutral"/);
    assert.match(view, /send_after: string \| null;/);
    assert.match(view, /cancel_reason: string \| null;/);
    assert.match(view, /detail\.send_after && <Eintrag label=\{t\.detailSendAfter\}/);
    assert.match(view, /t\[`cancelReason_\$\{detail\.cancel_reason\}`\] \?\? detail\.cancel_reason/);
  });

  it("die Texte stehen in DE und EN", () => {
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache);
      assert.equal(typeof w.mailStatus.cancelled, "string", `${sprache}.mailStatus.cancelled`);
      for (const k of ["detailSendAfter", "detailCancelReason"]) assert.equal(typeof w.adminMailLog[k], "string", `${sprache}.adminMailLog.${k}`);
    }
  });

  it("der Hinweis beim Verschieben nennt die Mail in beiden Fassungen", () => {
    for (const [sprache, muster] of [["de", /Mail/], ["en", /email/]] as const) {
      const programm = woerterbuch(sprache).admin.programme;
      assert.match(programm.confirmMoveBody, muster, sprache);
      assert.match(programm.dragConfirmPublished, muster, sprache);
    }
  });
});

describe("LEAD-063: Testdaten, Doku und Test-Verzeichnis", () => {
  it("der Testdaten-Schritt `aenderungsmail` legt eine veröffentlichte TEST-Session an, prüft die Spalte und schreibt keine Mail", () => {
    const s = quelle("scripts/testdaten-konrad.mjs");
    assert.match(s, /aenderungsmail: aenderungsmailSchritt,/);
    const f = s.slice(s.indexOf("async function aenderungsmailSchritt"), s.indexOf("/** ADM-072: so erkennt man"));
    assert.match(f, /from\("mail_log"\)\.select\("send_after"\)/);
    assert.match(f, /publish_status: "published"/);
    assert.match(f, /title_de: AENDERUNG_TITEL/);
    assert.match(s, /const AENDERUNG_TITEL = `\$\{PREFIX\}/, "der Titel trägt das Präfix, `--remove` räumt ihn ab");
    assert.doesNotMatch(f, /from\("mail_log"\)\.(insert|update|delete)/);
  });

  it("der Weg für Konrad steht im Testleitfaden und in der Testdaten-Doku", () => {
    assert.match(quelle("docs/team-testleitfaden.md"), /Änderungsmail für veröffentlichte Slots \(LEAD-063\)/);
    assert.match(quelle("docs/testdaten-konrad.md"), /--apply --nur=aenderungsmail/);
  });

  it("Verzeichnis der Verarbeitungen, Mail-Plan und Test-README kennen die Änderung", () => {
    assert.match(quelle("docs/datenschutz-verarbeitungen.md"), /\| V18 \| \*\*Änderungsmail für veröffentlichte Programmpunkte\*\*/);
    const plan = quelle("docs/mail-plan.md");
    assert.match(plan, /`session_changed` · `session_changed_partner`/);
    assert.match(plan, /\*\*Verzögerte Mails\*\* \(LEAD-063, PART-124/);
    assert.match(quelle("supabase/tests/README.md"), /\| `v6_mail_verzoegert\.sql` \|/);
  });

  it("der Datenbank-Test liegt dabei und prüft die Wege, die diese Seite voraussetzt", () => {
    const t = quelle("supabase/tests/v6_mail_verzoegert.sql");
    for (const schritt of ["06_zurueck_storniert", "06_buehne_ueber_move_slot", "06_fehler_im_mailweg", "02_rechte", "03_token_entfernt", "06_partner"]) {
      assert.match(t, new RegExp(`'${schritt}'`), schritt);
    }
  });
});
