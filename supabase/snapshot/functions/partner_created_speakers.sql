create or replace function partner_created_speakers(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, person_id uuid, first_name text, last_name text, job_title text, organization_name text, partner_org_id uuid, partner_name text, pipeline_status text, owner_person_id uuid, owner_name text, lead_contact_id uuid, buddy_contact_id uuid, buddy_name text, sessions jsonb, created_at timestamp with time zone, is_new boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not (has_role('speaker_manager') or has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  return query
    select sp.id, sp.person_id, p.first_name, p.last_name, sp.job_title, sp.organization_name,
           sp.created_by_org_id, coalesce(o.communication_name, o.legal_name),
           sp.pipeline_status, sp.owner_person_id,
           (select nullif(btrim(coalesce(ow.first_name, '') || ' ' || coalesce(ow.last_name, '')), '')
              from person ow where ow.id = sp.owner_person_id),
           sp.lead_contact_id, sp.buddy_contact_id,
           (select bc.display_name from edition_contact bc where bc.id = sp.buddy_contact_id),
           -- Programmpunkte der Edition, an denen die Person spricht (wie `manager_speakers`): Titel, Bühne, Beginn.
           coalesce((select jsonb_agg(jsonb_build_object('title_de', se.title_de, 'title_en', se.title_en,
                                                          'stage_name', st.name, 'start_at', sl.start_at)
                                       order by sl.start_at nulls last, se.title_de)
                       from session_speaker ss
                       join session se on se.id = ss.session_id
                       join event ev on ev.id = se.event_id
                       left join slot sl on sl.id = se.slot_id
                       left join stage st on st.id = sl.stage_id
                      where ss.person_id = sp.person_id
                        and (ev.edition_id = sp.edition_id or ev.id = sp.edition_id)), '[]'::jsonb),
           sp.created_at,
           (sp.owner_person_id is null or sp.pipeline_status = 'lead')
      from speaker_profile sp
      join person p on p.id = sp.person_id
      join organization o on o.id = sp.created_by_org_id
     where sp.edition_id = v_ed
       and sp.created_by_org_id is not null
       and not sp.stage_guest
       and sp.declined_at is null
       and sp.pipeline_status <> 'declined'
       and p.deleted_at is null
       and can_manage_speaker(sp.id)
     order by (sp.owner_person_id is null or sp.pipeline_status = 'lead') desc,
              sp.created_at desc, p.last_name nulls last, p.first_name nulls last;
end $$;
