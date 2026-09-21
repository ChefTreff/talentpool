create or replace function speaker_next_steps(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_sp speaker_profile%rowtype; v_p person%rowtype; v_me uuid := current_person_id();
  v_profile boolean; v_photo boolean; v_consents boolean; v_session boolean; v_ticket boolean; v_content boolean; v_presentation boolean; v_open text[] := '{}';
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(p_profile_id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_p from person where id = v_sp.person_id;
  v_profile  := coalesce(nullif(btrim(v_p.first_name), ''), '') <> '' and coalesce(nullif(btrim(v_p.last_name), ''), '') <> ''
                and coalesce(nullif(btrim(v_sp.job_title), ''), '') <> '' and coalesce(nullif(btrim(v_sp.bio_short_en), ''), '') <> '';
  v_photo    := v_sp.photo_asset_id is not null;
  v_consents := coalesce((select c.granted from consent_current c where c.person_id = v_p.id and c.consent_type = 'speaker_release'), false)
                and coalesce((select c.granted from consent_current c where c.person_id = v_p.id and c.consent_type = 'photo_video'), false);
  v_session  := exists (select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                        where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id));
  v_content  := v_session and not exists (
                  select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                  where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id)
                    and not exists (select 1 from session_submission s where s.session_id = se.id and s.status = 'approved')
                    and coalesce(se.description_de, se.description_en) is null);
  v_presentation := v_session and not exists (
                  select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                  where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id)
                    and se.format not in ('panel', 'networking', 'reception', 'side_event', 'break', 'company_tour')
                    and not exists (select 1 from speaker_asset a where a.profile_id = v_sp.id and a.session_id = se.id and a.kind = 'presentation' and a.is_current));
  v_ticket   := exists (select 1 from ticket t join event e on e.id = t.event_id
                        where t.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id) and t.status in ('valid', 'requested'));
  if not v_profile      then v_open := array_append(v_open, 'profile'); end if;
  if not v_photo        then v_open := array_append(v_open, 'photo'); end if;
  if not v_consents     then v_open := array_append(v_open, 'consents'); end if;
  if not v_session      then v_open := array_append(v_open, 'session'); end if;
  if v_session and not v_content      then v_open := array_append(v_open, 'session_content'); end if;
  if v_session and not v_presentation then v_open := array_append(v_open, 'presentation'); end if;
  if not v_ticket       then v_open := array_append(v_open, 'ticket'); end if;
  return jsonb_build_object(
    'profile', v_profile, 'photo', v_photo, 'consents', v_consents, 'session', v_session,
    'session_content', case when v_session then v_content end,
    'presentation', case when v_session then v_presentation end,
    'ticket', v_ticket, 'hospitality', v_sp.hospitality_status,
    'open', to_jsonb(v_open)
  );
end $$;
