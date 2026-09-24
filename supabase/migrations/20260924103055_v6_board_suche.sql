-- 0155 · Welle 6 · Board-Suche für Stage Leads (LEAD-019/020): can_search_board, board_search_people, board_search_partners, board_session_refs
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924103055.
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- **Befund (24.09., gegen die Datenbank geprüft):** im Board sucht der Drawer
-- Speaker über `search_people` und Partner über `search_organizations`. Beide
-- verlangen `is_staff()` — und `is_staff()` ist `has_role('admin')`. Ein Stage
-- Lead bekommt deshalb bei **jeder** Suche 42501: er kann weder einen Speaker
-- noch eine Moderation noch einen Partner an seinen Slot hängen, obwohl
-- `set_session_speakers` und `upsert_session` (`host_org_id`,
-- `moderation_person_id`) ihn ausdrücklich lassen. Das Recht zum Schreiben war
-- da, der Weg zum Finden nicht.
--
-- **Kein aufgebohrtes `search_people`.** Die Funktion durchsucht den ganzen
-- Talentpool und gibt Stufe und Wohnort mit heraus; sie für Leads zu öffnen,
-- hiesse, jedem Stage Lead den Talentpool zu zeigen. Stattdessen zwei schmale
-- Funktionen, die genau das können, was das Board braucht:
--
--   `board_search_people(event, text)` — nur Personen mit Speaker-Profil in der
--   Edition dieser Veranstaltung; zurück kommen Kennung, Name und die
--   Organisation (damit man zwei gleichnamige auseinanderhält). **Keine**
--   Mailadresse, keine Stufe, kein Ort.
--
--   `board_search_partners(event, text)` — nur Organisationen mit
--   `org_edition` in dieser Edition, also die Partner dieses Jahrgangs
--   („Partner per Suche aus allen Partnern", LEAD-010/ADM-025); zurück kommen
--   Kennung und Name.
--
-- **Wer darf:** das Programm-Team der Veranstaltung (`is_programme_editor`)
-- und `speaker_manager` in dieser Edition — global, mit Edition-Scope oder mit
-- Stage-Scope auf einer Bühne dieser Veranstaltung. Genau die Leute, die das
-- Board bearbeiten dürfen.
--
-- Offen und bewusst **nicht** hier: `upsert_session` prüft `tags` nicht gegen
-- das Themen-Vokabular `session_topic`. Die Oberfläche bietet nur Werte daraus
-- an; die harte Prüfung wäre ein Eingriff in eine zentrale Funktion, die auch
-- die Partner-Bühne nutzt, und gehört in einen eigenen Schnitt.
--
-- **Für PORT3:** kommt für externe Bühnenleitungen eine eigene Rolle (etwa
-- `stage_lead`, Hinweis der Architektur-Session vom 24.09.), muss
-- `can_search_board` sie mit einschliessen — sonst sucht die externe
-- Bühnenleitung wieder ins Leere.
--
-- Fehlerschlüssel: 42501 ohne Recht · 28000 ohne Login.

set search_path = public, extensions;

/**
 * Darf der Aufrufer im Board dieser Veranstaltung suchen?
 *
 * `coalesce`, damit aus NULL kein Ja wird (Lehre aus 0118).
 */
create or replace function can_search_board(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(
    is_programme_editor(p_event_id)
    or exists (
      select 1
        from event ev
        join active_roles() ra on true
       where ev.id = p_event_id
         and ra.role = 'speaker_manager'
         and (ra.scope_type = 'global'
              or (ra.scope_type = 'edition' and ra.edition_id in (ev.id, ev.edition_id))
              or (ra.scope_type = 'stage'
                  and exists (select 1 from stage st
                               where st.id = ra.scope_id and st.event_id = ev.id)))),
    false)
$$;

revoke all on function can_search_board(uuid) from public, anon;
grant execute on function can_search_board(uuid) to authenticated;

/** Muster für `ilike`, mit maskierten Platzhaltern — wie in `search_people`. */
create or replace function board_like_pattern(p_query text)
returns text
language sql immutable set search_path = public, extensions as $$
  select '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

revoke all on function board_like_pattern(text) from public, anon;
grant execute on function board_like_pattern(text) to authenticated;

create or replace function board_search_people(p_event_id uuid, p_query text, p_limit integer default 10)
returns table (id uuid, display_name text, organization text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid; v_q text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_search_board(p_event_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_query, ''))) < 2 then return; end if;
  select coalesce(ev.edition_id, ev.id) into v_ed from event ev where ev.id = p_event_id;
  v_q := board_like_pattern(p_query);
  return query
    select p.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           sp.organization_name
      from speaker_profile sp
      join person p on p.id = sp.person_id
     where sp.edition_id = v_ed
       and p.deleted_at is null
       and (p.first_name ilike v_q or p.last_name ilike v_q
            or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike v_q
            or coalesce(sp.organization_name, '') ilike v_q)
     order by p.last_name nulls last, p.first_name nulls last
     limit least(greatest(coalesce(p_limit, 10), 1), 25);
end $$;

revoke all on function board_search_people(uuid, text, integer) from public, anon;
grant execute on function board_search_people(uuid, text, integer) to authenticated;

create or replace function board_search_partners(p_event_id uuid, p_query text, p_limit integer default 10)
returns table (id uuid, name text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid; v_q text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_search_board(p_event_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_query, ''))) < 2 then return; end if;
  select coalesce(ev.edition_id, ev.id) into v_ed from event ev where ev.id = p_event_id;
  v_q := board_like_pattern(p_query);
  return query
    select o.id, coalesce(o.communication_name, o.legal_name)
      from organization o
     where exists (select 1 from org_edition oe where oe.org_id = o.id and oe.edition_id = v_ed)
       and (coalesce(o.communication_name, '') ilike v_q or coalesce(o.legal_name, '') ilike v_q)
     order by coalesce(o.communication_name, o.legal_name)
     limit least(greatest(coalesce(p_limit, 10), 1), 25);
end $$;

revoke all on function board_search_partners(uuid, text, integer) from public, anon;
grant execute on function board_search_partners(uuid, text, integer) to authenticated;

/**
 * Wer moderiert und welcher Partner hängt an der Session — mit Namen.
 *
 * Der Drawer zeigt beides an; lesen darf ein Lead `person` und
 * `organization` aber nicht. Also gibt diese Funktion genau die zwei Namen
 * heraus, die zur Session gehören, und sonst nichts — dieselbe Grenze wie die
 * Suche.
 */
create or replace function board_session_refs(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_se session%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if not can_search_board(v_se.event_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'moderation', (select jsonb_build_object('id', p.id, 'name',
                     nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''))
                     from person p where p.id = v_se.moderation_person_id),
    'partner', (select jsonb_build_object('id', o.id, 'name', coalesce(o.communication_name, o.legal_name))
                  from organization o where o.id = v_se.host_org_id));
end $$;

revoke all on function board_session_refs(uuid) from public, anon;
grant execute on function board_session_refs(uuid) to authenticated;

select harden_definer_functions();
