create or replace function partner_stage_guests(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, person_id uuid, edition_id uuid, first_name text, last_name text, email text, job_title text, organization_name text, editable boolean, consent_at timestamp with time zone, photo_asset_id uuid, photo_path text, sessions jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select sp.id, p.id, sp.edition_id, p.first_name, p.last_name,
           case when sp.partner_editable_until_login and p.auth_user_id is null then pe.email::text end,
           sp.job_title, sp.organization_name,
           (sp.partner_editable_until_login and p.auth_user_id is null),
           sp.stage_guest_consent_at, sp.photo_asset_id, a.storage_path,
           -- Nur Sessions dieser Organisation — die Person kann anderswo auftreten, das geht den Partner nichts an.
           coalesce((select jsonb_agg(jsonb_build_object('session_id', se.id, 'title_de', se.title_de,
                                                         'start_at', sl.start_at, 'publish_status', se.publish_status)
                                      order by sl.start_at nulls last)
                       from session_speaker ss
                       join session se on se.id = ss.session_id
                       left join slot sl on sl.id = se.slot_id
                       left join stage st on st.id = sl.stage_id
                      where ss.person_id = sp.person_id
                        and (se.host_org_id = p_org_id or se.partner_org_id = p_org_id or st.partner_org_id = p_org_id)
                        and (se.event_id = v_oe.edition_id
                             or se.event_id in (select ev.id from event ev where ev.edition_id = v_oe.edition_id))),
                    '[]'::jsonb)
      from speaker_profile sp
      join person p on p.id = sp.person_id and p.deleted_at is null
      left join person_email pe on pe.person_id = p.id and pe.is_primary
      left join speaker_asset a on a.id = sp.photo_asset_id
     where sp.stage_guest and sp.created_by_org_id = p_org_id and sp.edition_id = v_oe.edition_id
     order by p.last_name nulls last, p.first_name nulls last;
end $$;
