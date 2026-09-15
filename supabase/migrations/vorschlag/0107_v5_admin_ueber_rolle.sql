-- =============================================================================
-- 0107 · Welle 5 · Der Admin-Bereich hängt an der Rolle, nicht an einer Liste
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
-- Setzt 0106 voraus (Team-Sektion — dort wird die Rolle vergeben).
--
-- Konrad am 15.09.: „Der Admin-Bereich soll am Ende begrenzt werden über eine
-- Rolle. Ggf. wird es noch weitere Personen geben."
--
-- Bisher entschied `is_staff()` über den Admin-Bereich, und `is_staff()` hiess:
-- **es gibt eine Zeile in `staff_user`.** Diese Tabelle wird von einem Skript
-- gefüllt (`scripts/make-staff.mjs`), steht in keiner Oberfläche und kennt
-- keine Abstufung — drin oder draussen. Eine zweite Person aufzunehmen hiess
-- bisher: Skript ausführen.
--
-- Ab hier gilt: **Team = Rolle `admin`.** Damit ist das Aufnehmen ein Vorgang
-- in der Oberfläche (`/admin/team`, 0106), er steht im Audit-Log, und er lässt
-- sich genauso wieder zurücknehmen.
--
-- Warum `is_staff()` selbst umgestellt wird und nicht nur die Oberfläche: der
-- Begriff steckt in 54 Prüfungen quer durch das Schema. Bliebe er an
-- `staff_user` hängen, hätte die zweite Person die Seiten offen und liefe in
-- jeder einzelnen RPC in 42501 — sichtbar, aber unbenutzbar. Zwei Begriffe für
-- dieselbe Sache sind genau die Sorte Abkürzung, die später niemand mehr
-- findet.
--
-- **Niemand verliert dabei etwas**, und das wird nicht angenommen, sondern
-- geprüft: die Migration bricht ab, wenn es eine `staff_user`-Zeile gibt, deren
-- Person keine aktive globale Admin-Rolle hat. Dann ist erst die Rolle zu
-- vergeben (`/admin/team`), danach diese Migration. Eine Migration, die im
-- Vorbeigehen Admin-Rechte verteilt, wäre die falsche Antwort auf dieselbe
-- Frage.
--
-- ---------------------------------------------------------------------------
-- Inventar: wo `is_staff()` steht (Bedingung der Architektur-Session)
--
-- 54 Vorkommen in 25 Migrationen, verteilt auf 51 Objekte. Der entscheidende
-- Punkt vorweg: **`is_staff()` hiess nie „irgendein Teammitglied".** Es hiess
-- immer „steht in `staff_user`", und in dieser Tabelle steht genau ein Konto.
-- Bereichsleitungen, Programm- und Produktionsteam waren nie darin — sie
-- kommen über ihre eigenen Rollen an ihre Daten (`is_speaker_team()`,
-- `is_partner_team()`, `is_production_team()`). Für alle heute existierenden
-- Konten ändert dieser Schnitt deshalb **nichts**; er ändert nur, wie man auf
-- die Liste kommt: künftig über eine Rollenvergabe mit Audit statt über ein
-- Skript.
--
-- SQL, nach Bedeutung sortiert:
--
-- * **Lesepolicies** (13): `event_read_auth`, `product_read`,
--   `deliverable_template_read`, `org_edition_read`, `org_product_read`,
--   `deliverable_read`, `partner_asset_read`, `booth_read`, `shop_order_read`,
--   `shop_order_line_read`, `shop_request_read`, `ota_member_sel`, `sa_read`,
--   `hq_read`, `hb_read`, `cr_self_ins`. Überall als **zusätzlicher** Zweig
--   neben der fachlichen Bedingung („eigene Zeile ODER Team") — der Schnitt
--   nimmt also niemandem seine eigenen Daten weg.
-- * **Team-RPCs** (Hospitality, Partner, Shop, Videos, Editionsdateien, Wiki,
--   Fristen, Personensuche, Anrede): `is_staff()` ist dort die Grenze „nur
--   Verwaltung". Sie heisst ab jetzt „nur Admin".
-- * **Gemischte Prüfungen**, bei denen die Bereichsrolle den Alltag trägt und
--   `is_staff()` nur der Notausgang ist: `catering_summary`, `catering_notes`,
--   `catering_coverage` (`is_production_team() or is_staff()`),
--   `can_read_checkin_stats` (`is_staff() or checkin_edition() = …`),
--   `org_steps_progress`, `set_edition_file`. Hier bleibt der Alltag
--   unverändert, weil die Bereichsrolle unangetastet ist.
-- * **Zwei Stellen mit eigener Bedeutung**, die bewusst mitwandern:
--   `my_kb_audiences()` (Team sieht alle Wiki-Zielgruppen — ab jetzt der Admin;
--   alle anderen sehen weiter genau ihre eigenen) und `session_context()`
--   (liefert das Flag an die Oberfläche, siehe unten).
-- * **Unberührt:** Cron- und Serverpfade prüfen `auth.uid() is null`
--   (`purge_checkins`, `backfill_ticket_pass_types`, Integrations-RPCs) und
--   das Kiosk (`checkin_operator`) hängt an seiner eigenen Rolle.
--
-- TypeScript:
--
-- * `lib/areas.ts` — der Admin-Bereich trägt jetzt `roles: ["admin"]`; der
--   Zweig `area.staff → isStaff` und der Parameter sind ersatzlos weg, weil
--   kein Bereich ihn mehr nutzt. `tests/areas.test.ts` zieht mit.
-- * `lib/auth.ts` — `canEnterArea`/`areasFor` ohne das Flag; `SessionContext.isStaff`
--   bleibt (es kommt aus `session_context()` und heisst jetzt „ist Admin").
-- * `app/auth/callback/route.ts`, `app/(checkin)/checkin/page.tsx` — Aufrufe angepasst.
-- * `app/api/produktion/edition-files/route.ts` ruft `is_staff()` als RPC und
--   folgt damit automatisch.
--
-- `staff_user` und `scripts/make-staff.mjs` bleiben stehen, entscheiden aber
-- nichts mehr. Sie zu löschen ist ein eigener Schritt für einen Tag, an dem
-- niemand mehr auf sie zeigt.
--
-- Fehlerschlüssel: keine neuen.
--
-- Test: supabase/tests/v5_admin_ueber_rolle.sql
-- =============================================================================
set search_path = public, extensions;

/**
 * Wer stünde nach dem Schnitt draussen?
 *
 * Bleibt als Diagnose stehen: die Frage „wer hat Zugang, warum, und was
 * passiert, wenn wir die Definition ändern" kommt beim nächsten Umbau wieder.
 */
create or replace function staff_users_without_admin()
returns table (auth_user_id uuid, email text, person_id uuid)
language sql stable security definer set search_path = public, extensions as $$
  select su.auth_user_id, su.email::text, p.id
    from staff_user su
    left join person p on p.auth_user_id = su.auth_user_id and p.deleted_at is null
   where not exists (
     select 1 from role_assignment ra
      where ra.person_id = p.id and ra.role = 'admin' and ra.scope_type = 'global'
        and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()))
$$;
revoke execute on function staff_users_without_admin() from public, anon, authenticated;

do $$
declare v_n integer; v_wer text;
begin
  select count(*)::integer, string_agg(coalesce(s.email, s.auth_user_id::text), ', ')
    into v_n, v_wer from staff_users_without_admin() s;
  if v_n > 0 then
    raise exception
      'Abbruch: % Konto/Konten in staff_user ohne aktive Admin-Rolle (%). Erst in /admin/team die Rolle admin vergeben, dann diese Migration anwenden.',
      v_n, v_wer;
  end if;
end $$;

/**
 * Team = aktive Rolle `admin`.
 *
 * Der Scope ist bewusst nicht eingeschränkt: `has_role('admin')` trifft auch
 * eine Zuweisung mit Editionsbezug. Eine solche wird in `/admin/team` gar nicht
 * erst angeboten (die Admin-Rolle ist dort immer global), und eine Regel, die
 * hier enger wäre als dort, würde beim nächsten Handgriff über die
 * Rollenverwaltung zur stillen Sperre.
 */
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select has_role('admin')
$$;

comment on function is_staff() is
  'Team im Sinne des Admin-Bereichs = aktive Rolle admin (seit 0107). Die Tabelle staff_user entscheidet nichts mehr; sie und scripts/make-staff.mjs bleiben nur stehen, bis nichts mehr auf sie zeigt.';
comment on table staff_user is
  'Historisch: bis 0107 die Liste des Teams. Entscheidet seit 0107 nichts mehr — Zugang gibt die Rolle admin (is_staff()).';

select harden_definer_functions();
