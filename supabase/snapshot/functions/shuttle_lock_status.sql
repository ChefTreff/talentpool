create or replace function shuttle_lock_status(p_profile_id uuid)
 RETURNS TABLE(locked boolean, lock_from timestamp with time zone, contact_name text, contact_phone text, contact_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v_at timestamptz;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- Wer für dieses Profil Fahrten anfordern darf, darf auch den Stand lesen — und niemand sonst. Eine unbekannte Id ist für jeden
  -- `can_request_shuttle` = falsch, also 42501: kein Hinweis, ob es sie gibt.
  if not coalesce(can_request_shuttle(p_profile_id), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  select sp.edition_id into v_ed from speaker_profile sp where sp.id = p_profile_id;
  v_at := shuttle_lock_at(p_profile_id);

  return query
    select (v_at is not null and v_at <= now() and not coalesce(is_speaker_team(null), false)),
           v_at,
           c.display_name,
           nullif(btrim(c.phone), ''),
           nullif(btrim(c.email::text), '')
      from (select 1) x
      left join lateral (
        -- Der Kontakt `speaker_lead`, den das Profil zugeordnet hat, sonst der Standard der Edition (wie `my_contacts()`).
        select ec.display_name, ec.phone, ec.email
          from edition_contact ec
         where ec.edition_id = v_ed and ec.type = 'speaker_lead'
           and ec.id = coalesce((select sp.lead_contact_id from speaker_profile sp where sp.id = p_profile_id),
                                (select d.id from edition_contact d where d.edition_id = v_ed and d.type = 'speaker_lead' and d.is_default limit 1))
      ) c on true;
end $$;
