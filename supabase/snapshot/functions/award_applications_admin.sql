create or replace function award_applications_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, topics text[], location text, description text, mission text, project text, contact_first_name text, contact_last_name text, contact_email text, founded_year smallint, active_members integer, website text, university text, notes text, images text[], status text, source text, organization_id uuid, organization_name text, votes bigint, created_at timestamp with time zone, decided_at timestamp with time zone, decided_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid := coalesce(p_edition_id, award_current_edition());
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('initiatives') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.id, a.name, a.topics, a.location, a.description, a.mission, a.project,
           a.contact_first_name, a.contact_last_name, a.contact_email::text, a.founded_year, a.active_members,
           a.website, a.university, a.notes, a.images, a.status, a.source, a.organization_id,
           coalesce(nullif(btrim(o.communication_name), ''), o.legal_name),
           (select count(*) from award_vote v where v.application_id = a.id),
           a.created_at, a.decided_at,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
      from award_application a
      left join organization o on o.id = a.organization_id
      left join person p on p.id = a.decided_by
     where a.edition_id = v_ed
     order by (select count(*) from award_vote v where v.application_id = a.id) desc, a.created_at;
end $$;
