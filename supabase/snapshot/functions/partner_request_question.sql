create or replace function partner_request_question(p_session_id uuid, p_label_de text, p_label_en text, p_type text, p_purpose text, p_options jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_id uuid; v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if v_se.partner_org_id is null or not partner_can_edit(v_se.partner_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_label_de, '')), '') is null then raise exception 'fields_required' using errcode = '22023', detail = 'label_de'; end if;
  -- Ohne Zweck keine Freigabe: die Stelle, an der begründet wird, wozu eine Frage dient.
  if nullif(btrim(coalesce(p_purpose, '')), '') is null then raise exception 'fields_required' using errcode = '22023', detail = 'purpose'; end if;
  if p_type not in ('text','textarea','select','multiselect','boolean','url','number') then
    raise exception 'invalid_type' using errcode = '22023', detail = coalesce(p_type, 'null');
  end if;

  -- Höchstens zwei eigene Fragen je Session (Antwort C, seit Welle 1).
  select count(*)::integer into v_n from session_question
   where session_id = p_session_id and question_id is null;
  if v_n >= 2 then raise exception 'too_many_questions' using errcode = 'P0001', detail = v_n::text; end if;

  insert into session_question (session_id, label_de, label_en, type, options, required, sort_order, requested_by, purpose)
  values (p_session_id, btrim(p_label_de), nullif(btrim(coalesce(p_label_en, '')), ''), p_type, p_options, false, 90,
          current_person_id(), btrim(p_purpose))
  returning id into v_id;
  perform log_audit('partner.question_request', 'session_question', v_id::text, null,
                    jsonb_build_object('session_id', p_session_id, 'purpose', btrim(p_purpose)));
  return v_id;
end $$;
