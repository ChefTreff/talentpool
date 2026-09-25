create or replace function speaker_travel_list(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, person_id uuid, first_name text, last_name text, job_title text, organization_name text, pipeline_status text, owner_person_id uuid, owner_name text, arrival_date date, arrival_time time without time zone, arrival_mode text, arrival_ref text, departure_date date, departure_time time without time zone, departure_mode text, departure_ref text, needs_pickup boolean, needs_dropoff boolean, note text, hotel_label text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_role('speaker_manager') or has_role('admin') or has_role('area_lead_speaker')
          or has_role('programme_team') or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select sp.id, sp.person_id, p.first_name, p.last_name, sp.job_title, sp.organization_name,
           sp.pipeline_status, sp.owner_person_id,
           (select btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, ''))
              from person o where o.id = sp.owner_person_id),
           t.arrival_date, t.arrival_time, t.arrival_mode, t.arrival_ref,
           t.departure_date, t.departure_time, t.departure_mode, t.departure_ref,
           coalesce(t.needs_pickup, false), coalesce(t.needs_dropoff, false), t.note,
           (select q.label_de from hospitality_booking b join hospitality_quota q on q.id = b.quota_id
             where b.profile_id = sp.id and b.kind = 'hotel' and b.status = 'confirmed'
             order by b.confirmed_at desc limit 1),
           t.updated_at
      from speaker_profile sp
      join person p on p.id = sp.person_id and p.deleted_at is null
      left join speaker_travel t on t.profile_id = sp.id
     where (p_edition_id is null or sp.edition_id = p_edition_id)
       -- Die Produktion braucht die Liste, ohne je Speaker zuständig zu sein.
       and (is_production_team() or can_manage_speaker(sp.id))
       -- SPK-070: Gäste des Partners reisen nicht über uns.
       and not sp.stage_guest
     order by t.arrival_date nulls last, t.arrival_time nulls last,
              p.last_name nulls last, p.first_name nulls last;
end $$;
