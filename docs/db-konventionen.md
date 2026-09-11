# Datenbank-Konventionen (Migrationen, RPCs, Tests)

Gilt für jede Session, die Migrationen schreibt — ab Welle 4 auch die Build-Session (Entscheidung 11.09.2026). **Angewendet** wird eine Migration ausschließlich von der Architektur-/Security-Session (Supabase-MCP `apply_migration`, Datei danach auf die Server-Version umbenannt, Eintrag im Entscheidungslog). Die Prüfung vor dem Anwenden folgt genau dieser Liste.

## 1 · Migrationsdatei
- Eine Migration = ein Thema. Dateiname vorläufig `supabase/migrations/2026MMDD2359NN_<thema>.sql`; die Architektur-Session ersetzt den Zeitstempel durch die Server-Version.
- Kopf: `-- 00NN · <Titel>: Zweck, Anlass (PR/Fund/Entscheidung), Abweichungen`. Erste Zeile Code: `set search_path = public, extensions;`. Letzte Zeile: `select harden_definer_functions();` (entzieht anon das EXECUTE auf SECURITY-DEFINER-Funktionen, pinnt `search_path`).
- Angewendete Migrationen sind unveränderlich: Korrektur = neue Migration. Nie „mal eben“ im Dashboard ändern.
- Rückgabetyp einer Funktion ändern ⇒ `drop function if exists f(args);` + `create function` (und alle Aufrufer prüfen). Signatur erweitern mit Default ⇒ alte Signatur droppen, sonst entsteht ein Overload.

## 2 · Funktionen
- Muster: `language plpgsql [stable] security definer set search_path = public, extensions as $$ … $$;`
- `stable` nur ohne Schreibzugriff. Audit oder Mail in der Funktion ⇒ `volatile` (STABLE + Schreiben = 25006 über PostgREST).
- Neue Funktionen sind per Default für `authenticated` ausführbar. Interne Helfer, Trigger-Funktionen und alles, was nur der Server aufruft: `revoke execute on function f(args) from public, anon, authenticated;`
- Rechteprüfung ganz oben, in dieser Reihenfolge:
  - nicht eingeloggt: `if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;`
  - nicht berechtigt: `raise exception 'not allowed' using errcode = '42501'` (optional `detail` mit dem Grund-Schlüssel, z. B. `host_org_required`).
  - service_role oder Team: `if auth.uid() is not null and not is_partner_team() then … 42501`. Nur service_role: `if auth.uid() is not null then … 42501`.
- Parameter mit Präfix `p_`, lokale Variablen `v_`, Records `r`/`c`. Eingaben trimmen (`nullif(btrim(...), '')`), Vokabular über `is_vocab_key(vokabular, wert)` prüfen.
- Konfiguration in Tabellen, nicht in Env (`event.hubspot_*`, `event.swapcard_event_id`, `product.grants_role`); Team-RPC `set_edition_*` mit Audit.
- Audit für Team-/Admin-Aktionen: `perform log_audit('<bereich>.<aktion>', '<object_type>', <id>::text, <before jsonb|null>, <after jsonb>);`
- Mails nur über `queue_mail(template_key, person_id, vars, related_type, related_id)` (dedupe je Vorlage × Person × Bezug, solange `queued`); Sprache aus `person.preferred_language` (Fallback de).
- Wiederkehrendes in `run_application_housekeeping()` einhängen (Cron `/api/cron/mail` alle 10 Minuten), Rückgabe als jsonb-Zähler.

## 3 · Fehlerschlüssel (Vertrag mit der Oberfläche)
| Code | Bedeutung | Meldung |
|---|---|---|
| `28000` | nicht angemeldet | `not authenticated` |
| `42501` | nicht erlaubt | `not allowed`, optional `detail` |
| `P0002` | nicht gefunden | `<ding>_not_found` |
| `22023` | ungültige Eingabe | `invalid_<x>`, `<x>_required`, `unknown_sku`, `file_rules` (+ `detail`) |
| `P0001` | Geschäftsregel | Meldung = Schlüssel in snake_case, `detail` = Kontext (`I-17066:10`, Feldschlüssel, Status) |
| `23505` / `23P01` / `23514` | Constraint | werden generisch übersetzt |

Jeder neue Schlüssel gehört im selben PR in `lib/rpc-error.ts` (`BUSINESS_KEYS`) und in beide Wörterbücher (`lib/i18n/de.json`, `en.json`); der Test `tests/partner.test.ts` prüft das.

