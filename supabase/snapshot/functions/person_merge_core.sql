create or replace function person_merge_core(p_survivor uuid, p_merged uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_s jsonb; v_m jsonb; v_fk record; v_pk_expr text; v_pks jsonb; v_pk jsonb; v_row jsonb;
  v_moved jsonb := '[]'; v_moved_rep jsonb := '[]'; v_deleted jsonb := '[]'; v_dedup_rep jsonb := '[]';
  v_conflicts jsonb := '[]'; v_blocking text[] := '{}'; v_roles_before jsonb := '[]';
  v_emails jsonb; v_fill jsonb := '{}'; v_cols text; v_key text;
  v_ok jsonb; v_del jsonb; v_conf integer; v_account uuid;
  -- Mengen ohne eigene Aussage: die doppelte Zeile der zweiten Person darf fallen.
  c_dedup constant text[] := array['person_interest', 'person_language', 'person_acquisition_channel',
                                   'role_assignment', 'speaker_portal_selection', 'org_membership'];
  -- Felder, die nie gefüllt werden: Identität, Konto, Zustand, Herkunft.
  c_keep constant text[] := array['id', 'auth_user_id', 'created_at', 'updated_at', 'deleted_at',
                                  'access_blocked_at', 'tier', 'is_ambassador', 'engagement_score',
                                  'referred_by_person_id', 'source_first'];
begin
  if p_survivor is null or p_merged is null then raise exception 'person_not_found' using errcode = 'P0002'; end if;
  if p_survivor = p_merged then raise exception 'same_person' using errcode = '22023'; end if;

  select to_jsonb(p) into v_s from person p where p.id = p_survivor for update;
  select to_jsonb(p) into v_m from person p where p.id = p_merged for update;
  if v_s is null or v_m is null then raise exception 'person_not_found' using errcode = 'P0002'; end if;
  if v_s->>'deleted_at' is not null or v_m->>'deleted_at' is not null then
    raise exception 'person_deleted' using errcode = '22023';
  end if;

  -- Konto: höchstens eines, und kein gesperrtes umziehen.
  if v_m->>'auth_user_id' is not null then
    if v_s->>'auth_user_id' is not null then
      v_blocking := array_append(v_blocking, 'both_accounts');
    elsif v_m->>'access_blocked_at' is not null then
      v_blocking := array_append(v_blocking, 'account_blocked');
    else
      v_account := (v_m->>'auth_user_id')::uuid;
    end if;
  end if;

  -- E-Mail-Adressen: die zweite Person bringt ihre als weitere Adressen mit.
  select coalesce(jsonb_agg(jsonb_build_object('id', pe.id, 'primary', pe.is_primary)), '[]')
    into v_emails from person_email pe where pe.person_id = p_merged;
  update person_email set is_primary = false where person_id = p_merged and is_primary;
  update person_email set person_id = p_survivor where person_id = p_merged;

  -- Dublettenpaare der zweiten Person: fallen (gesichert); die Suche findet
  -- neue Paare der ersten Person beim nächsten Lauf.
  select coalesce(jsonb_agg(to_jsonb(d)), '[]') into v_row
    from potential_duplicate d where p_merged in (d.person_id_a, d.person_id_b);
  if jsonb_array_length(v_row) > 0 then
    delete from potential_duplicate d where p_merged in (d.person_id_a, d.person_id_b);
    v_deleted := v_deleted || jsonb_build_object('t', 'potential_duplicate', 'rows', v_row);
  end if;

  -- Wer von der zweiten Person geworben wurde, gilt als von der ersten
  -- geworben; hatte die erste die zweite als Werber, entfällt der Verweis.
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id)), '[]') into v_pks
    from person p where p.referred_by_person_id = p_merged and p.id not in (p_survivor, p_merged);
  if jsonb_array_length(v_pks) > 0 then
    update person set referred_by_person_id = p_survivor
     where referred_by_person_id = p_merged and id not in (p_survivor, p_merged);
    v_moved := v_moved || jsonb_build_object('t', 'person', 'c', 'referred_by_person_id', 'pk', v_pks);
    v_moved_rep := v_moved_rep || jsonb_build_object('table', 'person', 'column', 'referred_by_person_id', 'rows', jsonb_array_length(v_pks));
  end if;
  update person set referred_by_person_id = null where id = p_survivor and referred_by_person_id = p_merged;

  -- Alle übrigen Fremdschlüssel auf person(id), aus dem Katalog gelesen.
  for v_fk in
    select c.conrelid as rel, c.conrelid::regclass::text as tbl, r.relname as base, a.attname as col
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.person'::regclass and array_length(c.conkey, 1) = 1
       and not (c.conrelid = 'public.person'::regclass)
       and not (c.conrelid = 'public.person_email'::regclass)
       and not (c.conrelid = 'public.potential_duplicate'::regclass)
     order by 2, 4
  loop
    -- Zeilenschlüssel: der Primärschlüssel, sonst die ganze Zeile.
    select 'jsonb_build_object(' || string_agg(quote_literal(pa.attname) || ', t.' || quote_ident(pa.attname), ', ' order by k.ord) || ')'
      into v_pk_expr
      from pg_index i
      cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
      join pg_attribute pa on pa.attrelid = i.indrelid and pa.attnum = k.attnum
     where i.indrelid = v_fk.rel and i.indisprimary;
    v_pk_expr := coalesce(v_pk_expr, 'to_jsonb(t)');

    execute format('select coalesce(jsonb_agg(%s), ''[]'') from %s t where t.%I = $1', v_pk_expr, v_fk.tbl, v_fk.col)
      into v_pks using p_merged;
    continue when jsonb_array_length(v_pks) = 0;

    v_ok := '[]'; v_del := '[]'; v_conf := 0;
    begin
      execute format('update %s set %I = $1 where %I = $2', v_fk.tbl, v_fk.col, v_fk.col) using p_survivor, p_merged;
      -- Für den Rückweg ohne die umgehängte Spalte selbst: steckt sie im
      -- Primärschlüssel (Interessen, Sprachen, Session-Speaker), trüge der
      -- Schlüssel sonst die alte Person und fände die Zeile nicht wieder.
      select jsonb_agg(e.value - v_fk.col::text) into v_ok from jsonb_array_elements(v_pks) e;
    exception when unique_violation then
      -- Zeilenweise: welche Zeile kollidiert, und darf sie fallen?
      for v_pk in select value from jsonb_array_elements(v_pks) loop
        begin
          execute format('update %s t set %I = $1 where t.%I = $2 and to_jsonb(t) @> $3', v_fk.tbl, v_fk.col, v_fk.col)
            using p_survivor, p_merged, v_pk;
          v_ok := v_ok || jsonb_build_array(v_pk - v_fk.col::text);
        exception when unique_violation then
          if v_fk.base = any (c_dedup) and v_fk.tbl not like '%.%' then
            if v_fk.base = 'org_membership' then
              -- Dieselbe Organisation: Rollen vereinigen, Vorher-Stand sichern.
              select v_roles_before || coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'roles', to_jsonb(s.roles))), '[]')
                into v_roles_before
                from org_membership s join org_membership m on m.org_id = s.org_id
               where s.person_id = p_survivor and m.person_id = p_merged and to_jsonb(m) @> v_pk;
              update org_membership s
                 set roles = (select array_agg(distinct x order by x) from unnest(s.roles || m.roles) x)
                from org_membership m
               where m.org_id = s.org_id and s.person_id = p_survivor and m.person_id = p_merged and to_jsonb(m) @> v_pk;
            end if;
            execute format('delete from %s t where t.%I = $1 and to_jsonb(t) @> $2 returning to_jsonb(t)', v_fk.tbl, v_fk.col)
              into v_row using p_merged, v_pk;
            v_del := v_del || jsonb_build_array(v_row);
          else
            v_conf := v_conf + 1;
          end if;
        end;
      end loop;
    end;

    if jsonb_array_length(v_ok) > 0 then
      v_moved := v_moved || jsonb_build_object('t', v_fk.tbl, 'c', v_fk.col, 'pk', v_ok);
      v_moved_rep := v_moved_rep || jsonb_build_object('table', v_fk.tbl, 'column', v_fk.col, 'rows', jsonb_array_length(v_ok));
    end if;
    if jsonb_array_length(v_del) > 0 then
      v_deleted := v_deleted || jsonb_build_object('t', v_fk.tbl, 'rows', v_del);
      v_dedup_rep := v_dedup_rep || jsonb_build_object('table', v_fk.tbl, 'rows', jsonb_array_length(v_del));
    end if;
    if v_conf > 0 then
      v_conflicts := v_conflicts || jsonb_build_object('table', v_fk.tbl, 'column', v_fk.col, 'rows', v_conf);
    end if;
  end loop;
  if jsonb_array_length(v_conflicts) > 0 then v_blocking := array_append(v_blocking, 'conflicts'); end if;

  -- Leere Felder der ersten Person aus der zweiten füllen — nie überschreiben.
  select coalesce(jsonb_object_agg(a.attname, v_m->a.attname), '{}') into v_fill
    from pg_attribute a
   where a.attrelid = 'public.person'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
     and a.attname <> all (c_keep)
     and jsonb_typeof(coalesce(v_s->a.attname, 'null'::jsonb)) = 'null'
     and jsonb_typeof(coalesce(v_m->a.attname, 'null'::jsonb)) <> 'null';
  if v_fill <> '{}' then
    select string_agg(format('%I = r.%I', k, k), ', ') into v_cols from jsonb_object_keys(v_fill) k;
    execute format('update person p set %s from jsonb_populate_record(null::person, $1) r where p.id = $2', v_cols)
      using v_m, p_survivor;
  end if;

  -- Konto umziehen und die zweite Person löschen — nur ohne Hindernis. Mit
  -- Hindernis bliebe sonst über `on delete cascade` genau das auf der Strecke,
  -- was den Konflikt ausmacht.
  if cardinality(v_blocking) = 0 then
    if v_account is not null then
      update person set auth_user_id = null where id = p_merged;
      update person set auth_user_id = v_account where id = p_survivor;
    end if;
    delete from person where id = p_merged;
  end if;

  return jsonb_build_object(
    'report', jsonb_build_object(
      'survivor_id', p_survivor, 'merged_id', p_merged,
      'moved', v_moved_rep, 'deduplicated', v_dedup_rep, 'conflicts', v_conflicts,
      'filled', (select coalesce(jsonb_agg(k order by k), '[]') from jsonb_object_keys(v_fill) k),
      'emails', jsonb_array_length(v_emails),
      'account_moved', v_account is not null and cardinality(v_blocking) = 0,
      'blocking', to_jsonb(v_blocking)),
    'undo', jsonb_build_object(
      'survivor_id', p_survivor, 'merged_row', v_m, 'survivor_before', v_s,
      'moved', v_moved, 'deleted', v_deleted, 'roles_before', v_roles_before,
      'emails', v_emails, 'filled', v_fill, 'account', v_account));
end $$;
