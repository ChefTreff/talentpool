create or replace function ack_volunteer_safety(p_version text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_ed uuid; v_prof uuid; v_ver text := nullif(btrim(coalesce(p_version, '')), '');
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_ver is null or length(v_ver) > 40 then raise exception 'fields_required' using errcode = '22023'; end if;
  v_ed := volunteer_edition(p_edition_id);
  select v.id into v_prof from volunteer_profile v where v.person_id = v_pid and v.edition_id = v_ed and v.status = 'accepted';
  if v_prof is null then raise exception 'not_accepted' using errcode = 'P0001'; end if;
  update volunteer_profile set safety_ack_at = now(), safety_ack_version = v_ver where id = v_prof;
  perform log_audit('volunteer.safety_ack', 'volunteer_profile', v_prof::text, null, jsonb_build_object('version', v_ver));
end $$;
