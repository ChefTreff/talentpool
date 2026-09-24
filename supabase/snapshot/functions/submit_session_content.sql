create or replace function submit_session_content(p_session_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_sp uuid; v_id uuid;
  v_lang text := nullif(p_data->>'language', '');
  v_topics text[];
  v_topic text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not is_speaker_side_of(p_session_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Eine Sprache je Session (SPK-052): „Gemischt“ gibt es nicht mehr.
  if v_lang is not null and v_lang not in ('de', 'en') then raise exception 'invalid_language' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_data->>'title', '')), '') is null then raise exception 'title_required' using errcode = '22023'; end if;

  v_topics := coalesce(
    (select array_agg(x) from jsonb_array_elements_text(coalesce(p_data->'topics', '[]'::jsonb)) x), '{}');

  -- Jedes Thema muss im Vokabular stehen (SPK-027). Ohne diese Schleife
  -- bliebe `topics` ein Freitextfeld mit Auswahlknöpfen davor: die Oberfläche
  -- böte eine Liste an, die Datenbank nähme trotzdem alles entgegen.
  foreach v_topic in array v_topics loop
    if not is_vocab_key('session_topic', v_topic) then
      raise exception 'invalid_topic' using errcode = '22023', detail = v_topic;
    end if;
  end loop;

  select sp.id into v_sp
    from speaker_profile sp
    join session_speaker ss on ss.person_id = sp.person_id and ss.session_id = p_session_id
    join session se on se.id = p_session_id
    join event e on e.id = se.event_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)
   where sp.person_id = v_me or is_speaker_assistant(sp.id, v_me)
   order by (sp.person_id = v_me) desc limit 1;
  update session_submission set status = 'superseded' where session_id = p_session_id and status = 'submitted';
  insert into session_submission (session_id, speaker_profile_id, submitted_by, title, description, topics, language, notes)
  values (p_session_id, v_sp, v_me, btrim(p_data->>'title'), nullif(btrim(p_data->>'description'), ''),
          v_topics, v_lang, nullif(btrim(p_data->>'notes'), ''))
  returning id into v_id;
  perform log_audit('session.submission', 'session', p_session_id::text, null, jsonb_build_object('submission_id', v_id, 'speaker_profile_id', v_sp));
  return v_id;
end $$;
