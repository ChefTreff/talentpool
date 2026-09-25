create or replace function set_speaker_stage_candidates(p_profile_id uuid, p_stage_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_sp speaker_profile%rowtype; v_ids uuid[]; v_before jsonb; v_fremd boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce(can_manage_speaker(p_profile_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids
    from unnest(coalesce(p_stage_ids, '{}')) x where x is not null;
  -- Jede Bühne gehört zu einer Veranstaltung dieser Edition — der Edition selbst
  -- oder einem Teilevent wie dem Summit. Alle, nicht mindestens eine.
  select exists (
    select 1 from unnest(v_ids) x
     where not exists (select 1 from stage st join event ev on ev.id = st.event_id
                        where st.id = x and (ev.id = v_sp.edition_id or ev.edition_id = v_sp.edition_id))
  ) into v_fremd;
  if v_fremd then raise exception 'stage_not_in_edition' using errcode = 'P0001'; end if;

  select coalesce(jsonb_agg(c.stage_id order by c.stage_id), '[]'::jsonb) into v_before
    from speaker_stage_candidate c where c.profile_id = p_profile_id;
  delete from speaker_stage_candidate c where c.profile_id = p_profile_id and not (c.stage_id = any (v_ids));
  insert into speaker_stage_candidate (profile_id, stage_id, created_by)
    select p_profile_id, x, v_me from unnest(v_ids) x
  on conflict (profile_id, stage_id) do nothing;

  perform log_audit('speaker.stage_candidates', 'speaker_profile', p_profile_id::text,
                    jsonb_build_object('stage_ids', v_before), jsonb_build_object('stage_ids', to_jsonb(v_ids)));
  return coalesce(array_length(v_ids, 1), 0);
end $$;
