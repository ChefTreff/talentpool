import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { VERLAUF_SEITE, istVerlaufCursor, parseVerlauf } from "@/lib/freigaben";

/**
 * ADM-081 Teil 2 (Konrad 05.10.): „Bereits freigegeben“ je Reiter der Freigaben — eingeklappt, mit Datum und der
 * Person, die entschieden hat, zuletzt zuerst, in Seiten. Die Datenbank-Seite belegt
 * `supabase/tests/v6_freigabe_verlauf.sql` (Tor je Art und Rolle, Inhalt je Art mit Gegenstücken, Blättern mit
 * Tie-Break, Deckel 50); hier steht, was sich ohne Datenbank festhalten lässt.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

describe("ADM-081: die Migration `v6_freigabe_verlauf`", () => {
  const sql = () => migrationText("v6_freigabe_verlauf");

  it("ist DEFINER, STABLE und hat gepinnten search_path — und gibt genau die acht Spalten zurück", () => {
    const c = code(sql());
    assert.match(c, /language plpgsql\s+stable\s+security definer\s+set search_path to 'public', 'extensions'/);
    const spalten = ["objekt_id", "entschieden_am", "entschieden_von", "titel", "detail", "notiz", "betrag_cents", "termin"];
    const rueckgabe = c.slice(c.indexOf("returns table ("), c.indexOf("language plpgsql"));
    for (const s of spalten) assert.match(rueckgabe, new RegExp(`\\b${s}\\b`), s);
    assert.equal((rueckgabe.match(/\n\s+\w+\s+(uuid|timestamptz|text|integer)/g) ?? []).length, spalten.length);
  });

  it("deckelt auf 50, verlangt Art und ein vollständiges Cursor-Paar", () => {
    const c = code(sql());
    assert.match(c, /v_limit integer := least\(greatest\(coalesce\(p_limit, 20\), 1\), 50\);/);
    assert.match(c, /raise exception 'invalid_art' using errcode = '22023'/);
    assert.match(c, /\(p_before_at is null\) <> \(p_before_id is null\) then\s+raise exception 'invalid_cursor' using errcode = '22023'/);
    assert.match(c, /if current_person_id\(\) is null then raise exception 'not authenticated' using errcode = '28000'/);
  });

  it("jede Art hat ihr Tor: Abschnitt plus das Tor der Liste — Slots zusätzlich als Programm-Editor", () => {
    const c = code(sql());
    assert.match(c, /has_admin_section\('submissions'\) and coalesce\(\(my_manager_scope\(\) ->> 'is_manager'\)::boolean, false\)/);
    // Plan 05.10.: die Programm-RLS nachbilden — area_lead_speaker allein bekommt für `slots` 42501
    assert.match(c, /has_admin_section\('programme'\) and v_event is not null and coalesce\(is_programme_editor\(v_event\), false\)/);
    assert.match(c, /has_admin_section\('expenses'\) and coalesce\(is_expense_approver\(\), false\)/);
    assert.equal((c.match(/has_admin_section\('hospitality'\) and coalesce\(is_speaker_team\(null\), false\)/g) ?? []).length, 2, "Hotel und Shuttle");
    assert.equal((c.match(/raise exception 'not allowed' using errcode = '42501'/g) ?? []).length, 5, "fünf Tore");
  });

  it("liest nur positive Entscheidungen aus den vorhandenen Quellen", () => {
    const c = code(sql());
    assert.match(c, /s\.status = 'approved'/);
    assert.match(c, /c\.status in \('approved', 'paid'\)/);
    assert.equal((c.match(/b\.status = 'confirmed'/g) ?? []).length, 2, "Hotel und Shuttle");
    assert.match(c, /a\.action in \('session\.publish', 'partner\.session_released'\)/);
    // der Verlauf der Slots kommt aus dem Audit, aber nur Akteur und Zeitpunkt — nie before/after
    assert.match(c, /a\.actor_person_id/);
    assert.match(c, /a\.created_at/);
    assert.doesNotMatch(c, /a\.(before|after)\b/);
  });

  it("blättert über Zeitpunkt und Kennung, in jeder Art, ohne Offset", () => {
    const c = code(sql());
    assert.equal((c.match(/< \(p_before_at, p_before_id\)/g) ?? []).length, 5, "ein Keyset je Art");
    assert.doesNotMatch(c, /\boffset\b/i);
    assert.equal((c.match(/limit v_limit;/g) ?? []).length, 5);
  });

  it("gibt keine E-Mail, keine Bankdaten und keine Personenspalten außer den Namen heraus", () => {
    const c = code(sql());
    assert.doesNotMatch(c, /email|iban|bic\b|bank_|to_jsonb|row_to_json/i);
    // Namen: nur first_name/last_name
    for (const m of c.matchAll(/\b[a-z]\.(\w+name\w*)\b/g)) {
      assert.ok(["first_name", "last_name", "passenger_name", "legal_name", "communication_name"].includes(m[1]), m[1]);
    }
  });

  it("entzieht anon das Ausführen, lässt authenticated zu und endet mit der Härtung", () => {
    const c = code(sql());
    assert.match(c, /revoke execute on function freigabe_verlauf\(text, integer, timestamptz, uuid\) from public, anon;/);
    assert.match(c, /grant execute on function freigabe_verlauf\(text, integer, timestamptz, uuid\) to authenticated;/);
    assert.match(c.trim(), /select harden_definer_functions\(\);$/);
  });
});

describe("ADM-081: Cursor und Antwort lesen", () => {
  it("die Seite hat 20 Zeilen", () => {
    assert.equal(VERLAUF_SEITE, 20);
  });

  it("ein Cursor ist ein Paar aus Zeitpunkt (mit Mikrosekunden) und Kennung — sonst nichts", () => {
    const id = "0a9a3f42-3c11-4d6e-9d5e-7a1c2f3b4d5e";
    assert.equal(istVerlaufCursor({ at: "2026-10-05T15:48:16.647038+00:00", id }), true);
    assert.equal(istVerlaufCursor({ at: "2026-10-05T15:48:16+02:00", id }), true);
    assert.equal(istVerlaufCursor({ at: "2026-10-05 15:48:16.5Z", id }), true);
    for (const kaputt of [
      null,
      undefined,
      "x",
      {},
      { at: "2026-10-05", id },
      { at: "gestern", id },
      { at: "2026-10-05T15:48:16.647038+00:00", id: "nicht-uuid" },
      { at: "2026-10-05T15:48:16.647038+00:00" },
      { id },
      { at: 5, id },
      { at: "2026-10-05T15:48:16.647038+00:00'; drop table person; --", id },
    ]) {
      assert.equal(istVerlaufCursor(kaputt), false, JSON.stringify(kaputt));
    }
  });

  it("parseVerlauf nimmt nur Zeilen mit Kennung und Zeitpunkt, hält den Zeitpunkt als Zeichenkette", () => {
    const zeilen = parseVerlauf([
      {
        objekt_id: "a",
        entschieden_am: "2026-10-05T15:48:16.647038+00:00",
        entschieden_von: "Paulina Muster",
        titel: "Keynote",
        detail: "Hauptbühne",
        notiz: "ok",
        betrag_cents: 15190,
        termin: "2027-04-16T07:00:00+00:00",
      },
      { objekt_id: "b", entschieden_am: "2026-10-05T15:00:00+00:00", titel: "", extra: "weg" },
      { objekt_id: "c" },
      { entschieden_am: "2026-10-05T15:00:00+00:00" },
      null,
      "x",
    ]);
    assert.equal(zeilen.length, 2);
    assert.equal(zeilen[0].entschieden_am, "2026-10-05T15:48:16.647038+00:00", "die Mikrosekunden bleiben");
    assert.equal(zeilen[0].betrag_cents, 15190);
    assert.equal(zeilen[1].titel, "—", "ein leerer Titel wird zum Gedankenstrich");
    assert.equal(zeilen[1].entschieden_von, null);
    assert.equal(zeilen[1].betrag_cents, null);
    assert.deepEqual(parseVerlauf(null), []);
    assert.deepEqual(parseVerlauf({}), []);
  });
});

describe("ADM-081: Server-Action und Ansicht", () => {
  it("die Action prüft denselben Abschnitt wie die Seite und gibt nur eine gültige Anfrage an die Datenbank", () => {
    const a = quelle("app/(admin)/admin/einreichungen/actions.ts");
    assert.match(a, /^"use server";/);
    assert.match(a, /requireAnyAdminSection\(FREIGABE_ABSCHNITTE, FREIGABE_PFAD\)/);
    assert.match(a, /!istFreigabeArt\(art\)\) return \{ ok: false, key: "invalid_argument" \}/);
    assert.match(a, /!istVerlaufCursor\(cursor\)\) return \{ ok: false, key: "invalid_argument" \}/);
    assert.match(a, /mayEnterAdminSection\(FREIGABE_ABSCHNITT\[art\], roleNames\)\)\) return \{ ok: false, key: "not_allowed" \}/);
    // eine Zeile mehr gefragt: so weiß die Oberfläche, ob es weitergeht, ohne leere Folgeseite
    assert.match(a, /p_limit: VERLAUF_SEITE \+ 1,/);
    assert.match(a, /zeilen: zeilen\.slice\(0, VERLAUF_SEITE\), hatMehr: zeilen\.length > VERLAUF_SEITE/);
    // die Tor-Prüfung steht vor dem Datenbankaufruf
    assert.ok(a.indexOf("mayEnterAdminSection(FREIGABE_ABSCHNITT[art]") < a.indexOf('rpc("freigabe_verlauf"'));
  });

  it("die Ansicht lädt erst beim Aufklappen und schickt den Cursor als Zeichenketten zurück", () => {
    const k = quelle("app/(admin)/admin/einreichungen/FreigabeVerlauf.tsx");
    assert.match(k, /wurzel\.current\?\.closest\("details"\)/);
    assert.match(k, /block\.addEventListener\("toggle", laden\)/);
    assert.match(k, /if \(block\.open && !gestartet\.current\)/);
    // der Cursor ist die Zeichenkette aus der Datenbank, nicht ein Date (verlöre Mikrosekunden)
    assert.match(k, /const weiter = letzte \? \{ at: letzte\.entschieden_am, id: letzte\.objekt_id \} : null;/);
    assert.doesNotMatch(k, /toISOString|getTime|Date\.parse/);
    // Fehler und Leerzustand sind Meldungen, keine leere Fläche
    assert.match(k, /<p role="alert"/);
    assert.match(k, /\{t\.empty\}/);
    assert.match(k, /\{fehler \? t\.retry : t\.loadMore\}/);
    // Seiten hängen sich an; die erste ersetzt
    assert.match(k, /setZeilen\(\(alt\) => \(von \? \[\.\.\.alt, \.\.\.res\.zeilen\] : res\.zeilen\)\)/);
  });

  it("die Seite zeigt den Verlauf je Reiter in einem Block, der beim Wechsel zurückgesetzt wird", () => {
    const s = quelle("app/(admin)/admin/einreichungen/page.tsx");
    assert.match(s, /<Block key=\{art\} id="bereits-freigegeben" titel=\{ta\.history\.title\} ebene="h2"/);
    assert.match(s, /<FreigabeVerlauf art=\{art\} dateLocale=\{t\.meta\.dateLocale\} t=\{ta\.history\} rpcMessages=\{t\.rpc\} \/>/);
    // geschlossen beim Laden: der Block bekommt kein `offen`
    assert.doesNotMatch(s.slice(s.indexOf("<Block key={art}"), s.indexOf("</Block>")), /\boffen\b/);
  });

  it("alle Texte stehen in DE und EN", () => {
    const schluessel = ["title", "empty", "loading", "loadMore", "retry", "decidedBy", "unknownDecider"];
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache).adminApprovals.history;
      for (const k of schluessel) assert.ok(w[k], `${sprache}.adminApprovals.history.${k}`);
    }
  });
});
