import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { istVorschlag, migrationText } from "@/tests/migration-datei";
import { fehlendFuerFreigabe, partnerStatus } from "@/components/partner/standbuehne";
import { rueckgabeOffen } from "@/lib/partner/rueckgabe";

/**
 * PART-148 (c) — „Veröffentlichen anfragen“ und Zurücknehmen an der gebrandeten Bühne, Freigabeliste und Freigabe für Sessions ohne gespeicherte Organisation. Quelltext-Test: die Form der Migration, ihr
 * Eingriff gegen die Live-Fassung im Snapshot (solange sie ein Vorschlag ist) und die Oberfläche (Karte im Reiter „Speaker“, Knopf, Seite, Texte, Testdaten, Doku). Das Verhalten belegt der SQL-Test
 * `supabase/tests/v6_partner_publish_gebrandet.sql` — mit Rollenwechsel und einem Gegenstück zu jeder Abweisung. Die Entscheidung dahinter (Plan 10.10.): an der gebrandeten Bühne **nichts speichern**
 * und **keine Änderungsmail** (LEAD-063) — Anfrage, Liste und Freigabe leiten die Organisation über `session_partner_org` ab; nur die Standbühne speichert sie weiter.
 */

const NAME = "v6_partner_publish_gebrandet";
const migration = () => migrationText(NAME);
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** SQL ohne Kommentare: ein Satz, der etwas erwähnt, ist keine Anweisung. */
const sqlCode = (sql: string) => sql.replace(/--[^\n]*/g, "");
/** TypeScript ohne Kommentare. */
const code = (ts: string) => ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{?\/\/[^\n]*/g, "");

const SNAPSHOT = "supabase/snapshot/functions";
const snapshotText = (name: string) => readFileSync(`${SNAPSHOT}/${name}.sql`, "utf8");

const FUNKTIONEN = ["partner_request_publish", "partner_withdraw_publish", "partner_sessions_pending", "release_partner_session"] as const;

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

