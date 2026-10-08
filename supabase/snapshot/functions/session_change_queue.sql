create or replace function session_change_queue(p_key text, p_target uuid, p_profile uuid, p_org_id uuid, p_session_id uuid, p_old jsonb, p_new jsonb, p_tz text, p_event text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_row mail_log%rowtype; v_had boolean; v_loc text; v_alt jsonb; v_lines text; v_vars jsonb; v_mail bigint; v_n integer; v_org text;
begin
  select * into v_row from mail_log
   where template_key = p_key and related_id = p_session_id and person_id = p_target and status = 'queued'
   order by id desc limit 1;
  v_had := found;
  v_loc := case when v_had and v_row.locale in ('de', 'en') then v_row.locale else mail_locale_for(p_target) end;
  -- Der Stand vor der ersten Änderung im Fenster: aus der wartenden Zeile, sonst der Stand vor dieser Änderung.
  v_alt := case when v_had then jsonb_build_object(
                  'title_de', v_row.meta->'vars'->'alt_title_de', 'title_en', v_row.meta->'vars'->'alt_title_en',
                  'start_at', v_row.meta->'vars'->'alt_start_at', 'end_at', v_row.meta->'vars'->'alt_end_at',
                  'stage_id', v_row.meta->'vars'->'alt_stage_id', 'stage_name', v_row.meta->'vars'->'alt_stage_name')
                else p_old end;
  v_lines := session_change_lines(v_alt, p_new, p_tz, v_loc);
  if v_lines = '' then
    -- Nichts (mehr) zu melden: die Folgeänderungen haben sich aufgehoben, oder die Änderung ist in dieser Sprache nicht sichtbar.
    v_n := cancel_queued_mail(p_key, p_session_id, p_target, 'unchanged');
    if v_n > 0 then
      perform log_audit('mail.session_change', 'session', p_session_id::text, null,
        jsonb_build_object('person_id', p_target, 'template', p_key, 'state', 'cancelled', 'reason', 'unchanged'));
    end if;
    return null;
  end if;
  v_vars := jsonb_build_object(
    'session_title', regexp_replace(coalesce(case when v_loc = 'en' then coalesce(nullif(p_new->>'title_en', ''), nullif(p_new->>'title_de', ''))
                                                  else coalesce(nullif(p_new->>'title_de', ''), nullif(p_new->>'title_en', '')) end, ''), '\s+', ' ', 'g'),
    'event_name', coalesce(p_event, ''),
    'changes', v_lines,
    'alt_title_de', v_alt->'title_de', 'alt_title_en', v_alt->'title_en',
    'alt_start_at', v_alt->'start_at', 'alt_end_at', v_alt->'end_at',
    'alt_stage_id', v_alt->'stage_id', 'alt_stage_name', v_alt->'stage_name');
  if p_org_id is not null then
    select coalesce(o.communication_name, o.legal_name) into v_org from organization o where o.id = p_org_id;
    v_vars := v_vars || jsonb_build_object('org_name', coalesce(v_org, ''));
  end if;
  if p_profile is not null then
    v_mail := queue_speaker_mail_debounced(p_key, p_profile, v_vars, 'session', p_session_id, interval '15 minutes', 'alt_');
  else
    v_mail := queue_mail_debounced(p_key, p_target, v_vars, 'session', p_session_id, interval '15 minutes', 'alt_');
  end if;
  if v_mail is not null and p_org_id is not null then
    -- CC-Kontakte der Organisation in Kopie, genau an der Mail an den Hauptkontakt (PART-063).
    perform partner_mail_cc(v_mail, p_org_id);
  end if;
  if v_mail is not null and not v_had then
    perform log_audit('mail.session_change', 'session', p_session_id::text, null,
      jsonb_build_object('person_id', p_target, 'template', p_key, 'state', 'queued', 'mail_id', v_mail));
  end if;
  return v_mail;
end $$;
