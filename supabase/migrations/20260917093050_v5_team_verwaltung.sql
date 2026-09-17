-- =============================================================================
-- 0106 · Welle 5 · Das Team als Liste: wer gehört dazu, mit welcher Rolle
--     Angewendet von der Architektur-Session am 17.09.2026 als 20260917093050
--
-- Konrad: „im Admin Bereich eine Sektion, wo ich Personen und Rollen verwalten
-- kann des Teams". Es gibt `/admin/rollen`, aber das beantwortet die andere
-- Frage: dort sucht man **eine** Person und vergibt ihr **eine** Rolle. Wer
-- überhaupt zum Team gehört, steht nirgends — man müsste zwanzig Personen
-- einzeln nachschlagen.
--
-- Das ist auch die Voraussetzung für den Zugriffsschnitt: einen Bereich über
-- die Admin-Rolle zu begrenzen, ohne eine Stelle zu haben, an der man sie
-- vergibt, wäre eine Falltür.
--
-- **Was zählt als Teamrolle?** Die Frage steht hier an einer Stelle
-- (`team_role_keys()`) statt in der Oberfläche: Admin, die sechs
-- Bereichsleitungen, Programm- und Produktionsteam, Speaker-Manager,
-- Volunteer-Lead und das Kiosk-Konto. Nicht dabei sind die Rollen, die
-- Teilnehmende bekommen (`talent`, `speaker`, `partner_contact`, `volunteer`,
-- …) — sonst stünde der halbe Talentpool in der Teamliste.
--
-- Drei Dinge, die die Liste zeigt und die man sonst einzeln suchen müsste:
--
-- * **Portalzugang.** Eine Rolle ohne Konto ist die häufigste stille Panne:
--   die Rolle ist vergeben, die Person kommt trotzdem nicht rein, und niemand
--   sieht warum. Deshalb steht `has_account` in der Zeile.
-- * **Der Scope**, aufgelöst zu einem Namen (Edition, Bühne, Portal) statt als
--   UUID. Eine Rolle „für diese Edition" ist etwas anderes als eine globale,
--   und der Unterschied entscheidet im nächsten Jahr.
-- * **Wie viele Admins es gibt.** Wer den letzten entzieht, sperrt alle aus;
--   `revoke_role` verhindert das (P0001 `last_admin`), aber die Oberfläche soll
--   es sagen können, bevor jemand klickt.
--
-- Fehlerschlüssel: 42501 ohne Admin-Rolle.
--
-- Test: supabase/tests/v5_team_verwaltung.sql
-- =============================================================================
set search_path = public, extensions;

/**
 * Die Rollen, die jemanden zum Team machen.
 *
 * An einer Stelle, damit Liste, Auswahl und spätere Prüfungen dieselbe Antwort
 * geben. Kommt eine Rolle dazu, steht sie hier — nicht in drei Dateien.
 */
create or replace function team_role_keys() returns text[]
language sql immutable set search_path = public, extensions as $$
  select array['admin', 'area_lead_talent', 'area_lead_speaker', 'area_lead_partner',
               'area_lead_volunteers', 'area_lead_hackathon', 'area_lead_production',
               'programme_team', 'production_team', 'speaker_manager', 'volunteer_lead',
               'checkin_operator']::text[]
$$;
grant execute on function team_role_keys() to authenticated;

/**
 * Das Team mit allen aktiven Teamrollen je Person.
 *
 * `admins` ist bei jeder Zeile dieselbe Zahl — verschwenderisch, aber die
 * Alternative wäre ein zweiter Aufruf nur für eine Zahl, die zu jeder Zeile
 * gehört (darf ich diesen Admin entziehen?).
 */
create or replace function team_members()
returns table (
  person_id uuid, display_name text, email text, has_account boolean,
  is_admin boolean, roles jsonb, since timestamptz, admins integer
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_admins integer;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;

  select count(distinct ra.person_id)::integer into v_admins
    from role_assignment ra
   where ra.role = 'admin' and ra.scope_type = 'global'
     and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now());

  return query
    select p.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           p.auth_user_id is not null,
           bool_or(ra.role = 'admin'),
           jsonb_agg(jsonb_build_object(
             'id', ra.id, 'role', ra.role, 'scope_type', ra.scope_type,
             'scope_id', ra.scope_id, 'edition_id', ra.edition_id, 'portal', ra.portal,
             'valid_to', ra.valid_to,
             -- Der Scope als Name. Eine UUID in der Zeile kann niemand lesen,
             -- und „global" von „für diese Edition" zu unterscheiden ist der
             -- ganze Zweck der Spalte.
             'scope_label', case
               when ra.scope_type = 'global' then null
               when ra.edition_id is not null then (select e.name from event e where e.id = ra.edition_id)
               when ra.scope_type = 'portal' then ra.portal
               when ra.scope_type = 'stage' then (select st.name from stage st where st.id = ra.scope_id)
               when ra.scope_type = 'org' then (select coalesce(o.communication_name, o.legal_name)
                                                  from organization o where o.id = ra.scope_id)
               else null end)
             order by ra.role) ,
           min(ra.valid_from),
           v_admins
      from person p
      join role_assignment ra on ra.person_id = p.id
     where p.deleted_at is null
       and ra.role = any (team_role_keys())
       and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
     group by p.id, p.first_name, p.last_name, p.auth_user_id
     order by bool_or(ra.role = 'admin') desc, 2 nulls last;
end $$;

select harden_definer_functions();
