import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { ohneGeheimnisse, metaOhneGeheimnisse } from "@/lib/mail/geheimnisse";
import { istToken, leseLinkAntwort } from "@/lib/side-event/link";
import { sideEventFehler } from "@/lib/side-event/meldung";
import { ADMIN_SECTIONS } from "@/lib/admin-sections";

/**
 * ADM-077 / SPK-091 (Konrad und Paulina 05.10.): aus der Speaker Reception werden Side Events — Einladungen mit Mail-Link, ein Stand je
 * Einladung, mehrere Events je Edition. Die Datenbank-Seite belegt `supabase/tests/v6_side_events.sql` (echter Rollenwechsel, Link als
 * service_role, 94 Erwartungen mit Auswertung, 27 Mutationsproben); hier steht, was sich ohne Datenbank festhalten lässt: die Form der
 * Migration, die Lesart der Link-Antwort, und dass Seite, Route, Proxy und Mail-Versand so verdrahtet sind, wie die Auflagen es verlangen.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));
/** Kommentare raus: ein Satz, der etwas erwähnt, ist kein Aufruf. */
const ohneKommentare = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function dateien(ordner: string, treffer: string[] = []): string[] {
  for (const e of readdirSync(ordner, { withFileTypes: true })) {
    const pfad = join(ordner, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next" && !e.name.startsWith("vorschau-")) dateien(pfad, treffer);
    } else if (/\.(tsx?|mjs|js)$/.test(e.name)) treffer.push(pfad);
  }
  return treffer;
}

