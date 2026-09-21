create or replace function partner_company_tour(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(stop_id uuid, tour_id uuid, tour_name text, track text, meeting_point text, tour_starts_at timestamp with time zone, tour_ends_at timestamp with time zone, sort_order integer, arrival_at timestamp with time zone, departure_at timestamp with time zone, address text, contact_name text, contact_email text, contact_phone text, time_note text, snacks boolean, notes_public text, target_profile jsonb, photos_allowed boolean, filled_at timestamp with time zone, lead_name text, lead_role_de text, lead_role_en text, lead_email text, lead_phone text, lead_photo_path text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select st.id, ct.id, ct.name, ct.track, ct.meeting_point, ct.starts_at, ct.ends_at,
           st.sort_order, st.arrival_at, st.departure_at, st.address,
           st.contact_name, st.contact_email::text, st.contact_phone,
           st.time_note, st.snacks, st.notes_public, st.target_profile, st.photos_allowed, st.filled_at,
           ec.display_name, ec.role_label_de, ec.role_label_en, ec.email::text, ec.phone, ec.photo_path
      from company_tour_stop st
      join company_tour ct on ct.id = st.tour_id
      left join edition_contact ec on ec.id = ct.lead_contact_id
     where st.host_org_id = p_org_id and ct.edition_id = v_oe.edition_id
     order by ct.starts_at nulls last, st.sort_order;
end $$;
