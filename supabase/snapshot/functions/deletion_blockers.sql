create or replace function deletion_blockers(p_person_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_out text[] := '{}';
begin
  if p_person_id is null then raise exception 'person_not_found' using errcode = 'P0002'; end if;

  -- Teamrolle: wer den Betrieb mitträgt, verschwindet nicht per Selbstbedienung.
  if exists (
    select 1 from role_assignment ra
     where ra.person_id = p_person_id and ra.role = any (team_role_keys())
       and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()))
  then v_out := array_append(v_out, 'team_role'); end if;

  -- Zugesagter Auftritt einer Edition, die noch bevorsteht.
  if exists (
    select 1 from speaker_profile sp join event e on e.id = sp.edition_id
     where (sp.person_id = p_person_id or is_speaker_assistant(sp.id, p_person_id))
       and sp.confirmed_at is not null and sp.declined_at is null
       and e.end_date >= current_date)
  then v_out := array_append(v_out, 'speaker'); end if;

  -- Angenommene Volunteer-Bewerbung einer Edition, die noch bevorsteht.
  if exists (
    select 1 from volunteer_profile vp join event e on e.id = vp.edition_id
     where vp.person_id = p_person_id and vp.status = 'accepted' and e.end_date >= current_date)
  then v_out := array_append(v_out, 'volunteer'); end if;

  -- Ansprechperson einer Organisation: an der Stelle hängt ein Vertrag.
  if exists (select 1 from org_membership om where om.person_id = p_person_id)
  then v_out := array_append(v_out, 'partner'); end if;

  -- Offener Reisekostenantrag: eine Zahlung, die uns die Person noch schuldet
  -- oder wir ihr. Bis die durch ist, kann niemand verschwinden — und danach
  -- dürfen die Bankdaten weg, ohne dass eine Erstattung ins Leere läuft.
  if exists (
    select 1 from expense_claim ec join speaker_profile sp on sp.id = ec.profile_id
     where sp.person_id = p_person_id and ec.paid_at is null
       and ec.status not in ('rejected', 'cancelled', 'draft'))
  then v_out := array_append(v_out, 'open_expense'); end if;

  return v_out;
end $$;
