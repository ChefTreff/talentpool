create or replace function speaker_leads_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(person_id uuid, display_name text, email text, assignments jsonb, speakers integer, confirmed integer, declined integer, open_steps integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not can_manage_speaker_leads() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  -- SPK-070: Gäste des Partners (0188) zählen in keiner Spalte — auch nicht,
  -- wenn jemand einen als Owner übernommen hat.
  return query
    select p.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           coalesce((select jsonb_agg(jsonb_build_object(
                              'id', ra.id, 'role', ra.role, 'scope_type', ra.scope_type,
                              'scope_id', ra.scope_id, 'edition_id', ra.edition_id,
                              'valid_to', ra.valid_to)
                            order by ra.role, ra.scope_type)
                     from role_assignment ra
                    where ra.person_id = p.id
                      and ra.role in ('speaker_manager', 'area_lead_speaker')
                      and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())), '[]'::jsonb),
           (select count(*)::integer from speaker_profile sp
             where sp.owner_person_id = p.id and sp.edition_id = v_ed and not sp.stage_guest),
           (select count(*)::integer from speaker_profile sp
             where sp.owner_person_id = p.id and sp.edition_id = v_ed and not sp.stage_guest
               and sp.confirmed_at is not null and sp.declined_at is null),
           (select count(*)::integer from speaker_profile sp
             where sp.owner_person_id = p.id and sp.edition_id = v_ed and not sp.stage_guest
               and sp.declined_at is not null),
           coalesce((select sum(jsonb_array_length(speaker_next_steps(sp.id)->'open'))::integer
                       from speaker_profile sp
                      where sp.owner_person_id = p.id and sp.edition_id = v_ed and not sp.stage_guest), 0)
      from person p
     where p.deleted_at is null and is_speaker_manager(p.id)
     order by 2 nulls last;
end $$;
