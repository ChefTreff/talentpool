create or replace function speaker_audit_felder(p_after jsonb, p_person uuid)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'extensions'
AS $$
  select jsonb_build_object('felder', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(p_after) as k), '[]'::jsonb))
         || case when p_person is null then '{}'::jsonb else jsonb_build_object('person_id', p_person) end
$$;
