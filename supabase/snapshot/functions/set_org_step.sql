create or replace function set_org_step(p_org_id uuid, p_topic text, p_key text, p_done boolean, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from org_step s where s.topic = p_topic and s.key = p_key) then
    raise exception 'invalid_step' using errcode = '22023', detail = p_topic || '/' || p_key;
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_id::text;
  end if;

  if p_done then
    insert into org_step_check (org_edition_id, topic, key, done_by)
    values (v_oe.id, p_topic, p_key, current_person_id())
    -- Nichts tun, nicht überschreiben: sonst wanderte der Zeitpunkt bei jedem
    -- erneuten Laden nach vorn und die Auswertung wüsste nicht mehr, wann es
    -- wirklich passiert ist.
    on conflict (org_edition_id, topic, key) do nothing;
  else
    delete from org_step_check
     where org_edition_id = v_oe.id and topic = p_topic and key = p_key;
  end if;

  perform log_audit('org_step.set', 'org_edition', v_oe.id::text, null,
                    jsonb_build_object('topic', p_topic, 'key', p_key, 'done', p_done));
end $$;
