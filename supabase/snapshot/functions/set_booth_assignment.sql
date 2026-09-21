create or replace function set_booth_assignment(p_booth_id uuid, p_org_edition_id uuid, p_event_day_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; v_id uuid;
begin
  if not (is_partner_team() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from booth b where b.id = p_booth_id) then
    raise exception 'booth_not_found' using errcode = 'P0002', detail = coalesce(p_booth_id::text, 'null');
  end if;
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = coalesce(p_org_edition_id::text, 'null');
  end if;
  -- Ein Tag einer anderen Edition waere eine Belegung, die es nie gibt.
  if p_event_day_id is not null and not exists (
       select 1 from event_day d where d.id = p_event_day_id and d.event_id = v_oe.edition_id) then
    raise exception 'invalid_day' using errcode = '22023', detail = p_event_day_id::text;
  end if;

  insert into booth_assignment (booth_id, org_edition_id, event_day_id, note)
  values (p_booth_id, p_org_edition_id, p_event_day_id, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (booth_id, event_day_id) do update
     set org_edition_id = excluded.org_edition_id, note = excluded.note, updated_at = now()
  returning id into v_id;

  perform log_audit('booth.assignment', 'booth', p_booth_id::text, null,
                    jsonb_build_object('org_edition_id', p_org_edition_id,
                                       'event_day_id', p_event_day_id, 'assignment_id', v_id));
  return v_id;
end $$;