describe("PART-148 c: die Migration", () => {
  it("setzt den Pfad zuerst, endet mit der Härtung und definiert genau die vier Funktionen — keine Tabelle, kein Recht, keine Mail", () => {
    const sql = sqlCode(migration());
    const zeilen = sql.split("\n").map((z) => z.trim()).filter((z) => z !== "");
    assert.equal(zeilen[0], "set search_path = public, extensions;");
    assert.equal(zeilen.at(-1), "select harden_definer_functions();");
    assert.deepEqual([...funktionen(sql).keys()], [...FUNKTIONEN]);
    assert.ok(!migration().includes("$$;;"), "kein doppeltes Semikolon hinter einem Rumpf");
    // Außerhalb der Rümpfe nichts: keine Spalte, keine Tabelle, kein Recht, keine Zeile, kein Trigger — die vier Funktionen ändern nur ihre Prüfung und die Ableitung.
    const aussen = sql.replace(/\$\$[\s\S]*?\$\$/g, () => "<RUMPF>");
    assert.doesNotMatch(aussen, /\b(alter table|create table|drop |insert into|update |delete from|create trigger|create policy|grant |revoke )/i);
    // Keine Änderungsmail, an keiner Stelle (LEAD-063, Plan 10.10.): weder die Funktion der Änderungsmail noch das Einreihen einer Mail.
    assert.doesNotMatch(sql, /session_change_notify|session_change_queue|queue_mail|queue_speaker_mail/);
  });

  it("Anfrage und Zurücknehmen: Standbühne und gebrandete Bühne über `stage.kind`, nie über den Typ — und der Vergleich der Organisation geht über den Helfer", () => {
    const f = funktionen(sqlCode(migration()));
    for (const n of ["partner_request_publish", "partner_withdraw_publish"] as const) {
      const t = f.get(n) ?? "";
      assert.match(t, /coalesce\(v_stage\.kind, ''\) not in \('booth', 'branded'\)/, `${n}: Art der Bühne`);
      assert.doesNotMatch(t, /v_stage\.type|partner_booth/, `${n}: nicht mehr über den Typ`);
      assert.match(t, /v_stage\.partner_org_id is null/, `${n}: eine Bühne ohne Organisation ist keine`);
      assert.match(t, /not coalesce\(can_edit_slot\(v_se\.slot_id\), false\)/, `${n}: Recht des Boards am Slot`);
      assert.match(t, /coalesce\(session_partner_org\(p_session_id\), v_stage\.partner_org_id\) <> v_stage\.partner_org_id then/, `${n}: Organisation der Session gegen die der Bühne`);
      assert.doesNotMatch(t, /\b(se|v_se|s|sess)\.partner_org_id\b/, `${n}: keine eigene Ableitung neben dem Helfer`);
      assert.match(t, /raise exception 'not allowed' using errcode = '42501'/, n);
      assert.match(t, /raise exception 'session_not_found' using errcode = 'P0002'/, n);
      assert.match(t, /log_audit\(/, n);
    }
    // Der Gastgeber einer Anfrage darf nicht von der Bühne abweichen (wie bisher).
    assert.match(f.get("partner_request_publish") ?? "", /v_se\.host_org_id is not null and v_se\.host_org_id <> v_stage\.partner_org_id/);
  });

  it("die Anfrage setzt `review`, nie `published`, und speichert die Organisation **nur an der Standbühne** — an der gebrandeten Bühne bleibt sie, wie sie war", () => {
    const t = funktionen(sqlCode(migration())).get("partner_request_publish") ?? "";
    assert.match(t, /publish_status = 'review'/);
    assert.doesNotMatch(t, /publish_status = 'published'/);
    assert.match(t, /partner_org_id = case when v_stage\.kind = 'booth' then coalesce\(partner_org_id, v_stage\.partner_org_id\) else partner_org_id end,/);
    // Dieselben Pflichtfelder wie die Freigabe (`release_partner_session`), vorher und mit Namen.
    assert.match(t, /'title_de'/);
    assert.match(t, /'title_en'/);
    assert.match(t, /'description_de\|description_en'/);
    assert.match(t, /raise exception 'fields_required' using errcode = '22023'/);
    assert.match(t, /log_audit\('partner\.session_publish_requested'/);
    const zurueck = funktionen(sqlCode(migration())).get("partner_withdraw_publish") ?? "";
    assert.match(zurueck, /if v_se\.publish_status <> 'review' then return v_se\.publish_status; end if;/, "nur aus `review` zurück");
    assert.match(zurueck, /set publish_status = 'draft'/);
    assert.match(zurueck, /log_audit\('partner\.session_publish_withdrawn'/);
  });

  it("die Freigabeliste und die Freigabe des Teams leiten die Organisation ab — Spalte, Verbindung, Prüfung und Audit", () => {
    const f = funktionen(sqlCode(migration()));
    const liste = f.get("partner_sessions_pending") ?? "";
    assert.match(liste, /select se\.id, o\.id, coalesce\(o\.communication_name, o\.legal_name\)/);
    assert.match(liste, /join organization o on o\.id = session_partner_org\(se\.id\)/);
    assert.match(liste, /where se\.publish_status = 'review'/);
    assert.match(liste, /is_partner_team\(\)\s+or \(p_edition_id is not null and is_programme_editor\(p_edition_id\)\)/, "das Recht bleibt");
    assert.doesNotMatch(liste, /\bse\.partner_org_id\b/);
    const freigabe = f.get("release_partner_session") ?? "";
    assert.match(freigabe, /v_org := session_partner_org\(p_session_id\);\s+if v_org is null then\s+raise exception 'not_editable' using errcode = 'P0001', detail = 'not_a_partner_session';/);
    assert.match(freigabe, /jsonb_build_object\('org_id', v_org, 'note',/);
    assert.doesNotMatch(freigabe, /\bv_se\.partner_org_id\b/);
    // Das Recht steht vor der Prüfung auf die Partner-Session (wie bisher): wer nichts darf, erfährt nichts über die Session.
    assert.ok(freigabe.indexOf("is_partner_team() or is_programme_editor(v_se.event_id)") < freigabe.indexOf("v_org := session_partner_org"));
    assert.match(freigabe, /delete from partner_session_return where session_id = p_session_id/);
  });

  it("Eingriff gegen die Live-Fassung: genau die genannten Zeilen — solange die Migration ein Vorschlag ist", (t) => {
    if (!istVorschlag(NAME)) return t.skip("angewendet: der Snapshot ist maßgeblich");
    const neu = funktionen(migration());
    const erwartet: Record<(typeof FUNKTIONEN)[number], { weg: RegExp[]; dazu: RegExp[] }> = {
      partner_request_publish: {
        weg: [
          /^-- Nur Sessions auf der eigenen Standbühne, mit dem Recht des Boards auf diesen Slot\.$/,
          /^if v_stage\.id is null or v_stage\.type <> 'partner_booth' or v_stage\.partner_org_id is null$/,
          /^or \(v_se\.partner_org_id is not null and v_se\.partner_org_id <> v_stage\.partner_org_id\) then$/,
          /^-- Ohne Partner an der Session fände die Freigabeliste sie nicht/,
          /^partner_org_id = coalesce\(partner_org_id, v_stage\.partner_org_id\),$/,
        ],
        dazu: [
          /^-- Nur Sessions auf einer eigenen Bühne — Standbühne oder gebrandete Bühne/,
          /^-- der gebrandeten Bühne, `session_partner_org`\) darf von der der Bühne nicht abweichen\.$/,
          /^if v_stage\.id is null or coalesce\(v_stage\.kind, ''\) not in \('booth', 'branded'\) or v_stage\.partner_org_id is null$/,
          /^or coalesce\(session_partner_org\(p_session_id\), v_stage\.partner_org_id\) <> v_stage\.partner_org_id then$/,
          /^-- Die Standbühne speichert die Organisation wie bisher/,
          /^-- Freigabe leiten die Organisation ab, und eine gespeicherte gäbe der Session die Änderungsmail/,
          /^partner_org_id = case when v_stage\.kind = 'booth' then coalesce\(partner_org_id, v_stage\.partner_org_id\) else partner_org_id end,$/,
        ],
      },
      partner_withdraw_publish: {
        weg: [
          /^if v_stage\.id is null or v_stage\.type <> 'partner_booth' or v_stage\.partner_org_id is null$/,
          /^or \(v_se\.partner_org_id is not null and v_se\.partner_org_id <> v_stage\.partner_org_id\) then$/,
        ],
        dazu: [
          /^-- PART-148 c: Standbühne und gebrandete Bühne, wie bei der Anfrage\.$/,
          /^if v_stage\.id is null or coalesce\(v_stage\.kind, ''\) not in \('booth', 'branded'\) or v_stage\.partner_org_id is null$/,
          /^or coalesce\(session_partner_org\(p_session_id\), v_stage\.partner_org_id\) <> v_stage\.partner_org_id then$/,
        ],
      },
      partner_sessions_pending: {
        weg: [/^select se\.id, se\.partner_org_id, coalesce\(o\.communication_name, o\.legal_name\), se\.format, se\.title_de,$/, /^join organization o on o\.id = se\.partner_org_id$/],
        dazu: [
          /^select se\.id, o\.id, coalesce\(o\.communication_name, o\.legal_name\), se\.format, se\.title_de,$/,
          /^-- PART-148 c: die Organisation der Session abgeleitet/,
          /^join organization o on o\.id = session_partner_org\(se\.id\)$/,
        ],
      },
      release_partner_session: {
        weg: [/^declare v_se session; v_fehlt text\[\];$/, /^if v_se\.partner_org_id is null then$/, /^jsonb_build_object\('org_id', v_se\.partner_org_id, 'note', /],
        dazu: [
          /^declare v_se session; v_org uuid; v_fehlt text\[\];$/,
          /^-- PART-148 c: die Organisation abgeleitet/,
          /^v_org := session_partner_org\(p_session_id\);$/,
          /^if v_org is null then$/,
          /^jsonb_build_object\('org_id', v_org, 'note', /,
        ],
      },
    };
    for (const n of FUNKTIONEN) {
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

  it("der Helfer aus 0315 gibt es im Snapshot, und `partner_request_publish`/`partner_withdraw_publish` hängen nicht mehr an `partner_booth`", () => {
    assert.match(snapshotText("session_partner_org"), /st\.kind = 'branded'/);
    for (const n of ["partner_request_publish", "partner_withdraw_publish"] as const) {
      const t = sqlCode(funktionen(migration()).get(n) ?? "");
      assert.ok(t.includes("session_partner_org("), n);
    }
  });
});

describe("PART-148 c: Oberfläche — Karte, Knopf und Seite im Reiter „Speaker“", () => {
  const knopf = () => src("app/(partner)/partner/buehne/speaker/VeroeffentlichenKnopf.tsx");
  const karte = () => src("app/(partner)/partner/buehne/speaker/SessionKarte.tsx");
  const seite = () => src("app/(partner)/partner/buehne/speaker/page.tsx");

  it("der Knopf ruft die Anfrage und die Zurücknahme des Partnerportals auf — nie mit service_role", () => {
    const k = code(knopf());
    assert.match(k, /^"use client";/);
    assert.match(k, /import \{ requestStagePublish, withdrawStagePublish \} from "\.\.\/\.\.\/actions";/);
    assert.match(k, /await requestStagePublish\(sessionId\)/);
    assert.match(k, /await withdrawStagePublish\(sessionId\)/);
    assert.doesNotMatch(k, /service_role|createSupabaseAdminClient|SUPABASE_SECRET/);
    assert.doesNotMatch(k, /\.rpc\(/, "kein eigener Datenbankzugriff: die Server-Aktionen prüfen Bereich und Recht");
  });

  it("nur „in Bearbeitung“ und „zurückgegeben“ fragen an, nur „zur Freigabe“ nimmt zurück — sonst kein Knopf", () => {
    const k = code(knopf());
    assert.match(k, /if \(stand === "zur_freigabe"\) \{[\s\S]*?\{t\.withdraw\}[\s\S]*?\}\s+if \(stand !== "in_bearbeitung" && stand !== "zurueckgegeben"\) return null;/);
    assert.match(k, /\{t\.publish\}/);
    // Fehlt etwas, ist der Knopf aus — der Grund steht in der Karte und hängt über `aria-describedby` daran.
    assert.match(k, /disabled=\{pending \|\| gesperrt\}/);
    assert.match(k, /aria-describedby=\{gesperrt \? hinweisId : undefined\}/);
  });

  it("die Anfrage fragt zurück; scheitert sie, bleibt die Rückfrage offen und nennt die fehlenden Felder (ADM-062)", () => {
    const k = code(knopf());
    assert.match(k, /<ConfirmDialog[\s\S]*?title=\{t\.publishConfirmTitle\}[\s\S]*?body=\{t\.publishConfirmBody\}[\s\S]*?confirmLabel=\{t\.publishConfirm\}[\s\S]*?error=\{fehler\}/);
    assert.match(k, /res\.key === "fields_required"\s+\? t\.missingFields\.replace\("\{fields\}", fehlendAusDetail\(res\.detail\)\.map\(\(f\) => feldName\[f\]\)\.join\(", "\)\)/);
    // Bei einem Fehler wird die Rückfrage nicht geschlossen und kein Toast gezeigt — erst der Erfolg schließt und meldet.
    const senden = /function senden\(\) \{([\s\S]*?)\n  \}\n/.exec(k)?.[1] ?? "";
    assert.ok(senden.length > 0, "senden() nicht gefunden");
    assert.ok(senden.indexOf("schliessen()") > senden.indexOf("return;"), "geschlossen wird erst nach dem Fehlerzweig");
    assert.match(senden, /toast\("success", t\.publishDone\)/);
    assert.doesNotMatch(senden, /toast\("error"/);
    // Das Zurücknehmen braucht keine Rückfrage (es ändert nichts am Inhalt), ein Fehler dort ist ein Toast.
    assert.match(k, /toast\("success", t\.withdrawDone\)/);
    assert.match(k, /toast\("error", message\(res\.key, res\.detail\)\)/);
  });

  it("die Karte nimmt Stand, Rückgabe und Pflichtfelder aus `partner_format_sessions` — der Knopf nur für Bearbeiter und nur mit Zeile", () => {
    const k = code(karte());
    assert.match(k, /detail: PartnerFormatSession \| null;/);
    assert.match(k, /const rueckgabeZeile = detail && rueckgabeOffen\(detail\) \? detail : null;/);
    assert.match(k, /const status = detail\?\.publish_status \?\? x\.publishStatus \?\? "draft";/);
    assert.match(k, /partnerStatus\(\{ sessionId: x\.sessionId, publishStatus: status, returnNote: rueckgabeZeile\?\.return_note \}\)/);
    assert.match(k, /canEdit && detail && \(stand === "in_bearbeitung" \|\| stand === "zurueckgegeben"\) \? fehlendFuerFreigabe\(detail\) : \[\]/);
    assert.match(k, /\{canEdit && detail && \(\s+<VeroeffentlichenKnopf sessionId=\{x\.sessionId\} stand=\{stand\} gesperrt=\{fehlt\.length > 0\} hinweisId=\{hinweisId\} t=\{stage\} rpcMessages=\{rpcMessages\} \/>/);
    // Die Rückgabe steht in der Karte, der Grund fehlender Felder mit dem Weg in den Kalender — der Knopf hängt über die Kennung daran.
    assert.match(k, /\{rueckgabeZeile && \(\s+<RueckgabeHinweis note=\{rueckgabeZeile\.return_note\} returnedAt=\{rueckgabeZeile\.returned_at\} dateLocale=\{dateLocale\} t=\{rueckgabe\}/);
    assert.match(k, /\{fehlt\.length > 0 && \(\s+<p id=\{hinweisId\}/, "der Hinweis steht nur, wenn etwas fehlt");
    assert.match(k, /<p id=\{hinweisId\} className="ct-help mt-4">/);
    assert.match(k, /<Link href=\{kalenderHref\} className="ct-link">\s+\{stage\.speakersToCalendar\}/);
    assert.match(k, /const hinweisId = `veroeffentlichen-hinweis-\$\{x\.sessionId\}`;/);
    assert.doesNotMatch(k, /service_role|createSupabaseAdminClient|SUPABASE_SECRET/);
  });

  it("die Seite lädt die Zeilen der Organisation und reicht jedem Programmpunkt seine — und den Weg in den Kalender derselben Veranstaltung", () => {
    const s = code(seite());
    assert.match(s, /supabase\.rpc\("partner_format_sessions", args\)/);
    assert.match(s, /const details = new Map\(\(\(sessionRows \?\? \[\]\) as PartnerFormatSession\[\]\)\.map\(\(z\) => \[z\.id, z\]\)\);/);
    assert.match(s, /detail=\{details\.get\(x\.sessionId\) \?\? null\}/);
    assert.match(s, /kalenderHref=\{kalenderHref\}/);
    assert.match(s, /const kalenderHref = event \? `\$\{BASE\}\?event=\$\{encodeURIComponent\(event\)\}` : BASE;/);
    // Die Liste der Programmpunkte bleibt das Programm — das Team legt sie ohne Organisation an.
    assert.match(s, /buehnenSessions\(data\.rows, new Set\(gebrandet\.map\(\(s\) => s\.stage_id\)\)\)/);
  });

  it("die Aktionen laden nach der Anfrage auch den Reiter „Speaker“ und die Freigabeliste neu", () => {
    const a = src("app/(partner)/partner/actions.ts");
    const refresh = /function refreshStage\(\) \{([\s\S]*?)\n\}/.exec(a)?.[1] ?? "";
    assert.match(refresh, /revalidatePath\(`\$\{PATH\}\/buehne\/speaker`\)/);
    assert.match(refresh, /revalidatePath\(`\$\{PATH\}\/buehne`\)/);
    assert.match(refresh, /revalidatePath\("\/admin\/programm\/freigabe"\)/);
    assert.match(a, /rpc\("partner_request_publish", \{ p_session_id: sessionId \}\)/);
    assert.match(a, /rpc\("partner_withdraw_publish", \{ p_session_id: sessionId \}\)/);
  });
});

describe("PART-148 c: Stand aus Sicht des Partners (reine Logik der Karte)", () => {
  const voll = { title_de: "Titel", title_en: "Title", description_de: "Text", description_en: null };

  it("ein offener Rückgabegrund macht aus „in Bearbeitung“ „zurückgegeben“; nach einer neuen Anfrage ist die Programmleitung dran und der Grund zählt nicht mehr als offen", () => {
    const entwurf = { return_note: "Titel schärfen", returned_at: "2026-10-10T10:00:00Z", publish_status: "draft" };
    assert.equal(rueckgabeOffen(entwurf), true);
    assert.equal(partnerStatus({ sessionId: "s", publishStatus: "draft", returnNote: entwurf.return_note }), "zurueckgegeben");
    const angefragt = { ...entwurf, publish_status: "review" };
    assert.equal(rueckgabeOffen(angefragt), false);
    assert.equal(partnerStatus({ sessionId: "s", publishStatus: "review", returnNote: entwurf.return_note }), "zur_freigabe");
    assert.equal(partnerStatus({ sessionId: "s", publishStatus: "published" }), "veroeffentlicht");
    assert.equal(partnerStatus({ sessionId: "s", publishStatus: "draft" }), "in_bearbeitung");
  });

  it("was für die Anfrage fehlt, rechnet die Karte wie `partner_request_publish`: beide Titel und eine Beschreibung", () => {
    assert.deepEqual(fehlendFuerFreigabe(voll), []);
    assert.deepEqual(fehlendFuerFreigabe({ ...voll, title_en: "  " }), ["title_en"]);
    assert.deepEqual(fehlendFuerFreigabe({ ...voll, title_de: null, description_de: null }), ["title_de", "description"]);
    assert.deepEqual(fehlendFuerFreigabe({ ...voll, description_de: "", description_en: "Text" }), []);
  });
});

describe("PART-148 c: Texte", () => {
  const woerterbuch = (sprache: string) => JSON.parse(src(`lib/i18n/${sprache}.json`)) as Record<string, Record<string, Record<string, string> | string>>;

  it("der neue Schlüssel und die geänderten Hinweise stehen in beiden Sprachen; die alte Aussage „veröffentlicht das Programm-Team“ ist weg", () => {
    for (const sprache of ["de", "en"]) {
      const s = woerterbuch(sprache).partnerStage as Record<string, string>;
      assert.equal(typeof s.speakersToCalendar, "string", `${sprache}: speakersToCalendar`);
      for (const key of ["releaseHintBranded", "speakersHint", "speakersLead"]) assert.equal(typeof s[key], "string", `${sprache}: ${key}`);
    }
    const de = woerterbuch("de").partnerStage as Record<string, string>;
    const en = woerterbuch("en").partnerStage as Record<string, string>;
    assert.equal(de.speakersToCalendar, "Im Kalender ergänzen");
    for (const key of ["releaseHintBranded", "speakersHint"]) {
      assert.match(de[key], /„Veröffentlichen“/, `de.${key} nennt den Knopf`);
      assert.match(en[key], /“Publish”/, `en.${key} nennt den Knopf`);
      assert.doesNotMatch(de[key], /Veröffentlicht werden sie vom Programm-Team|veröffentlicht das Programm-Team/, `de.${key}: die alte Aussage`);
      assert.doesNotMatch(en[key], /Our programme team publishes/, `en.${key}: die alte Aussage`);
    }
    for (const key of ["releaseHintBranded", "speakersHint", "speakersLead", "speakersToCalendar"]) assert.doesNotMatch(de[key], /\bSie\b|\bIhr\b|\bIhre\b/, key);
  });

  it("die Freigabeliste des Teams heißt nicht mehr „Standbühnen“: sie zeigt auch die gebrandete Bühne", () => {
    const de = (woerterbuch("de").admin as Record<string, Record<string, string>>).programmeRelease;
    const en = (woerterbuch("en").admin as Record<string, Record<string, string>>).programmeRelease;
    assert.equal(de.partnerTitle, "Partnerbühnen");
    assert.equal(en.partnerTitle, "Partner stages");
    assert.match(de.partnerLead, /Standbühne oder gebrandeten Bühne/);
    assert.match(en.partnerLead, /booth or branded stage/);
    for (const k of ["partnerEmpty", "partnerEmptyBody", "partnerLead"]) assert.doesNotMatch(de[k], /Standbühnen/, `de.${k}`);
    for (const k of ["partnerEmpty", "partnerEmptyBody", "partnerLead"]) assert.doesNotMatch(en[k], /booth stages/, `en.${k}`);
  });
});

describe("PART-148 c: Testdaten, Test und Doku", () => {
  const skript = src("scripts/testdaten-konrad.mjs");
  const funktion = (name: string) => {
    const i = skript.indexOf(`async function ${name}(`);
    assert.ok(i >= 0, `${name} fehlt`);
    return code(skript.slice(i, skript.indexOf("\n}\n", i)));
  };

  it("der Schritt eurebuehne setzt beide Programmpunkte bei jedem Lauf zurück: Entwurf, ohne Rückgabe, ohne gespeicherte Organisation, Slot wie am Anfang, fehlende Felder ergänzt — nur ZZTEST-Sessions", () => {
    const f = funktion("eureBuehneSchritt");
    const zurueck = f.slice(f.indexOf("Veröffentlichung zurückgesetzt"));
    assert.match(zurueck, /\.eq\("id", sessionId\)\s*\.single\(\)/, "gelesen wird nur die eigene Session");
    assert.match(zurueck, /if \(se\.publish_status !== "draft"\) patch\.publish_status = "draft";/);
    assert.match(zurueck, /if \(se\.partner_org_id !== null\) patch\.partner_org_id = null;/);
    assert.match(zurueck, /if \(!se\.title_en\?\.trim\(\)\) patch\.title_en = /);
    assert.match(zurueck, /patch\.description_de = EURE_BUEHNE_BESCHREIBUNG/);
    assert.match(zurueck, /admin\.from\("partner_session_return"\)\.delete\(\)\.eq\("session_id", sessionId\)/);
    assert.match(zurueck, /admin\.from\("slot"\)\.update\(\{ status: "confirmed_title_open" \}\)\.eq\("id", se\.slot_id\)/);
    assert.doesNotMatch(zurueck, /\.delete\(\)\.eq\("event_id"|\.in\("id"/, "nie mehr als die beiden eigenen Sessions");
    // Die Programmpunkte tragen weiter das Kennzeichen ZZTEST (PREFIX) — daran hängt „nur Testdaten“.
    assert.match(skript, /titel: `\$\{PREFIX\}Eure Bühne: Programmpunkt mit Team-Speaker`/);
    assert.match(skript, /titel: `\$\{PREFIX\}Eure Bühne: Programmpunkt ohne Speaker`/);
    assert.match(f, /note\("Veröffentlichen ausprobieren \(PART-148 c\)"/);
  });

  it("der SQL-Test steht im README der Tests, mit Bezug auf PART-148, und schließt mit Auswertung und Rollback", () => {
    const readme = src("supabase/tests/README.md");
    const zeile = readme.split("\n").find((z) => z.includes("`v6_partner_publish_gebrandet.sql`")) ?? "";
    assert.match(zeile, /PART-148 c/);
    assert.match(zeile, /session_partner_org/);
    assert.match(zeile, /Vorschlag ohne Nummer|\| \d{4} \|/);
    const test = src("supabase/tests/v6_partner_publish_gebrandet.sql");
    assert.match(test, /\brollback;\s*$/);
    assert.match(test, /99_auswertung/);
    assert.match(test, /set local role/, "echter Rollenwechsel");
  });

  it("Doku: Testdaten-Absatz, Testleitfaden und Backlog nennen den Weg", () => {
    const td = src("docs/testdaten-konrad.md");
    assert.match(td, /`--apply --nur=eurebuehne` \(braucht `partner` und `partnerslots`/);
    assert.match(td, /\*\*Veröffentlichen \(PART-148 c, erst nach „Migration live“ von `v6_partner_publish_gebrandet`\):\*\*/);
    assert.match(td, /Jeder Lauf des Schritts setzt beide\s+Programmpunkte auf Entwurf zurück|Jeder Lauf des Schritts setzt beide Programmpunkte auf Entwurf zurück/);
    assert.match(src("docs/team-testleitfaden.md"), /\*\*Veröffentlichen \(PART-148 c\):\*\* auf der gebrandeten Bühne fragt „Veröffentlichen“/);
    const zeile = src("docs/feedback/partner.md").split("\n").find((z) => z.startsWith("| PART-148 ")) ?? "";
    assert.match(zeile, /\(c\): geplant #\d+|\(c\): gebaut #\d+/, "die Backlog-Zeile trägt die PR-Nummer von (c)");
    assert.match(zeile, /Teil B: gebaut #503/);
  });
});
