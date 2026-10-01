create or replace function person_merge_preview(p_survivor uuid, p_merged uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_res jsonb; v_people jsonb;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('duplicates') then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Die beiden Personen, wie sie vorher dastehen — für die Gegenüberstellung.
  select jsonb_object_agg(case when p.id = p_survivor then 'survivor' else 'merged' end, jsonb_build_object(
           'name', nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           'email', (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           'emails', (select count(*) from person_email pe where pe.person_id = p.id),
           'has_account', p.auth_user_id is not null,
           'blocked', p.access_blocked_at is not null,
           'created_at', p.created_at))
    into v_people from person p where p.id in (p_survivor, p_merged);
  begin
    v_res := person_merge_core(p_survivor, p_merged);
    -- Alles zurücknehmen; v_res überlebt das (Variablen sind nicht Teil der Transaktion).
    raise exception 'preview_rollback' using errcode = 'P0098';
  exception when sqlstate 'P0098' then null;
  end;
  return (v_res->'report') || coalesce(v_people, '{}');
end $$;
