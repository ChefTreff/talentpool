create or replace function my_speaker_tasks(p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile
   where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me
                   or can_manage_speaker(v_sp.id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', st.id, 'key', st.key,
             'label_de', st.label_de, 'label_en', st.label_en,
             'description_de', st.description_de, 'description_en', st.description_en,
             'deadline_key', st.deadline_key,
             'done_at', tk.done_at)
           order by st.sort_order, st.key)
      from speaker_task st
      left join speaker_task_tick tk on tk.task_id = st.id and tk.profile_id = v_sp.id
     where st.edition_id = v_sp.edition_id and st.is_active), '[]'::jsonb);
end $$;