describe("ADM-077: die Migration `v6_side_events`", () => {
  const sql = () => code(migrationText("v6_side_events"));
  const funktion = (name: string) => {
    const c = sql();
    const start = c.indexOf(`create or replace function ${name}(`);
    assert.ok(start >= 0, `${name} fehlt`);
    return c.slice(start, c.indexOf("end $$;", start));
  };

  it("Umbau statt Neubau: beide Tabellen werden umbenannt, die Einladung hat Stand, Weg, Token-Hash und Zeitpunkte", () => {
    const c = sql();
    assert.match(c, /alter table speaker_reception rename to side_event;/);
    assert.match(c, /alter table speaker_reception_rsvp rename to side_event_invite;/);
    assert.match(c, /alter table side_event_invite rename column reception_id to side_event_id;/);
    assert.match(c, /check \(status in \('invited', 'yes', 'no'\)\)/);
    assert.match(c, /check \(via in \('portal', 'email', 'team'\)\)/);
    assert.match(c, /check \(token_hash is null or token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    assert.match(c, /create unique index if not exists side_event_invite_token_uidx on side_event_invite \(token_hash\) where token_hash is not null;/);
    // eine Einladung hat noch keine Antwort: `responded_at` ist dann leer, und jede Einladung hat einen Zeitpunkt
    assert.match(c, /alter column responded_at drop not null;/);
    assert.match(c, /alter column invited_at set not null;/);
  });

  it("Tabellen ohne Grants: alle drei sind für anon und authenticated gesperrt, die Versuchstabelle hat RLS", () => {
    const c = sql();
    assert.match(c, /alter table side_event_attempt enable row level security;/);
    assert.match(c, /revoke all on side_event_attempt from anon, authenticated;/);
    assert.match(c, /revoke all on side_event, side_event_invite from anon, authenticated;/);
    assert.doesNotMatch(c, /grant (select|insert|update|delete|all)[^;]* on (side_event|side_event_invite|side_event_attempt)\b/i);
  });

  it("die sieben alten Funktionen fallen weg, die acht neuen und der Helfer kommen", () => {
    const c = sql();
    for (const f of ["my_receptions(uuid)", "set_reception_rsvp(uuid, text, integer, text)", "receptions_admin(uuid)", "reception_guests(uuid)", "upsert_reception(jsonb)", "delete_reception(uuid)", "reception_taken(uuid)"]) {
      assert.ok(c.includes(`drop function if exists ${f};`), `drop ${f}`);
    }
    for (const f of ["side_event_taken", "my_side_events", "side_events_admin", "upsert_side_event", "delete_side_event", "respond_side_event", "invite_to_side_event", "set_side_event_status", "side_event_respond_by_token"]) {
      assert.ok(c.includes(`create or replace function ${f}(`), `create ${f}`);
    }
  });

  it("jede Funktion pinnt den search_path, und die Datei endet mit harden_definer_functions()", () => {
    const c = sql();
    const neue = c.match(/create or replace function (side_event\w*|my_side_events|side_events_admin|upsert_side_event|delete_side_event|respond_side_event|invite_to_side_event|set_side_event_status)\(/g) ?? [];
    assert.equal(neue.length, 9);
    for (const n of neue) {
      const name = n.replace("create or replace function ", "").replace("(", "");
      assert.match(funktion(name), /security definer set search_path to 'public', 'extensions'/, name);
    }
    assert.match(c.trim(), /select harden_definer_functions\(\);$/);
  });

  it("der Link-Weg ist nur für service_role: mit Sitzung 42501, EXECUTE entzogen, Quelle gesalzen und gezählt", () => {
    const c = sql();
    const f = funktion("side_event_respond_by_token");
    // die Anmeldeprüfung steht vor allem anderen
    assert.ok(f.indexOf("auth.uid() is not null") >= 0 && f.indexOf("auth.uid() is not null") < f.indexOf("award_hash"));
    assert.match(f, /auth\.uid\(\) is not null then raise exception 'not allowed' using errcode = '42501'/);
    assert.match(c, /revoke execute on function side_event_respond_by_token\(text, text, text\) from public, anon, authenticated;/);
    assert.match(c, /grant execute on function side_event_respond_by_token\(text, text, text\) to service_role;/);
    // Ratenbegrenzung vor dem Nachschlagen des Tokens, mit der gesalzenen Quelle; die Adresse selbst sieht die Datenbank nie
    assert.match(f, /v_quelle := award_hash\(v_ed, p_ip_hash\);/);
    assert.ok(f.indexOf(">= 60") < f.indexOf("token_hash = v_hash"), "Ratenbegrenzung vor dem Token-Zugriff");
    // Token: 43 URL-sichere Zeichen, gehasht nachgeschlagen — nie im Klartext verglichen
    assert.match(f, /p_token !~ '\^\[A-Za-z0-9_-\]\{43\}\$'/);
    assert.match(f, /encode\(digest\(p_token, 'sha256'\), 'hex'\)/);
    // gültig nur bis Eventbeginn und nur für Veröffentlichtes
    assert.match(f, /not v_e\.published or v_e\.starts_at <= now\(\) then return jsonb_build_object\('state', 'invalid'\)/);
  });

  it("der Token ist 32 Zufallsbytes, gespeichert wird nur der Hash, und eine neue Mail ersetzt den Token in der wartenden", () => {
    const f = funktion("invite_to_side_event");
    assert.match(f, /translate\(rtrim\(encode\(gen_random_bytes\(32\), 'base64'\), '='\), '\+\/', '-_'\)/);
    assert.match(f, /v_hash\s+:= encode\(digest\(v_token, 'sha256'\), 'hex'\)/);
    assert.doesNotMatch(f, /token_hash = v_token|values \([^)]*v_token/, "der Klartext geht nie in die Einladung");
    // eine wartende Mail bekommt den neuen Token, statt dass eine zweite mit totem Link entsteht
    assert.match(f, /jsonb_set\(coalesce\(meta, '\{\}'::jsonb\), '\{vars,side_event_token\}', to_jsonb\(v_token\), true\)/);
    // unterdrückt oder ohne Adresse: der Token verlässt das Protokoll, die Einladung bleibt ohne Link
    assert.match(f, /meta #- '\{vars,side_event_token\}'/);
    assert.match(f, /update side_event_invite set token_hash = null, mailed_at = null/);
    // nur zu Veröffentlichtem, nur an Bestätigte ohne Gast und ohne gelöschte Person
    assert.match(f, /if not v_e\.published then raise exception 'side_event_not_published'/);
    assert.match(f, /v_sp\.stage_guest or not speaker_is_confirmed\(v_sp\.pipeline_status\)/);
    assert.match(f, /p\.deleted_at is null/);
  });

  it("Audit ohne E-Mail: ins Protokoll gehen Person, Stand und Weg — nie eine Adresse, ein Token oder ein Hinweis", () => {
    const c = sql();
    const aufrufe = c.match(/perform log_audit\('side_event\.[a-z_]+'[\s\S]*?\);/g) ?? [];
    assert.ok(aufrufe.length >= 6, `Audit-Aufrufe: ${aufrufe.length}`);
    for (const a of aufrufe) {
      // der Weg heißt `'via', 'email'` (Link in der Mail) — das Wort ist kein Datum
      assert.doesNotMatch(a.replace(/'via', 'email'/g, "'via'"), /email|v_token|p_token|v_note|p_note|\bnote\b/i, a.slice(0, 80));
    }
    assert.match(funktion("side_event_respond_by_token"), /'person_id', \(select sp\.person_id from speaker_profile sp where sp\.id = v_i\.profile_id\),\s+'status', p_status, 'via', 'email', 'responded_at', now\(\)/);
  });

  it("Zu- oder Absage im Portal ist die eigene Sache der Speakerin: die Assistenz bekommt 42501; Kapazität zählt nur Zusagen plus Begleitung", () => {
    const f = funktion("respond_side_event");
    assert.match(f, /if not coalesce\(\(select sp\.person_id = v_me from speaker_profile sp where sp\.id = v_profile\), false\) then\s+raise exception 'not allowed' using errcode = '42501'/);
    assert.match(funktion("side_event_taken"), /sum\(1 \+ i\.guests\)[\s\S]*i\.status = 'yes'/);
    // die eigene bisherige Zusage zählt beim Ändern nicht mit
    assert.match(f, /if v_i\.status = 'yes' then v_eigene := 1 \+ v_i\.guests; end if;/);
  });

  it("alle Team-Funktionen prüfen das Speaker-Team; die Übersicht liefert Namen nur mit Event-Id", () => {
    for (const f of ["upsert_side_event", "delete_side_event", "invite_to_side_event", "set_side_event_status", "side_events_admin"]) {
      assert.match(funktion(f), /if not is_speaker_team\(v_ed|if not is_speaker_team\(v_e\.edition_id\)/, f);
    }
    assert.match(funktion("side_events_admin"), /case when p_side_event_id is not null and e\.id = p_side_event_id then/);
    // beim Ändern gilt die Edition des Datensatzes, nicht die des Aufrufs
    assert.match(funktion("upsert_side_event"), /select e\.edition_id into v_ed from side_event e where e\.id = v_id;/);
  });

  it("der Admin-Abschnitt zieht um (Rollen bleiben), `anonymize_person` leert Hinweis und Link-Hash", () => {
    const c = sql();
    for (const r of ["admin", "area_lead_speaker", "programme_team"]) {
      assert.ok(c.includes(`delete from admin_section_role where section = 'reception' and role = '${r}';`), `delete reception/${r}`);
      assert.ok(c.includes(`('sideEvents', '${r}')`), `insert sideEvents/${r}`);
    }
    assert.match(c, /update admin_section_override set section = 'sideEvents' where section = 'reception';/);
    assert.match(c, /update side_event_invite set note = null, token_hash = null where profile_id = any \(v_profile\);/);
  });

  it("die Einladungsmail trägt den Link mit dem Token, in beiden Sprachen, und keine Adresse", () => {
    const c = migrationText("v6_side_events");
    assert.equal((c.match(/\('side_event_invitation', '(de|en)', 1,/g) ?? []).length, 2);
    assert.equal((c.match(/\{\{portal_url\}\}\/side-event\/\{\{side_event_token\}\}/g) ?? []).length, 2);
    assert.doesNotMatch(c.slice(c.indexOf("insert into mail_template")), /\{\{[a-z_]*email[a-z_]*\}\}/);
  });

  it("der Abschnitt `sideEvents` steht in der Zugangsliste, `reception` nicht mehr", () => {
    const schluessel = ADMIN_SECTIONS.map((s) => s.key as string);
    assert.ok(schluessel.includes("sideEvents"));
    assert.ok(!schluessel.includes("reception"));
    const s = ADMIN_SECTIONS.find((x) => x.key === "sideEvents");
    assert.equal(s?.path, "/admin/side-events");
    assert.deepEqual([...(s?.roles ?? [])].sort(), ["area_lead_speaker", "programme_team"]);
  });
});

describe("ADM-077: die Lesart der Link-Antwort", () => {
  const EVENT = { title_de: "Dinner", title_en: "Dinner EN", starts_at: "2027-04-15T17:00:00+00:00", ends_at: null, location: "Hafen", address: "Pier 1" };

  it("der Token hat 43 URL-sichere Zeichen — alles andere ist Rateversuch", () => {
    assert.ok(istToken("A".repeat(43)));
    assert.ok(istToken("a-_B".repeat(10) + "xyz"));
    for (const falsch of ["", "abc", "A".repeat(42), "A".repeat(44), "!".repeat(43), "A".repeat(42) + "=", null, undefined, 7, {}]) {
      assert.ok(!istToken(falsch), String(falsch));
    }
  });

  it("ok und closed tragen Event und Stand; unbekannte Zustände sind `invalid`", () => {
    const ok = leseLinkAntwort({ state: "ok", status: "yes", event: EVENT });
    assert.equal(ok.state, "ok");
    assert.equal(ok.status, "yes");
    assert.equal(ok.event?.title_de, "Dinner");
    assert.equal(leseLinkAntwort({ state: "closed", status: "invited", event: EVENT }).state, "closed");
    for (const roh of [null, undefined, "ok", 7, {}, { state: "weird" }, { state: "ok" }]) {
      const a = leseLinkAntwort(roh);
      assert.equal(a.state, "invalid", JSON.stringify(roh));
      assert.equal(a.event, null);
    }
  });

  it("nur Zustände ohne Event dürfen ohne Event kommen (invalid, rate_limited)", () => {
    assert.equal(leseLinkAntwort({ state: "rate_limited" }).state, "rate_limited");
    assert.equal(leseLinkAntwort({ state: "invalid" }).state, "invalid");
    assert.equal(leseLinkAntwort({ state: "ok", status: "yes" }).state, "invalid", "ok ohne Event gibt es nicht");
    assert.equal(leseLinkAntwort({ state: "full", status: "invited" }).state, "invalid");
  });

  it("ein Event ohne Titel, Beginn oder Ort ist ungültig; ein unbekannter Stand wird zu null", () => {
    for (const kaputt of [{ ...EVENT, title_de: "" }, { ...EVENT, starts_at: null }, { ...EVENT, location: undefined }]) {
      assert.equal(leseLinkAntwort({ state: "ok", status: "yes", event: kaputt }).state, "invalid");
    }
    assert.equal(leseLinkAntwort({ state: "ok", status: "maybe", event: EVENT }).status, null);
  });

  it("es wird nur übernommen, was die Seite zeigen darf — auch wenn die Funktion eines Tages mehr liefert", () => {
    const a = leseLinkAntwort({
      state: "ok",
      status: "no",
      first_name: "Anna",
      event: { ...EVENT, profile_id: "x", email: "anna@example.com", note: "vegan", yes_count: 12 },
      person: { last_name: "Muster" },
    });
    assert.deepEqual(Object.keys(a).sort(), ["event", "state", "status"]);
    assert.deepEqual(Object.keys(a.event ?? {}).sort(), ["address", "ends_at", "location", "starts_at", "title_de", "title_en"]);
    assert.doesNotMatch(JSON.stringify(a), /anna|muster|vegan|profile_id|yes_count/i);
  });
});

describe("ADM-077: Fehlertexte und Mail-Geheimnisse", () => {
  const rpc = woerterbuch("de").rpc as Record<string, string>;

  it("freie Plätze und Frist stehen im Satz, null Plätze heißt ausgebucht", () => {
    assert.equal(sideEventFehler("side_event_full", "2", rpc), "Freie Plätze: 2 — mit Begleitung reicht das nicht.");
    assert.equal(sideEventFehler("side_event_full", "0", rpc), "Das Side Event ist ausgebucht.");
    assert.equal(sideEventFehler("side_event_full", undefined, rpc), "Das Side Event ist ausgebucht.");
    assert.match(sideEventFehler("side_event_closed", "2027-04-01 12:00", rpc), /seit 2027-04-01 12:00 vorbei/);
    assert.match(sideEventFehler("invalid_side_event", "has_guests:3", rpc), /noch 3 Zusagen/);
    assert.match(sideEventFehler("invalid_side_event", "guests:4", rpc), /Begleitung 0 bis 3/);
    assert.equal(sideEventFehler("side_event_not_invited", undefined, rpc), "Du bist zu diesem Side Event nicht eingeladen.");
    assert.equal(sideEventFehler("gibt_es_nicht", undefined, rpc), rpc.unknown);
  });

  it("der Token verschwindet aus den Mail-Variablen — der Rest bleibt, und ohne Token bleibt das Objekt dasselbe", () => {
    const meta = { vars: { event_title_de: "Dinner", side_event_token: "geheim", first_name: "Anna" }, attempts: 1 };
    const sauber = ohneGeheimnisse(meta);
    assert.deepEqual(sauber, { vars: { event_title_de: "Dinner", first_name: "Anna" }, attempts: 1 });
    assert.ok("side_event_token" in meta.vars, "das Original bleibt unberührt");
    assert.equal(ohneGeheimnisse(null), null);
    const ohne = { vars: { a: 1 } };
    assert.equal(ohneGeheimnisse(ohne), ohne);
    assert.deepEqual(metaOhneGeheimnisse(ohne), {}, "nichts zu entfernen: die Spalte bleibt beim Schreiben unberührt");
    assert.deepEqual(metaOhneGeheimnisse(meta), { meta: sauber });
  });
});

describe("ADM-077: Seite, Route, Proxy und Mail-Versand", () => {
  it("der Proxy lässt Seite und Route ohne Login durch", () => {
    const p = quelle("proxy.ts");
    assert.match(p, /PUBLIC_PREFIXES = \[[^\]]*"\/side-event\/"[^\]]*"\/api\/side-event\/"[^\]]*\]/);
  });

  it("`next.config.ts`: kein Suchindex und kein Referrer für den Link, die alte Admin-Adresse führt weiter", () => {
    const n = quelle("next.config.ts");
    assert.match(n, /source: "\/side-event\/:path\*"/);
    assert.match(n, /key: "Referrer-Policy", value: "no-referrer"/);
    assert.match(n, /key: "X-Robots-Tag", value: "noindex, nofollow, noarchive"/);
    assert.match(n, /source: "\/admin\/reception", destination: "\/admin\/side-events"/);
  });

  it("die Seite zeigt nur an: Lesen ohne Stand, noindex, kein Referrer, dynamisch", () => {
    const s = quelle("app/side-event/[token]/page.tsx");
    const c = ohneKommentare(s);
    assert.match(c, /p_status: null/);
    assert.doesNotMatch(c, /p_status: ("yes"|"no"|status)/);
    assert.match(c, /robots: \{ index: false, follow: false, nocache: true \}/);
    assert.match(c, /referrer: "no-referrer"/);
    assert.match(c, /export const dynamic = "force-dynamic"/);
    assert.match(c, /istToken\(token\)/, "die Form wird geprüft, bevor die Datenbank gefragt wird");
    assert.match(c, /quellHash\(await headers\(\)\)/);
    // keine Personendaten: weder eine Person noch ein Profil wird gelesen
    assert.doesNotMatch(c, /from\("person|\.from\("speaker_profile|first_name|last_name|email/);
  });

  it("die Route antwortet nur auf POST, prüft die Form, hasht die Quelle und loggt nie den Token", () => {
    const r = quelle("app/api/side-event/antwort/route.ts");
    const c = ohneKommentare(r);
    assert.match(c, /export async function POST\(/);
    assert.doesNotMatch(c, /export (async )?function (GET|PUT|PATCH|DELETE|HEAD)\b/);
    assert.match(c, /istToken\(body\?\.token\)/);
    assert.match(c, /status !== "yes" && status !== "no"/);
    assert.match(c, /p_ip_hash: quellHash\(request\.headers\)/);
    assert.match(c, /createSupabaseAdminClient\(\)/);
    // geloggt wird nur Code und Meldung der Datenbank, nie etwas aus der Anfrage
    const logs = c.match(/console\.(error|log|warn|info)\([^;]*\);/g) ?? [];
    assert.ok(logs.length >= 1);
    for (const log of logs) assert.match(log, /^console\.error\("\[side-event\][^"]*", error\.code, error\.message\);$/, log);
    // nur der Zustand geht zurück, keine Event-Daten
    assert.match(c, /NextResponse\.json\(\{ state: antwort\.state, status: antwort\.status \}/);
  });

  it("die Knöpfe schicken erst beim Klick einen POST — kein Abruf beim Laden", () => {
    const k = ohneKommentare(quelle("app/side-event/[token]/AntwortKnoepfe.tsx"));
    assert.match(k, /method: "POST"/);
    assert.doesNotMatch(k, /useEffect/);
    assert.match(k, /onClick=\{\(\) => antworten\("yes"\)\}/);
    assert.match(k, /onClick=\{\(\) => antworten\("no"\)\}/);
  });

  it("der Versand entfernt den Token aus dem Protokoll: nach dem Senden, bei Sperre, endgültigem Scheitern und im Probelauf", () => {
    const q = ohneKommentare(quelle("lib/mail/queue.ts"));
    assert.match(q, /status: "sent", subject, provider_id: res\.providerId, sent_at: new Date\(\)\.toISOString\(\), \.\.\.metaOhneGeheimnisse\(row\.meta\)/);
    assert.match(q, /status: "suppressed", to_email: `suppressed:\$\{hash \?\? "unknown"\}`, \.\.\.metaOhneGeheimnisse\(row\.meta\)/);
    assert.match(q, /status: "failed", error: message, meta: ohneGeheimnisse\(/);
    assert.match(q, /meta: ohneGeheimnisse\(\{ \.\.\.\(row\.meta \?\? \{\}\), dryRun: true \}\)/);
  });

  it("niemand ruft die sieben alten Reception-Funktionen mehr auf", () => {
    const alt = /\b(my_receptions|set_reception_rsvp|receptions_admin|reception_guests|upsert_reception|delete_reception|reception_taken)\b/;
    const fund: string[] = [];
    for (const ordner of ["app", "lib", "components", "scripts"]) {
      for (const d of dateien(ordner)) if (alt.test(readFileSync(d, "utf8"))) fund.push(d);
    }
    assert.deepEqual(fund, []);
  });

  it("Admin-Seite und Actions ziehen das Abschnitts-Gate `sideEvents`; die Navigation führt hin", () => {
    for (const p of ["app/(admin)/admin/side-events/page.tsx", "app/(admin)/admin/side-events/actions.ts"]) {
      assert.match(quelle(p), /requireAdminSection\("sideEvents"/, p);
    }
    assert.match(quelle("lib/admin-navigation.ts"), /section: "sideEvents", href: "\/admin\/side-events", label: "sideEvents"/);
  });

  it("die Admin-Actions prüfen Ids und Grenzen, bevor sie die Datenbank fragen, und rufen nur die neuen Funktionen", () => {
    const a = ohneKommentare(quelle("app/(admin)/admin/side-events/actions.ts"));
    for (const f of ["upsert_side_event", "delete_side_event", "side_events_admin", "invite_to_side_event", "set_side_event_status"]) {
      assert.ok(a.includes(`.rpc("${f}"`), f);
    }
    assert.match(a, /profileIds\.length > 200\b/);
    assert.match(a, /guests > 3/);
    assert.match(a, /p_note: note\.trim\(\),/, "leer löscht den Hinweis (null ließe ihn stehen)");
  });

  it("das Speaker-Portal liest `my_side_events`, zeigt den Platzhalter nur mit einem Datum in der Zukunft und kennt keine Reception mehr", () => {
    const p = ohneKommentare(quelle("app/(speaker)/speaker/page.tsx"));
    assert.match(p, /supabase\.rpc\("my_side_events"\)/);
    assert.match(p, /fristen\.get\(SIDE_EVENTS_FRIST\)/);
    assert.match(p, /new Date\(sideEventsFrist\) > new Date\(\)/);
    assert.match(p, /\?side_event=\$\{r\.id\}/);
    assert.doesNotMatch(p, /Reception|reception/);
    const k = ohneKommentare(quelle("app/api/speaker/kalender/route.ts"));
    assert.match(k, /url\.searchParams\.get\("side_event"\)/);
    assert.match(k, /supabase\.rpc\("my_side_events"\)/);
  });

  it("das Reception-Kennzeichen ist aus Fenster und Admin-Detail verschwunden (Typen und Spalte bleiben, veraltet)", () => {
    for (const p of ["app/(speaker-leads)/speaker-leads/SpeakerFenster.tsx", "app/(speaker-leads)/speaker-leads/entwurf.ts", "app/(admin)/admin/speaker/[id]/Detail.tsx"]) {
      assert.doesNotMatch(quelle(p), /reception_eligible|receptionEligible/, p);
    }
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache);
      assert.equal(w.adminSpeaker.receptionEligible, undefined);
      assert.equal(w.leads.receptionEligible, undefined);
    }
  });
});

describe("ADM-077: Texte in DE und EN", () => {
  /** Alle `t.<schluessel>`, die eine Datei benutzt (auch `t[\`field_${…}\`]`-Muster werden unten gezielt geprüft). */
  const benutzt = (pfad: string, name: string) =>
    [...new Set([...ohneKommentare(quelle(pfad)).matchAll(new RegExp(`\\b${name}\\.([A-Za-z_][A-Za-z0-9_]*)`, "g"))].map((m) => m[1]))];

  it("jeder Schlüssel, den die Admin-Oberfläche benutzt, steht in beiden Wörterbüchern", () => {
    const schluessel = benutzt("app/(admin)/admin/side-events/SideEventsAdmin.tsx", "t");
    assert.ok(schluessel.length >= 50, `benutzte Schlüssel: ${schluessel.length}`);
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache).admin.sideEvents;
      for (const k of schluessel) assert.ok(typeof w[k] === "string" && w[k].length > 0, `${sprache}.admin.sideEvents.${k}`);
      // die dynamischen: Felder, Stände, Wege
      for (const f of ["title_de", "title_en", "location", "address", "starts_at", "ends_at", "capacity", "rsvp_deadline"]) assert.ok(w[`field_${f}`], `${sprache} field_${f}`);
      for (const s of ["invited", "yes", "no"]) assert.ok(w[`status_${s}`], `${sprache} status_${s}`);
      for (const v of ["portal", "email", "team"]) assert.ok(w[`via_${v}`], `${sprache} via_${v}`);
    }
  });

  it("jeder Schlüssel der Speaker-Karte und der öffentlichen Seite steht in beiden Wörterbüchern", () => {
    const karte = benutzt("app/(speaker)/speaker/SideEventCard.tsx", "t");
    const seite = benutzt("app/side-event/[token]/page.tsx", "s");
    assert.ok(karte.length >= 10 && seite.length >= 12);
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache);
      for (const k of karte) assert.ok(w.speakerSideEvents[k], `${sprache}.speakerSideEvents.${k}`);
      for (const k of [...seite, "statusInvited", "doneYes", "doneNo", "changeHint", "invalidBody", "rateLimited", "error", "full", "closed"]) {
        assert.ok(w.sideEventPublic[k], `${sprache}.sideEventPublic.${k}`);
      }
      for (const k of ["sectionTitle", "placeholder", "badgeInvited", "calendarAdd"]) assert.ok(w.speakerSideEvents[k], `${sprache}.speakerSideEvents.${k}`);
      assert.ok(w.speakerCalendar.sideEventNote);
      assert.ok(w.admin.nav.sideEvents && w.admin.words.sideEvents);
      assert.equal(w.admin.reception, undefined);
      assert.equal(w.speakerReception, undefined);
    }
  });

  it("die neuen Fehlerschlüssel stehen in BUSINESS_KEYS und in beiden Wörterbüchern", () => {
    const r = quelle("lib/rpc-error.ts");
    for (const k of ["side_event_not_invited", "side_event_not_published", "side_event_closed", "side_event_full", "invalid_side_event"]) {
      assert.ok(r.includes(`"${k}",`), `BUSINESS_KEYS: ${k}`);
    }
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache).rpc;
      for (const k of ["side_event_not_invited", "side_event_not_published", "side_event_closed", "side_event_full", "side_event_full_none", "side_event_has_guests", "invalid_side_event"]) {
        assert.ok(w[k], `${sprache}.rpc.${k}`);
      }
      assert.match(w.side_event_closed, /\{datum\}/);
      assert.match(w.side_event_full, /\{n\}/);
    }
  });

  it("der Platzhalter-Satz im Portal hat seine Stelle für das Datum", () => {
    for (const sprache of ["de", "en"] as const) assert.match(woerterbuch(sprache).speakerSideEvents.placeholder, /\{datum\}/);
  });
});
