create or replace function partner_add_stage_guest(p_org_id uuid, p_first_name text, p_last_name text, p_job_title text, p_organization text, p_email text, p_consent boolean, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_oe org_edition; v_email citext; v_person uuid; v_neu boolean := false;
  v_sp speaker_profile; v_first text; v_last text; v_job text; v_org text; v_fehlt text[];
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  -- Auflage zu K-32: ohne bestätigte Einwilligung speichern wir die Daten eines anderen Menschen nicht.
  if not coalesce(p_consent, false) then raise exception 'stage_guest_consent_required' using errcode = '22023'; end if;

  v_first := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last  := nullif(btrim(coalesce(p_last_name, '')), '');
  v_job   := nullif(btrim(coalesce(p_job_title, '')), '');
  v_org   := nullif(btrim(coalesce(p_organization, '')), '');
  v_fehlt := array_remove(array[
    case when v_first is null then 'first_name' end, case when v_last is null then 'last_name' end,
    case when v_job is null then 'job_title' end, case when v_org is null then 'organization_name' end], null);
  if cardinality(v_fehlt) > 0 then
    raise exception 'fields_required' using errcode = '22023', detail = array_to_string(v_fehlt, ', ');
  end if;
  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '')::citext;
  if v_email is null or v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if is_suppressed(v_email::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;

  select pe.person_id into v_person from person_email pe join person p on p.id = pe.person_id
   where pe.email = v_email and p.deleted_at is null limit 1;
  if v_person is null then
    insert into person (first_name, last_name) values (v_first, v_last) returning id into v_person;
    insert into person_email (person_id, email, is_primary, verified) values (v_person, v_email, true, false);
    -- Nur diese Person gäbe es ohne den Partner nicht; nur ihren Namen und ihre Adresse darf er pflegen.
    v_neu := true;
  end if;

  select * into v_sp from speaker_profile where person_id = v_person and edition_id = v_oe.edition_id for update;
  if found then
    -- Wer in dieser Edition regulär spricht oder Gast einer anderen Organisation ist, bleibt, was er ist.
    if not v_sp.stage_guest or v_sp.created_by_org_id is distinct from p_org_id then
      raise exception 'already_speaker' using errcode = 'P0001';
    end if;
    update speaker_profile set job_title = v_job, organization_name = v_org, stage_guest_consent_at = now()
     where id = v_sp.id returning * into v_sp;
  else
    insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, job_title,
                                 organization_name, stage_guest, stage_guest_consent_at, lounge_access,
                                 reception_eligible, travel_costs_covered, hospitality_status, created_by_org_id,
                                 partner_editable_until_login, created_by)
    values (v_person, v_oe.edition_id, 'other', 'confirmed', now(), v_job, v_org, true, now(), false,
            false, false, 'none', p_org_id, v_neu, v_me)
    returning * into v_sp;
  end if;

  -- `claimed` wie bei partner_add_speaker: erkennbar, ob der Partner eine bestehende Person nur zugeordnet hat.
  perform log_audit('partner.stage_guest_add', 'speaker_profile', v_sp.id::text, null,
                    jsonb_build_object('org_id', p_org_id, 'person_id', v_person, 'claimed', not v_neu,
                                       'consent_at', v_sp.stage_guest_consent_at));
  return jsonb_build_object('profile_id', v_sp.id, 'edition_id', v_oe.edition_id);
end $$;
