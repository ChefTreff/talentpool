import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { LOUNGE_SPALTEN, loungeBerechtigte, type LoungeQuelle } from "@/lib/speaker/lounge-liste";
import { begleitungen } from "@/app/(speaker)/speaker/tickets/types";

/**
 * ADM-076 (Konrad und Paulina 05.10.): Speaker-Tickets final — Begleittickets beliebig (Kontingent je Speaker), Lounge je
 * Ticket, das Team legt an, Gesamtliste fürs Personal. Die Datenbank-Seite belegt `supabase/tests/v6_speaker_tickets_final.sql`
 * (echter Rollenwechsel, 46 Erwartungen mit Auswertung, drei Mutationsproben); hier steht, was sich ohne Datenbank festhalten
 * lässt.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

describe("ADM-076: die Migration `v6_speaker_tickets_final`", () => {
  const sql = () => migrationText("v6_speaker_tickets_final");

  it("Kontingent je Speaker: Spalte 0–50 mit Standard 1, der alte Unique-Index fällt, ein Teilindex je Begleitung kommt", () => {
    const c = code(sql());
    assert.match(c, /add column if not exists companion_quota integer not null default 1 check \(companion_quota between 0 and 50\)/);
    assert.match(c, /drop index if exists ticket_speaker_companion_uidx;/);
    assert.match(c, /create unique index if not exists ticket_speaker_companion_email_uidx\s+on ticket \(speaker_profile_id, lower\(holder_email::text\)\)\s+where source = 'speaker_companion' and status <> 'cancelled';/);
  });

  it("Anfragen und Anlegen werfen `companion_exists` und `quota_exceeded` als P0001 — nie 23505", () => {
    const c = code(sql());
    assert.equal((c.match(/raise exception 'companion_exists' using errcode = 'P0001'/g) ?? []).length, 2, "Anfrage und Team-Funktion");
    assert.equal((c.match(/raise exception 'quota_exceeded' using errcode = 'P0001', detail = v_sp\.companion_quota::text/g) ?? []).length, 2);
    assert.doesNotMatch(c, /23505/);
    // Dublette vor Kontingent: die genauere Meldung zuerst
    const anfrage = c.slice(c.indexOf("create or replace function request_companion_ticket"), c.indexOf("create or replace function team_add_companion_ticket"));
    assert.ok(anfrage.indexOf("companion_exists") < anfrage.indexOf("quota_exceeded"));
    // gezählt unter dem `for update` auf dem Profil
    assert.match(anfrage, /select \* into v_sp from speaker_profile where id = p_profile_id for update;/);
  });

  it("alle neuen Team-Funktionen prüfen das Speaker-Team, die Lesefunktion mit Edition", () => {
    const c = code(sql());
    for (const f of ["team_add_companion_ticket", "set_companion_quota", "set_ticket_lounge"]) {
      const koerper = c.slice(c.indexOf(`create or replace function ${f}`), c.indexOf("end $$;", c.indexOf(`create or replace function ${f}`)));
      assert.match(koerper, /if not coalesce\(is_speaker_team\(null\), false\) then raise exception 'not allowed' using errcode = '42501'/, f);
    }
    const lesen = c.slice(c.indexOf("create or replace function speaker_ticket_quotas"));
    assert.match(lesen, /if not coalesce\(is_speaker_team\(p_edition_id\), false\) then raise exception 'not allowed' using errcode = '42501'/);
    assert.match(lesen, /\bstable\b/);
  });

  it("Audit mit person_id, alt und neu — und nie mit der Begleitung (keine E-Mail, keine Namen)", () => {
    const c = code(sql());
    const aufrufe = [...c.matchAll(/perform log_audit\(([^;]*?)\);/g)].map((m) => m[1]);
    const neue = aufrufe.filter((a) => /ticket\.(companion_added_by_team|companion_quota_set|lounge_set)/.test(a));
    assert.equal(neue.length, 3, "drei neue Audit-Aufrufe");
    for (const a of neue) {
      assert.match(a, /'person_id', v_sp\.person_id/, a);
      assert.doesNotMatch(a, /email|v_email|v_first|v_last|holder_|p_first_name|p_last_name/i, `Audit ohne Begleitung: ${a}`);
    }
    assert.match(neue.find((a) => a.includes("quota_set")) ?? "", /jsonb_build_object\('person_id', v_sp\.person_id, 'quota', v_sp\.companion_quota\),\s+jsonb_build_object\('person_id', v_sp\.person_id, 'quota', p_quota/);
    assert.match(neue.find((a) => a.includes("lounge_set")) ?? "", /'lounge', v_t\.lounge_access\),\s+jsonb_build_object\('person_id', v_sp\.person_id, 'lounge', p_lounge/);
  });

  it("die Mail an den Speaker-Mail-Empfänger nennt die Adresse der Begleitung nicht", () => {
    const c = code(sql());
    const mail = c.slice(c.indexOf("perform queue_speaker_mail('companion_ticket_confirmed'"));
    const aufruf = mail.slice(0, mail.indexOf(");") + 2);
    assert.match(aufruf, /jsonb_build_object\('companion_name', v_first \|\| ' ' \|\| v_last, 'note', ''\)/);
    assert.doesNotMatch(aufruf, /email/i);
    // die Vorlage verliert den Platzhalter — nur wenn der Satz noch dasteht, wer sie angepasst hat, behält seine Fassung
    assert.match(c, /where key = 'companion_ticket_confirmed' and locale = 'de'\s+and body_md like '%Wir stellen das Ticket aus und schicken es an \{\{companion_email\}\}\.%'/);
    assert.match(c, /where key = 'companion_ticket_confirmed' and locale = 'en'\s+and body_md like '%We issue the ticket and send it to \{\{companion_email\}\}\.%'/);
  });

  it("auch das Bestätigen einer angefragten Begleitung gibt die Adresse nicht in die Mail-Variablen (`mail_log.meta.vars` ist Klartext)", () => {
    const c = code(sql());
    const f = c.slice(c.indexOf("create or replace function confirm_companion_ticket"));
    const mail = f.slice(f.indexOf("perform queue_speaker_mail('companion_ticket_confirmed'"), f.indexOf("perform log_audit('ticket.companion_approved'"));
    assert.ok(mail.startsWith("perform queue_speaker_mail"), "der Mailaufruf");
    assert.doesNotMatch(mail, /email/i);
    assert.match(mail, /jsonb_build_object\('companion_name', btrim\(coalesce\(v_t\.holder_first_name, ''\) \|\| ' ' \|\| coalesce\(v_t\.holder_last_name, ''\)\),\s+'note', coalesce\(nullif\(btrim\(p_note\), ''\), ''\)\)/);
    // sonst unverändert: Rechte- und Statusprüfung stehen noch da
    assert.match(f, /if not is_speaker_team\(v_sp\.edition_id\) then raise exception 'not allowed' using errcode = '42501'; end if;/);
    assert.match(f, /if v_t\.status <> 'requested' then raise exception 'not_pending'/);
  });

  it("Lounge: eine Quelle je Ticketart — am eigenen Ticket das Profil-Flag (auch ausgestellt), `set_ticket_lounge` nur Begleitung", () => {
    const c = code(sql());
    assert.match(c, /if v_t\.source <> 'speaker_companion' then raise exception 'not_a_companion' using errcode = 'P0001', detail = v_t\.source;/);
    assert.match(c, /if v_t\.status = 'cancelled' then raise exception 'ticket_cancelled'/);
    const sync = c.slice(c.indexOf("create or replace function speaker_profile_tickets_sync"), c.indexOf("create or replace function my_speaker_tickets"));
    // Lounge: nur das eigene Ticket, in jedem lebenden Stand
    assert.match(sync, /update ticket set lounge_access = new\.lounge_access\s+where speaker_profile_id = new\.id and source = 'speaker' and status in \('requested', 'approved', 'valid'\);/);
    // der Pass-Typ bleibt bei requested/approved (steckt im vivenu-Tickettyp)
    assert.match(sync, /update ticket set pass_type = new\.pass_type\s+where speaker_profile_id = new\.id and source in \('speaker', 'speaker_companion'\) and status in \('requested', 'approved'\);/);
  });

  it("Gäste der Standbühne und nicht bestätigte Speaker bekommen keine Begleitung angelegt", () => {
    const c = code(sql());
    const team = c.slice(c.indexOf("create or replace function team_add_companion_ticket"), c.indexOf("create or replace function set_companion_quota"));
    assert.match(team, /if v_sp\.stage_guest then raise exception 'not_eligible' using errcode = 'P0001', detail = 'stage_guest'/);
    assert.match(team, /if not speaker_is_confirmed\(v_sp\.pipeline_status\) then raise exception 'not_eligible'/);
    // direkt `approved`, vom Team
    assert.match(team, /'approved', 'partial', 0, 'speaker_companion', v_me, v_me, now\(\)/);
  });

  it("Kontingent: 0 bis 50, nicht unter die vergebenen, gleicher Wert schreibt kein Audit", () => {
    const c = code(sql());
    const q = c.slice(c.indexOf("create or replace function set_companion_quota"), c.indexOf("create or replace function set_ticket_lounge"));
    assert.match(q, /p_quota is null or p_quota < 0 or p_quota > 50 then raise exception 'invalid_quota' using errcode = '22023'/);
    assert.match(q, /if p_quota < v_used then raise exception 'quota_below_used' using errcode = 'P0001', detail = v_used::text/);
    assert.ok(q.indexOf("if p_quota = v_sp.companion_quota then return; end if;") < q.indexOf("perform log_audit"));
  });

  it("`my_speaker_tickets` bleibt für alte App-Stände lesbar und kommt additiv um Liste und Kontingent", () => {
    const c = code(sql());
    const m = c.slice(c.indexOf("create or replace function my_speaker_tickets"), c.indexOf("-- === 10"));
    for (const schluessel of ["'own'", "'companion'", "'companion_history'", "'companions'", "'companion_quota'", "'companion_used'"]) {
      assert.ok(m.includes(schluessel), schluessel);
    }
    // die Liste: älteste zuerst, mit Lounge je Begleitung
    assert.match(m, /jsonb_agg\(to_jsonb\(x\) order by x\.created_at, x\.id\)/);
    assert.match(m, /\(t\.barcode is not null\) as issued, t\.lounge_access\s+from ticket t/);
  });

  it("Eingaben: E-Mail-Format und Länge, Namen und Länge — in Anfrage und Team-Funktion gleich", () => {
    const c = code(sql());
    assert.equal((c.match(/or char_length\(v_email::text\) > 254 then raise exception 'invalid_email' using errcode = '22023'/g) ?? []).length, 2);
    assert.equal((c.match(/if char_length\(v_first\) > 100 or char_length\(v_last\) > 100 then raise exception 'too_long' using errcode = '22023', detail = 'name'/g) ?? []).length, 2);
    assert.equal((c.match(/raise exception 'companion_is_speaker' using errcode = '22023'/g) ?? []).length, 2);
  });

  it("Löschweg: `anonymize_person` leert die Begleittickets der Profile der Person — und nur die", () => {
    const f = code(sql());
    const anonym = f.slice(f.indexOf("create or replace function anonymize_person"));
    assert.ok(anonym.includes("select array_agg(sp.id) into v_profile from speaker_profile sp where sp.person_id = p_person_id;"), "die Profile der Person");
    // die bestehende Anweisung für Tickets mit person_id und direkt dahinter die neue für Begleittickets am Profil
    assert.match(
      anonym,
      /where person_id = p_person_id;\s+update ticket set holder_email = null, holder_first_name = null, holder_last_name = null,\s+holder_company = null, holder_position = null, buyer_email = null,\s+team_note = null, extra_fields = '\{\}'::jsonb\s+where source = 'speaker_companion' and speaker_profile_id = any \(v_profile\);/,
    );
    // kein Statuswechsel, kein Löschen: Anzahl, Pass und Lounge bleiben
    const neu = anonym.match(/update ticket set [^;]*where source = 'speaker_companion'[^;]*;/)?.[0] ?? "";
    assert.ok(neu, "die neue Anweisung");
    assert.doesNotMatch(neu, /\bstatus\s*=|lounge_access\s*=|pass_type\s*=/);
    assert.doesNotMatch(anonym, /delete from ticket\b/);
  });

  it("endet mit harden_definer_functions", () => {
    assert.match(code(sql()).trim(), /select harden_definer_functions\(\);$/);
  });
});

describe("ADM-076: die Lounge-Liste fürs Personal", () => {
  const tickets: LoungeQuelle[] = [
    { source: "speaker", status: "valid", lounge_access: true, speaker_name: "Mara Beispiel", holder_first_name: "Mara", holder_last_name: "Beispiel", pass_type: "speaker" },
    { source: "speaker_companion", status: "approved", lounge_access: true, speaker_name: "Mara Beispiel", holder_first_name: "Ben", holder_last_name: "Zwei", pass_type: "speaker" },
    { source: "speaker_companion", status: "valid", lounge_access: false, speaker_name: "Mara Beispiel", holder_first_name: "Clara", holder_last_name: "Drei", pass_type: "speaker" },
    { source: "speaker_companion", status: "cancelled", lounge_access: true, speaker_name: "Mara Beispiel", holder_first_name: "Dora", holder_last_name: "Vier", pass_type: "speaker" },
    { source: "speaker", status: "requested", lounge_access: true, speaker_name: "Adam Anfang", holder_first_name: null, holder_last_name: null, pass_type: null },
    { source: "vivenu", status: "valid", lounge_access: true, speaker_name: "Fremd", holder_first_name: "X", holder_last_name: "Y", pass_type: "x" },
  ];

  it("nur lebende Tickets mit Lounge von Speakern und Begleitungen — nie storniert, nie ohne Lounge, nie fremde Quellen", () => {
    const z = loungeBerechtigte(tickets);
    assert.deepEqual(z.map((x) => x.name), ["Adam Anfang", "Mara Beispiel", "Ben Zwei"]);
  });

  it("sortiert nach Speaker, er selbst vor seiner Begleitung; Namen ohne Halter fallen auf den Speaker zurück", () => {
    const z = loungeBerechtigte(tickets);
    assert.deepEqual(z.map((x) => `${x.speaker}/${x.art}`), ["Adam Anfang/Speaker", "Mara Beispiel/Speaker", "Mara Beispiel/Begleitung"]);
  });

  it("der Stand steht in Worten, der Pass leer statt „null“", () => {
    const z = loungeBerechtigte(tickets);
    assert.deepEqual(z.map((x) => x.stand), ["beantragt", "ausgestellt", "freigegeben"]);
    assert.equal(z[0].pass, "");
  });

  it("Datenminimierung: Name, Art, Speaker, Ticket, Pass — keine E-Mail, kein Barcode", () => {
    assert.deepEqual(LOUNGE_SPALTEN.map((c) => c.label), ["Name", "Art", "Speaker", "Ticket", "Pass"]);
    const z = loungeBerechtigte([{ ...tickets[0], speaker_name: "Mara" }]);
    const alles = JSON.stringify(z) + LOUNGE_SPALTEN.map((c) => c.wert(z[0])).join("|");
    assert.doesNotMatch(alles, /@|barcode|email/i);
  });

  it("die Route hinter dem Abschnitts-Tor, Zellen über csvCell, Semikolon, BOM, kein E-Mail-Feld", () => {
    const r = quelle("app/(admin)/admin/speaker-tickets/lounge-liste/route.ts");
    assert.match(r, /await requireAdminSection\("speakerTickets", "\/admin\/speaker-tickets"\)/);
    assert.match(r, /rpc\("speaker_tickets_admin"\)/);
    assert.match(r, /csvCell\(c\.label\)\)\.join\(";"\)/);
    assert.match(r, /csvCell\(c\.wert\(z\)\)\)\.join\(";"\)/);
    assert.match(r, /\\uFEFF/);
    assert.match(r, /"cache-control": "no-store"/);
    assert.doesNotMatch(r.replace(/\/\*[\s\S]*?\*\//g, ""), /holder_email|email/i);
    assert.match(r, /error\.code === "42501" \? 403 : 500/);
  });
});

describe("ADM-076: Speaker-Portal mit mehreren Begleitungen", () => {
  const tix = (extra: Partial<Parameters<typeof begleitungen>[0]>) => ({ companion: null, ...extra });
  const c = (id: string) => ({ id, status: "requested", pass_type: null, first_name: "A", last_name: "B", email: null, team_note: null, created_at: "", approved_at: null, issued_at: null, issued: false });

  it("mit den neuen Feldern: alle Begleitungen, Kontingent und was vergeben ist", () => {
    const b = begleitungen(tix({ companions: [c("1"), c("2")], companion_quota: 3, companion_used: 2 }));
    assert.equal(b.liste.length, 2);
    assert.equal(b.kontingent, 3);
    assert.equal(b.vergeben, 2);
    assert.equal(b.kannAnfragen, true);
  });

  it("voll heißt: nichts mehr anfragen; Kontingent 0 ebenso", () => {
    assert.equal(begleitungen(tix({ companions: [c("1")], companion_quota: 1, companion_used: 1 })).kannAnfragen, false);
    assert.equal(begleitungen(tix({ companions: [], companion_quota: 0, companion_used: 0 })).kannAnfragen, false);
  });

  it("Rückfall ohne die neuen Felder (Migration noch nicht live): genau eine Begleitung, Kontingent 1", () => {
    const keine = begleitungen(tix({}));
    assert.deepEqual([keine.liste.length, keine.kontingent, keine.vergeben, keine.kannAnfragen], [0, 1, 0, true]);
    const eine = begleitungen(tix({ companion: c("1") }));
    assert.deepEqual([eine.liste.length, eine.kontingent, eine.vergeben, eine.kannAnfragen], [1, 1, 1, false]);
  });

  it("die Ansicht zeigt die Zeile „x von y“, die Liste, und das Formular nur mit Kontingent — sonst den Grund", () => {
    const v = quelle("app/(speaker)/speaker/tickets/TicketsView.tsx");
    assert.match(v, /const \{ liste: companions, kontingent, vergeben, kannAnfragen \} = begleitungen\(tickets\);/);
    assert.match(v, /t\.companionQuotaLine\.replace\("\{used\}", String\(vergeben\)\)\.replace\("\{quota\}", String\(kontingent\)\)/);
    assert.match(v, /\{companions\.map\(\(companion\) => \(/);
    assert.match(v, /\{!kannAnfragen \? \(\s+<p className="ct-help mt-4">\{kontingent === 0 \? t\.companionQuotaNone : t\.companionQuotaFull\}<\/p>/);
    // Zurückziehen je Begleitung, nicht „die eine“
    assert.match(v, /onClick=\{\(\) => setAskCancel\(companion\)\}/);
    assert.match(v, /onConfirm=\{\(\) => onCancel\(askCancel\)\}/);
    // die Lounge der Begleitung steht am Ticket, nicht am Profil
    assert.match(v, /\{companion\.lounge_access && <Badge tone="accent">\{t\.loungeBadge\}<\/Badge>\}/);
  });
});

describe("ADM-076: Admin-Seite", () => {
  it("jede Aktion läuft über die Sitzung hinter dem Abschnitts-Tor — und fasst vivenu nicht an", () => {
    const a = quelle("app/(admin)/admin/speaker-tickets/actions.ts");
    const neu = a.slice(a.indexOf("// === ADM-076"));
    assert.match(neu, /await requireAdminSection\("speakerTickets", TICKETS_PFAD\);\s+return createSupabaseServerClient\(\);/);
    for (const [aktion, rpc] of [
      ["teamAddCompanionTicket", "team_add_companion_ticket"],
      ["setCompanionQuota", "set_companion_quota"],
      ["setCompanionLounge", "set_ticket_lounge"],
      ["setSpeakerLounge", "update_speaker"],
      ["cancelCompanionTicket", "cancel_companion_ticket"],
    ]) {
      assert.match(neu, new RegExp(`export async function ${aktion}\\([\\s\\S]*?rpc\\("${rpc}"`), aktion);
      const koerper = neu.slice(neu.indexOf(`export async function ${aktion}`));
      assert.match(koerper.slice(0, koerper.indexOf("rpc(")), /const supabase = await teamClient\(\);/, `${aktion} nimmt den Team-Client`);
    }
    // nichts davon mit service_role oder vivenu
    assert.doesNotMatch(neu.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""), /createSupabaseAdminClient|createFreeTicket|vv\(|vivenu\/client/);
    // das eigene Ticket folgt dem Profil: nur das Feld lounge_access
    assert.match(neu, /rpc\("update_speaker", \{ p_profile_id: profileId, p_data: \{ lounge_access: lounge \} \}\)/);
  });

  it("die Liste schaltet die Lounge über den richtigen Weg und storniert nur Nicht-Ausgestelltes", () => {
    const q = quelle("app/(admin)/admin/speaker-tickets/TicketQueue.tsx");
    assert.match(q, /x\.source === "speaker_companion" \? await setCompanionLounge\(x\.id, an\) : await setSpeakerLounge\(x\.profile_id, an\)/);
    // Stornieren: nur bestätigte, nicht ausgestellte Begleittickets; Ausgestellte verweisen auf vivenu
    assert.match(q, /x\.source === "speaker_companion" && x\.status === "approved" && !x\.issued && \(/);
    assert.match(q, /\{x\.issued && x\.status !== "cancelled" && <p className="ct-help max-w-65">\{t\.cancelAtVivenu\}<\/p>\}/);
    // stornierte Tickets haben keinen Lounge-Schalter
    assert.match(q, /x\.status === "cancelled" \? \(\s+<span className="ct-help">\{common\.none\}<\/span>/);
    // Rückfrage vor dem Stornieren
    assert.match(q, /<ConfirmDialog\s+title=\{t\.cancelTitle\}/);
  });

  it("die Seite zeigt Reiter und Anlegen-Knopf nur, wenn die Kontingent-Funktion antwortet — und die CSV als Download", () => {
    const p = quelle("app/(admin)/admin/speaker-tickets/page.tsx");
    assert.match(p, /const kontingente = quotaAntwort\.error \? null : \(\(quotaAntwort\.data \?\? \[\]\) as KontingentZeile\[\]\);/);
    assert.match(p, /\{kontingente && <AnlegenKnopf speakers=\{kontingente\}/);
    assert.match(p, /\{kontingente && \(\s+<SectionTabs/);
    assert.match(p, /<ButtonDownload href=\{`\$\{PATH\}\/lounge-liste`\} variant="secondary">/);
    assert.match(p, /await requireAdminSection\("speakerTickets", PATH\)/);
  });

  it("der Dialog erhöht das Kontingent nur auf Wunsch und lässt die Datenbank entscheiden", () => {
    const d = quelle("app/(admin)/admin/speaker-tickets/BegleitticketDialog.tsx");
    assert.match(d, /const voll = gewaehlt !== null && gewaehlt\.companions_active >= kontingent;/);
    assert.match(d, /const bereit = gewaehlt !== null && !voll && first\.trim\(\) !== "" && last\.trim\(\) !== "" && email\.trim\(\) !== "";/);
    assert.match(d, /setCompanionQuota\(gewaehlt\.profile_id, neu\)/);
    assert.match(d, /teamAddCompanionTicket\(gewaehlt\.profile_id, email, first, last, lounge\)/);
    // der Fehler der Datenbank steht im Dialog, nicht nur als Toast
    assert.match(d, /<Modal label=\{t\.addTitle\} onCancel=\{onClose\} error=\{fehler\}>/);
    // die Fußleiste kommt aus dem Kit (QS-068); das Absenden gehört über `form` zum Formular darüber, nicht von Hand gebaut
    assert.match(d, /import \{ Modal, ModalFuss \} from "@\/components\/ui\/Modal";/);
    assert.match(d, /<form id="bt_form" onSubmit=\{onSubmit\}/);
    assert.match(d, /<ModalFuss>\s+<Button type="submit" form="bt_form" disabled=\{pending \|\| !bereit\}>/);
    assert.doesNotMatch(d, /-mx-6|-mb-6|-bottom-6/);
  });

  it("die Kontingent-Tabelle prüft nur den Bereich 0–50, die Datenbank hat das letzte Wort", () => {
    const k = quelle("app/(admin)/admin/speaker-tickets/KontingentTabelle.tsx");
    assert.match(k, /!Number\.isInteger\(wert\) \|\| wert < 0 \|\| wert > 50/);
    assert.match(k, /setSpeakerLounge\(r\.profile_id, an\)/);
    assert.match(k, /setCompanionQuota\(r\.profile_id, wert\)/);
  });
});

describe("ADM-076: Texte und Fehlerschlüssel", () => {
  const SCHLUESSEL_RPC = ["quota_exceeded", "companion_exists", "quota_below_used", "not_a_companion", "ticket_cancelled", "invalid_quota"];

  it("die sechs neuen Schlüssel stehen in BUSINESS_KEYS und in beiden Wörterbüchern", () => {
    const r = quelle("lib/rpc-error.ts");
    for (const k of SCHLUESSEL_RPC) {
      assert.ok(r.includes(`"${k}",`), `BUSINESS_KEYS: ${k}`);
      for (const sprache of ["de", "en"] as const) assert.ok(woerterbuch(sprache).rpc[k], `${sprache}.rpc.${k}`);
    }
  });

  it("alle Texte der Admin-Seite und des Speaker-Portals stehen in DE und EN", () => {
    const admin = [
      "tabsLabel", "tabTickets", "tabQuotas", "loungeList", "addCompanion", "colLounge", "loungeFor", "loungeSaved", "cancelTicket",
      "cancelTitle", "cancelBody", "cancelled", "cancelAtVivenu", "searchLabel", "searchPlaceholder", "noSpeakers", "colPass",
      "colOwnTicket", "colQuota", "quotaOf", "quotaFieldFor", "quotaInvalid", "quotaSaved", "save", "addCompanionShort", "addTitle",
      "addLead", "fieldSpeaker", "fieldSpeakerPlaceholder", "fieldFirst", "fieldLast", "fieldEmail", "fieldEmailHint", "fieldLounge",
      "fieldLoungeHint", "addSubmit", "cancel", "quotaFullHint", "raiseQuota", "added",
    ];
    const speaker = ["companionQuotaLine", "companionQuotaNone", "companionQuotaFull", "companionAnother"];
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache);
      for (const k of admin) assert.ok(w.admin.speakerTickets[k], `${sprache}.admin.speakerTickets.${k}`);
      for (const k of speaker) assert.ok(w.speaker[k], `${sprache}.speaker.${k}`);
    }
  });

  it("die Texte passen zum Modell: Begleittickets sind mehrere, die Lounge entscheidet das Team je Ticket", () => {
    assert.match(woerterbuch("de").speaker.companionLead, /Wie viele du bekommst, legt das Team fest/);
    assert.match(woerterbuch("en").speaker.companionLead, /The team sets how many you get/);
    // der Hinweis an ausgestellten Tickets sagt: Storno bei vivenu, der Abgleich zieht nach
    assert.match(woerterbuch("de").admin.speakerTickets.cancelAtVivenu, /Storno bei vivenu/);
    assert.match(woerterbuch("en").admin.speakerTickets.cancelAtVivenu, /cancel at vivenu/);
  });
});

describe("ADM-076: Testdaten für Konrads Konto", () => {
  const skript = () => quelle("scripts/testdaten-konrad.mjs");
  const schritt = () => {
    const s = skript();
    const von = s.indexOf("async function begleitungSchritt");
    const bis = s.indexOf("\n}\n", von);
    assert.ok(von > 0 && bis > von, "begleitungSchritt steht im Skript");
    return s.slice(von, bis);
  };

  it("der Schritt ist unter --nur=begleitung erreichbar und in der Kopfdoku beschrieben", () => {
    assert.match(skript(), /^\s+begleitung: begleitungSchritt,$/m);
    assert.match(skript(), /--apply --nur=begleitung\s+\(ADM-076/);
    assert.match(skript(), /„Ausstellen“ legt ein echtes\s+\*?\s*vivenu-Freiticket an/);
  });

  it("schreibt direkt, nicht über die RPCs — so geht keine Mail an Speaker oder Speaker-Leads", () => {
    assert.doesNotMatch(schritt(), /\.rpc\(/);
    assert.match(schritt(), /admin\.from\("ticket"\)\.insert\(\{/);
  });

  it("läuft erst, wenn die Spalte da ist — vorher gilt noch der Index „eine Begleitung je Speaker“", () => {
    const s = schritt();
    assert.ok(s.indexOf("companion_quota") < s.indexOf('.from("ticket")'), "die Spaltenprüfung steht vor dem ersten Schreiben");
    assert.match(s, /Kontingent-Spalte fehlt \(\$\{kontingentFehler\.message\}\) — Migration v6_speaker_tickets_final noch nicht live/);
  });

  it("zwei Begleitungen an Konrads Postfach: eine freigegeben mit Lounge, eine beantragt ohne; Kontingent 3", () => {
    const s = schritt();
    assert.match(s, /\{ i: 1, nachname: "Begleitung 1", status: "approved", lounge: true \}/);
    assert.match(s, /\{ i: 2, nachname: "Begleitung 2", status: "requested", lounge: false \}/);
    assert.match(s, /update\(\{ companion_quota: 3 \}\)/);
    assert.match(skript(), /const begleitAdresse = \(i\) => email\.replace\("@", `\+zztest-begleitung-\$\{i\}@`\);/);
  });

  it("eine ausgestellte Begleitung bleibt unangetastet, eine freigegebene trägt von und wann", () => {
    const s = schritt();
    assert.match(s, /if \(da\?\.barcode \|\| da\?\.vivenu_ticket_id\) \{/);
    assert.match(s, /\{ approved_by: me\.id, approved_at: new Date\(\)\.toISOString\(\) \}/);
    assert.match(s, /\{ approved_by: null, approved_at: null \}/);
  });

  it("--remove räumt die Begleitungen mit den Tickets des Testprofils weg", () => {
    const s = skript();
    const remove = s.slice(s.indexOf("async function remove(me)"), s.indexOf("const me = await person();"));
    assert.match(remove, /Tickets des Testprofils entfernt/);
    assert.match(remove, /admin\.from\("ticket"\)\.delete\(\)\.in\("speaker_profile_id", ids\)\.is\("vivenu_ticket_id", null\)/);
  });
});
