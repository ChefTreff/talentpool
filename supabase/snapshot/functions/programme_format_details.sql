create or replace function programme_format_details()
 RETURNS TABLE(session_id uuid, format text, host_name text, location_text text, image_path text, job_title text, job_posting_text text, job_posting_url text, interview_mode text, target_profile jsonb, tour jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select s.id, s.format,
           nullif(btrim(coalesce(o.communication_name, o.legal_name)), ''),
           nullif(s.format_details->>'location_text', ''),
           (select pa.storage_path from partner_asset pa
             where s.format = 'side_event'
               and pa.id = nullif(s.format_details->>'image_asset_id', '')::uuid
               and pa.status <> 'rejected'),
           nullif(s.format_details->>'job_title', ''),
           nullif(s.format_details->>'job_posting_text', ''),
           nullif(s.format_details->>'job_posting_url', ''),
           nullif(s.format_details->>'interview_mode', ''),
           case when s.format_details ? 'target_profile' then s.format_details->'target_profile' end,
           (select jsonb_build_object(
                     'name', ct.name,
                     'meeting_point', ct.meeting_point,
                     'starts_at', ct.starts_at,
                     'ends_at', ct.ends_at,
                     'stops', coalesce((
                       select jsonb_agg(jsonb_build_object(
                                'sort_order', st.sort_order,
                                'host_name', nullif(btrim(coalesce(so.communication_name, so.legal_name)), ''),
                                'address', st.address,
                                'arrival_at', st.arrival_at,
                                'departure_at', st.departure_at,
                                'notes_public', st.notes_public,
                                'target_profile', st.target_profile)
                              order by st.sort_order)
                         from company_tour_stop st
                         left join organization so on so.id = st.host_org_id
                        where st.tour_id = ct.id), '[]'::jsonb))
              from company_tour ct where ct.session_id = s.id)
      from session s
      left join organization o on o.id = coalesce(s.host_org_id, s.partner_org_id)
     where s.publish_status = 'published'
       and s.format in ('masterclass', 'company_tour', 'interview_table', 'side_event');
end $$;
