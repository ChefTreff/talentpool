create or replace function queue_mail_debounced(p_template_key text, p_person_id uuid, p_vars jsonb DEFAULT '{}'::jsonb, p_related_type text DEFAULT NULL::text, p_related_id uuid DEFAULT NULL::uuid, p_delay interval DEFAULT '00:15:00'::interval, p_keep_prefix text DEFAULT 'alt_'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_row mail_log%rowtype; v_id bigint; v_vars jsonb; v_keep jsonb;
begin
  if nullif(btrim(coalesce(p_template_key, '')), '') is null or p_person_id is null then
    raise exception 'invalid_mail_key' using errcode = '22023';
  end if;
  if p_related_id is null then raise exception 'related_id_required' using errcode = '22023'; end if;
  if p_delay is null or p_delay <= interval '0' or p_delay > interval '24 hours' then
    raise exception 'invalid_delay' using errcode = '22023';
  end if;
  -- Ein Schlüssel nach dem anderen: zwei gleichzeitige Aufrufe legen nicht zwei wartende Zeilen an.
  perform pg_advisory_xact_lock(hashtextextended('mail_debounce:' || p_template_key || ':' || p_related_id::text || ':' || p_person_id::text, 0));

  select * into v_row from mail_log
   where template_key = p_template_key and related_id = p_related_id and person_id = p_person_id and status = 'queued'
   order by id desc limit 1 for update;
  if found then
    -- Wartende Zeile: Variablen aktualisieren. Bleiben soll, was die Zeile schon trägt (`first_name`, `on_behalf_of`, …) und jeder
    -- Schlüssel mit dem Präfix (bei der Änderungsmail der Stand vor der ersten Änderung); `send_after` bleibt (festes Fenster).
    v_keep := '{}'::jsonb;
    if nullif(p_keep_prefix, '') is not null then
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_keep
        from jsonb_each(coalesce(v_row.meta->'vars', '{}'::jsonb)) e where starts_with(e.key, p_keep_prefix);
    end if;
    v_vars := coalesce(v_row.meta->'vars', '{}'::jsonb) || coalesce(p_vars, '{}'::jsonb) || v_keep;
    update mail_log set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('vars', v_vars), updated_at = now() where id = v_row.id;
    return v_row.id;
  end if;

  -- Gesperrte Adresse: `queue_mail` schreibt eine `suppressed`-Zeile; je Fenster genügt eine.
  if exists (select 1 from mail_log where template_key = p_template_key and related_id = p_related_id and person_id = p_person_id
                and status = 'suppressed' and queued_at > now() - p_delay) then
    return null;
  end if;
  v_id := queue_mail(p_template_key, p_person_id, p_vars, p_related_type, p_related_id);
  if v_id is null then return null; end if;
  update mail_log set send_after = now() + p_delay where id = v_id and status = 'queued';
  return v_id;
end $$;
