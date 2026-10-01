create or replace function unmerge_persons(p_log_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_log person_merge_log; v_u jsonb; v_s uuid; v_m uuid; v_e jsonb; v_cols text; v_k text; v_acct uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('duplicates') then raise exception 'not allowed' using errcode = '42501'; end if;

  select * into v_log from person_merge_log where id = p_log_id for update;
  if not found then raise exception 'merge_not_found' using errcode = 'P0002'; end if;
  if v_log.undone_at is not null then raise exception 'merge_already_undone' using errcode = 'P0001'; end if;
  v_u := v_log.payload->'undo';
  if v_u is null then raise exception 'merge_undo_unavailable' using errcode = 'P0001'; end if;
  v_s := (v_u->>'survivor_id')::uuid;
  v_m := v_log.merged_person_id;
  -- Ist die bleibende Person inzwischen selbst in eine dritte aufgegangen,
  -- erst jene Zusammenführung zurücknehmen.
  if v_log.surviving_person_id <> v_s or exists (select 1 from person where id = v_m) then
    raise exception 'merge_undo_blocked' using errcode = 'P0001';
  end if;
  perform 1 from person where id = v_s for update;

  -- 1 · Person zurück, ohne Konto (das kommt am Ende).
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
    from pg_attribute a
   where a.attrelid = 'public.person'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
  execute format('insert into person (%s) select %s from jsonb_populate_record(null::person, $1)', v_cols, v_cols)
    using (v_u->'merged_row') || jsonb_build_object('auth_user_id', null);

  -- 2 · Adressen zurück, die primäre wieder primär.
  for v_e in select value from jsonb_array_elements(v_u->'emails') loop
    update person_email set person_id = v_m where id = (v_e->>'id')::uuid and person_id = v_s;
  end loop;
  update person_email set is_primary = true
   where person_id = v_m and id in (select (e->>'id')::uuid from jsonb_array_elements(v_u->'emails') e
                                    where (e->>'primary')::boolean);
  if not exists (select 1 from person_email where person_id = v_m and is_primary) then
    update person_email set is_primary = true
     where id = (select id from person_email where person_id = v_m order by created_at limit 1);
    if not found then raise exception 'merge_undo_blocked' using errcode = 'P0001', detail = 'email'; end if;
  end if;

  -- 3 · Umgehängte Zeilen zurück — nur die protokollierten.
  for v_e in select value from jsonb_array_elements(v_u->'moved') loop
    execute format('update %s t set %I = $1 where t.%I = $2 and exists (select 1 from jsonb_array_elements($3) k where to_jsonb(t) @> k.value)',
                   (v_e->>'t')::regclass, v_e->>'c', v_e->>'c')
      using v_m, v_s, v_e->'pk';
  end loop;

  -- 4 · Gefallene Zeilen zurücklegen.
  for v_e in select value from jsonb_array_elements(v_u->'deleted') loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
      from pg_attribute a
     where a.attrelid = (v_e->>'t')::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
    execute format('insert into %s (%s) overriding system value select %s from jsonb_populate_recordset(null::%s, $1) on conflict do nothing',
                   (v_e->>'t')::regclass, v_cols, v_cols, (v_e->>'t')::regclass)
      using v_e->'rows';
  end loop;
  update org_membership o set roles = array(select jsonb_array_elements_text(b->'roles'))
    from jsonb_array_elements(v_u->'roles_before') b
   where o.id = (b->>'id')::uuid;

  -- 5 · Gefüllte Felder leeren, sofern seither niemand sie geändert hat.
  for v_k in select jsonb_object_keys(v_u->'filled') loop
    execute format('update person p set %I = null where p.id = $1 and to_jsonb(p)->%L = $2', v_k, v_k)
      using v_s, v_u->'filled'->v_k;
  end loop;

  -- 6 · Konto zurück; die Stufe der bleibenden Person wie vorher.
  v_acct := (v_u->>'account')::uuid;
  if v_acct is not null then
    update person set auth_user_id = null where id = v_s and auth_user_id = v_acct;
    update person set auth_user_id = v_acct where id = v_m;
    update person set tier = v_u->'survivor_before'->>'tier' where id = v_s;
  end if;

  update person_merge_log set undone_at = now(), undone_by = current_person_id() where id = p_log_id;
  perform log_audit('person.unmerge', 'person', v_s::text,
    jsonb_build_object('merge_log_id', p_log_id), jsonb_build_object('restored_person_id', v_m));
end $$;
