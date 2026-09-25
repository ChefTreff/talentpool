create or replace function partner_remove_stage_guest(p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile; v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found or not v_sp.stage_guest then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not partner_can_edit(v_sp.created_by_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;

  delete from session_speaker ss
   using session se
   left join slot sl on sl.id = se.slot_id
   left join stage st on st.id = sl.stage_id
   where ss.session_id = se.id and ss.person_id = v_sp.person_id
     and (se.host_org_id = v_sp.created_by_org_id or se.partner_org_id = v_sp.created_by_org_id
          or st.partner_org_id = v_sp.created_by_org_id)
     and (se.event_id = v_sp.edition_id or se.event_id in (select ev.id from event ev where ev.edition_id = v_sp.edition_id));
  get diagnostics v_n = row_count;
  -- Porträt-Zeilen gehen per ON DELETE CASCADE mit; die Dateien hat die Oberfläche vorher entfernt.
  delete from speaker_profile where id = v_sp.id;
  perform log_audit('partner.stage_guest_remove', 'speaker_profile', v_sp.id::text,
                    jsonb_build_object('org_id', v_sp.created_by_org_id, 'person_id', v_sp.person_id),
                    jsonb_build_object('sessions', v_n));
end $$;
