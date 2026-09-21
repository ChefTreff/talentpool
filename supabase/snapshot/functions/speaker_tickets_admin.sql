create or replace function speaker_tickets_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, profile_id uuid, speaker_name text, source text, status text, pass_type text, lounge_access boolean, holder_first_name text, holder_last_name text, holder_email text, issued boolean, vivenu_ticket_id text, requested_at timestamp with time zone, approved_at timestamp with time zone, team_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_speaker_team(p_edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id, t.speaker_profile_id, btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), t.source, t.status, t.pass_type,
           t.lounge_access, t.holder_first_name, t.holder_last_name, t.holder_email::text, (t.barcode is not null), t.vivenu_ticket_id,
           t.created_at, t.approved_at, t.team_note
    from ticket t
    join speaker_profile sp on sp.id = t.speaker_profile_id
    join person p on p.id = sp.person_id
    where t.source in ('speaker', 'speaker_companion')
      and (p_edition_id is null or sp.edition_id = p_edition_id)
    order by case t.status when 'requested' then 0 when 'approved' then 1 when 'valid' then 2 else 3 end, t.created_at;
end $$;
