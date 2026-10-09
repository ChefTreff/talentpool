create or replace function speaker_audit_bereinigen()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  -- Nur Eintraege, die noch mehr als `felder` und `person_id` tragen; schon bereinigte und die neuen von SPK-094 fallen heraus (idempotent).
  with ziel as (
    select a.id, sp.person_id
      from audit_log a
      left join speaker_profile sp on sp.id::text = a.object_id
     where a.action = 'speaker.assistant_update'
       and jsonb_typeof(a.after) = 'object'
       and a.after - 'felder' - 'person_id' <> '{}'::jsonb
  ), neu as (
    update audit_log a
       set after = speaker_audit_felder(a.after, z.person_id), before = null
      from ziel z
     where a.id = z.id
    returning a.id
  )
  select count(*)::integer into v_n from neu;
  return v_n;
end $$;
