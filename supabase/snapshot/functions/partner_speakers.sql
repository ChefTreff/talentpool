create or replace function partner_speakers(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, person_id uuid, session_id uuid, session_title text, display_name text, can_edit boolean, confirmed boolean, pipeline_status text, first_name text, last_name text, title text, job_title text, organization_name text, bio_short_de text, bio_short_en text, bio_long_de text, bio_long_en text, linkedin_url text, socials jsonb, photo_asset_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select sp.id, sp.person_id, se.id, se.title_de,
           btrim(concat_ws(' ', pe.first_name, pe.last_name)),
           sp.partner_editable_until_login, coalesce(ss.confirmed, false), sp.pipeline_status,
           -- Ab hier nur, solange das Pflegerecht gilt. Sonst sind es fremde Stammdaten.
           case when sp.partner_editable_until_login then pe.first_name end,
           case when sp.partner_editable_until_login then pe.last_name end,
           case when sp.partner_editable_until_login then pe.title end,
           case when sp.partner_editable_until_login then sp.job_title end,
           case when sp.partner_editable_until_login then sp.organization_name end,
           case when sp.partner_editable_until_login then sp.bio_short_de end,
           case when sp.partner_editable_until_login then sp.bio_short_en end,
           case when sp.partner_editable_until_login then sp.bio_long_de end,
           case when sp.partner_editable_until_login then sp.bio_long_en end,
           case when sp.partner_editable_until_login then pe.linkedin_url end,
           case when sp.partner_editable_until_login then sp.socials end,
           case when sp.partner_editable_until_login then sp.photo_asset_id end
      from speaker_profile sp
      join person pe on pe.id = sp.person_id
      left join session_speaker ss on ss.person_id = sp.person_id
      left join session se on se.id = ss.session_id and se.partner_org_id = p_org_id
     where sp.created_by_org_id = p_org_id
       and sp.edition_id = v_oe.edition_id
       -- PART-081: Gäste der Standbühne stehen in ihrer eigenen Liste (partner_stage_guests).
       and not sp.stage_guest
     order by se.title_de nulls last, pe.last_name, pe.first_name;
end $$;
