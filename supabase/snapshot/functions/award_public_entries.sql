create or replace function award_public_entries(p_ip_hash text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, topics text[], location text, description text, mission text, project text, website text, university text, founded_year smallint, active_members integer, images text[], status text, voted boolean, apply_until timestamp with time zone, vote_from timestamp with time zone, vote_until timestamp with time zone, apply_open boolean, vote_open boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid := award_current_edition(); v_hash text; w record;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_ed is null then return; end if;
  select * into w from award_windows(v_ed);
  v_hash := award_hash(v_ed, p_ip_hash);
  -- Keine Bewerbung sichtbar? Trotzdem eine Zeile mit den Fenstern — die Seite
  -- braucht sie für „Bewerbung offen bis …".
  if not exists (select 1 from award_application a where a.edition_id = v_ed and a.status in ('accepted', 'finalist', 'winner')) then
    return query select null::uuid, null::text, null::text[], null::text, null::text, null::text, null::text, null::text, null::text,
                        null::smallint, null::integer, null::text[], null::text, false,
                        w.apply_until, w.vote_from, w.vote_until, w.apply_open, w.vote_open;
    return;
  end if;
  return query
    select a.id, a.name, a.topics, a.location, a.description, a.mission, a.project, a.website, a.university,
           a.founded_year, a.active_members, a.images, a.status,
           v_hash is not null and exists (select 1 from award_vote v where v.application_id = a.id and v.voter_hash = v_hash),
           w.apply_until, w.vote_from, w.vote_until, w.apply_open, w.vote_open
      from award_application a
     where a.edition_id = v_ed and a.status in ('accepted', 'finalist', 'winner')
     order by a.status = 'winner' desc, a.status = 'finalist' desc, a.name;
end $$;
