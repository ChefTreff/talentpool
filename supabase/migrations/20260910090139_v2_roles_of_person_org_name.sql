-- =============================================================================
-- 0023 · roles_of_person: Organisationsname aus communication_name/legal_name
--   (organization hat keine Spalte `name`; Befund aus supabase/tests/v2_roles_admin.sql)
-- =============================================================================
set search_path = public, extensions;

create or replace function roles_of_person(p_person_id uuid)
returns table (
  id uuid, role text, scope_type text, scope_id uuid, edition_id uuid, portal text, scope_label text,
  valid_from timestamptz, valid_to timestamptz, active boolean, note text, granted_by uuid, created_at timestamptz
)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not has_role('admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select ra.id, ra.role, ra.scope_type, ra.scope_id, ra.edition_id, ra.portal,
           case ra.scope_type
             when 'edition'   then (select e.name from event e where e.id = ra.edition_id)
             when 'portal'    then ra.portal
             when 'org'       then (select coalesce(o.communication_name, o.legal_name) from organization o where o.id = ra.scope_id)
             when 'stage'     then (select s.name from stage s where s.id = ra.scope_id)
             when 'stage_day' then (select s.name || ' · ' || d.day_date::text
                                    from stage_day sd join stage s on s.id = sd.stage_id join event_day d on d.id = sd.event_day_id
                                    where sd.id = ra.scope_id)
             when 'slot'      then (select s.name || ' · ' || to_char(sl.start_at at time zone 'Europe/Berlin', 'DD.MM. HH24:MI')
                                    from slot sl join stage s on s.id = sl.stage_id where sl.id = ra.scope_id)
             else null end,
           ra.valid_from, ra.valid_to,
           (ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())),
           ra.note, ra.granted_by, ra.created_at
    from role_assignment ra
    where ra.person_id = p_person_id
    order by (ra.valid_to is null or ra.valid_to > now()) desc, ra.role, ra.created_at;
end $$;

select harden_definer_functions();
