create or replace function partner_assign_stage_guest(p_session_id uuid, p_profile_id uuid, p_assign boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_stage stage; v_sp speaker_profile; v_buehne boolean; v_talk boolean;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found or not v_sp.stage_guest then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  select st.* into v_stage from slot sl join stage st on st.id = sl.stage_id where sl.id = v_se.slot_id;
  -- Standbühne: nur die Bühne der Organisation, der der Gast gehört, und nur mit dem Recht auf diesen Slot.
  v_buehne := v_stage.id is not null and v_stage.type = 'partner_booth'
              and v_stage.partner_org_id = v_sp.created_by_org_id
              and coalesce(can_edit_slot(v_se.slot_id), false);
  -- Talk: gebucht von derselben Organisation, Speaking-Format wie in partner_add_speaker, nicht auf einer Standbühne.
  v_talk := not v_buehne and v_se.partner_org_id = v_sp.created_by_org_id
            and v_se.format in ('keynote', 'panel', 'talk', 'impulse', 'fireside_chat', 'masterclass')
            and coalesce(v_stage.type, '') <> 'partner_booth'
            and partner_can_edit(v_sp.created_by_org_id);
  if not (v_buehne or v_talk)
     or not exists (select 1 from event ev where ev.id = v_se.event_id
                     and (ev.id = v_sp.edition_id or ev.edition_id = v_sp.edition_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(p_assign, false) then
    insert into session_speaker (session_id, person_id, role, sort_order, confirmed)
    values (p_session_id, v_sp.person_id, 'speaker',
            coalesce((select max(ss.sort_order) + 1 from session_speaker ss where ss.session_id = p_session_id), 0), true)
    on conflict (session_id, person_id, role) do nothing;
  else
    delete from session_speaker where session_id = p_session_id and person_id = v_sp.person_id and role = 'speaker';
  end if;
  perform log_audit(case when coalesce(p_assign, false) then 'partner.stage_guest_assign' else 'partner.stage_guest_unassign' end,
                    'session', p_session_id::text, null,
                    jsonb_build_object('org_id', v_sp.created_by_org_id, 'profile_id', v_sp.id,
                                       'weg', case when v_buehne then 'standbuehne' else 'talk' end));
end $$;
