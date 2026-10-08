create or replace function deadlines_overview(p_edition uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, edition_id uuid, audience text, due_at timestamp with time zone, label_de text, label_en text, description_de text, description_en text, reminder_days integer, reminder_hours integer, custom boolean, can_edit boolean, usage_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_admin_section('deadlines') or has_admin_section('deadlinesSpeaker') or has_admin_section('deadlinesPartner')
          or has_admin_section('deadlinesVolunteers') or has_admin_section('deadlinesSystem')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select d.id, d.edition_id, d.audience, d.due_at, d.label_de, d.label_en, d.description_de, d.description_en,
           d.reminder_lead_hours / 24, d.reminder_lead_hours, d.custom,
           can_edit_deadline(d.audience),
           case when d.custom then deadline_usage_count(d.edition_id, d.key) else 0 end
      from deadline d
     where p_edition is null or d.edition_id = p_edition
     order by d.due_at, d.label_de;
end $$;