## 4 · plpgsql-Fallen (alle schon passiert)
- `RETURNS TABLE`: jede Spalte im Query qualifizieren (`a.id`), sonst 42702 „ambiguous“; Ausgabespalten nicht `position`/`name` unqualifiziert verwenden.
- `set_config('request.jwt.claims', …, true)` in einer **eigenen** Anweisung, nicht im selben Statement wie der geprüfte Aufruf.
- `get stacked diagnostics v_detail = pg_exception_detail;` liefert das `detail` im Test.
- `mail_log` hat `queued_at`, kein `created_at`. Spalten werden erst zur Laufzeit geprüft — Test muss den Pfad wirklich ausführen.
- `role_assignment_valid_chk`: `valid_to > valid_from`; in derselben Transaktion ist `valid_from = now()` ⇒ beenden über `delete`, nicht `valid_to = now()`.
- `queue_mail` dedupliziert je Person: Fan-outs brauchen die Person im Schlüssel (0042).
- Postgres-Regex: Wiederholungen max. `{255}`.
- Trigger: `after insert or update of <spalten> or delete … for each row`, Funktion `return coalesce(new, old)`, security definer + revoke.

## 5 · Tabellen, Grants, Storage
- RLS auf jeder Tabelle, Spalten-Grants statt Tabellen-Grants für sensible Spalten (`revoke select (spalte)` wirkt nicht gegen einen Tabellen-Grant — 0032).
- Integrations-/Protokolltabellen (`external_ref`, `sync_*`, `webhook_event`) ohne Grants für anon/authenticated; das Team liest über RPCs.
- Buckets privat mit Pfadregel `<edition>/<org>/<kind>/<datei>` (`*_path_allowed(name, write)`); öffentliche Buckets nur für von Natur aus öffentliche Inhalte (Produktbilder, freigegebene Logos), Schreiben nur service_role.
- Referenzen zu Fremdsystemen in `external_ref` (system, object_type, object_id ⇒ external_id, meta) über `set_external_ref`/`list_external_refs`.

## 6 · Test je Migration (`supabase/tests/<name>.sql`)
```sql
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; …
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global'); -- Rolle je Abschnitt setzen/entziehen
  -- Aufbau, dann je Schritt: insert into t_res values ('01_…', …); Negativfälle in begin … exception when others then … end;
end $$;
select * from t_res order by step;
rollback;
```
- Kopfkommentar: was der Test belegt. Schritte nummeriert; Negativfälle schreiben `'ALLOWED (BUG)'`, wenn etwas durchgeht, das nicht darf.
- Grants prüfen mit `has_function_privilege('authenticated', 'f(args)', 'execute')` — der Test läuft als Superuser und übergeht Grants.
- Mails über `mail_log` prüfen (Testperson ist EN: DE-Inhalte an einem DE-Kontakt prüfen).
- Rollback stellt alles wieder her; Wegwerf-Daten trotzdem sprechend benennen. Zeile in `supabase/tests/README.md` ergänzen (Datei, Migrationen, was geprüft wird).

## 7 · Doku je Migration
- `docs/datenmodell-v2.md` (Zeile des Bereichs ergänzen), Runbook bei Integrationen, `docs/mail-plan.md` bei Vorlagen, Kontrakt-Absatz im Arbeitsauftrag für die Oberfläche (RPC-Signaturen, Fehlerschlüssel, Rollenregel).
- `docs/schema.md` erzeugt die Architektur-Session nach dem Anwenden (`node --env-file=.env.local scripts/gen-schema-doc.mjs`).
- Abweichungen vom Arbeitsauftrag als Vorschlag in die PR-Beschreibung; den Eintrag in `docs/entscheidungen.md` schreibt die Architektur-Session.

## 8 · Ablauf Build-Session mit Migration
1. Migration + Test + Code + Doku im Feature-Branch, PR-Titel mit „Migration enthalten“, Kontrakt in der Beschreibung.
2. Architektur-Session prüft nach dieser Liste, wendet an, benennt um, führt den Test aus, schreibt das Entscheidungslog und kommentiert am PR („Migration 00NN live“).
3. Erst danach Walkthrough gegen die Datenbank (fünf Regeln für Wegwerf-Konten), dann Gate und Merge.
