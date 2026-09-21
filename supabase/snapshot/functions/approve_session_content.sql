create or replace function approve_session_content(p_submission_id uuid, p_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_s session_submission%rowtype; v_lang text;
begin
  select * into v_s from session_submission where id = p_submission_id for update;
  if not found then raise exception 'submission_not_found' using errcode = 'P0002'; end if;
  if not (can_edit_session(v_s.session_id) or can_manage_speaker(v_s.speaker_profile_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_s.status <> 'submitted' then raise exception 'not_pending' using errcode = 'P0001', detail = v_s.status; end if;
  v_lang := coalesce(nullif(p_overrides->>'language', ''), v_s.language);
  update session set
    title_de       = coalesce(nullif(btrim(p_overrides->>'title_de'), ''),       case when v_lang = 'de' then v_s.title else title_de end),
    title_en       = coalesce(nullif(btrim(p_overrides->>'title_en'), ''),       case when v_lang = 'de' then title_en else v_s.title end),
    description_de = coalesce(nullif(btrim(p_overrides->>'description_de'), ''), case when v_lang = 'de' then coalesce(v_s.description, description_de) else description_de end),
    description_en = coalesce(nullif(btrim(p_overrides->>'description_en'), ''), case when v_lang = 'de' then description_en else coalesce(v_s.description, description_en) end),
    language       = coalesce(v_lang, language),
    updated_by     = current_person_id()
  where id = v_s.session_id;
  update session_submission
     set status = 'approved', reviewed_by = current_person_id(), reviewed_at = now(), review_note = nullif(btrim(p_overrides->>'review_note'), '')
   where id = p_submission_id;
  perform log_audit('session.content_approved', 'session', v_s.session_id::text, null, jsonb_build_object('submission_id', p_submission_id, 'overrides', p_overrides));
end $$;
