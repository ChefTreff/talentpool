-- Dubletten zusammenführen: Vorschau, Protokoll, Rückweg; Dublettensuche; Liste mit Namen (ADM-036)
--
-- Zweck: `/admin/dubletten` zeigte Paare als ID-Fragmente und konnte nur
-- markieren; `person_merge_log` gab es seit 0005 ohne eine Funktion, die sie
-- schreibt. Konrad (25.09.): zusammenführen **vor** der Altdaten-Migration —
-- der Import erzeugt die Paare, die hier aufgelöst werden.
--
-- Grundsatz: **Was auf die Person zeigt, wird nicht aufgezählt, sondern
-- gelesen.** Die Funktion holt die Fremdschlüssel auf `person(id)` zur Laufzeit
-- aus `pg_constraint` (heute 97 Spalten in 76 Tabellen). Eine Tabelle, die
-- später dazukommt, ist ohne Änderung hier dabei — sonst würde ihr
-- `on delete cascade` beim Löschen der zweiten Person still Daten mitnehmen.
--
-- Ablauf `person_merge_core(bleibt, geht)` (intern):
--   1. beide Personen sperren; gelöschte (anonymisierte) Personen nie;
--   2. E-Mail-Adressen der zweiten Person wandern als weitere Adressen mit
--      (die primäre bleibt die der ersten);
--   3. jede Zeile, die auf die zweite Person zeigt, zeigt danach auf die erste.
--      Verletzt das eine Eindeutigkeit, wird zeilenweise entschieden:
--        * Mengen ohne eigene Aussage (Interessen, Sprachen, Kanäle,
--          Rollen, Portal-Auswahl): die doppelte Zeile der zweiten Person fällt,
--          gesichert im Protokoll;
--        * Mitgliedschaft in derselben Organisation: Rollen werden vereinigt,
--          die doppelte Zeile fällt;
--        * alles andere (zwei Bewerbungen auf dieselbe Session, zwei
--          Speaker-Profile derselben Edition, …) ist ein **Konflikt** und hält
--          das Zusammenführen an — erst muss jemand entscheiden, was gilt;
--   4. leere Felder der ersten Person werden aus der zweiten gefüllt (nie
--      überschrieben); Konto, Sperre, Löschung, Stufe bleiben, wie sie sind;
--   5. hat nur die zweite Person ein Konto, zieht es um; haben beide eines,
--      geht es nicht (zwei Logins lassen sich nicht vereinen); ist das Konto
--      der zweiten gesperrt, auch nicht (der Umzug höbe die Sperre auf);
--   6. die zweite Person wird gelöscht — es zeigt nichts mehr auf sie.
--
-- `person_merge_preview` fährt genau diesen Ablauf und nimmt ihn zurück (die
-- Vorschau ist also kein Schätzwert, sondern das Ergebnis). `merge_persons`
-- fährt ihn und schreibt `person_merge_log` mit allem, was der Rückweg
-- braucht: Zeile der zweiten Person, Schlüssel jeder umgehängten Zeile, jede
-- gefallene Zeile, gefüllte Felder, Konto. `unmerge_persons` stellt die zweite
-- Person mit derselben ID wieder her und hängt genau die protokollierten
-- Zeilen zurück; was die erste Person seither neu bekommen hat, bleibt bei ihr.
--
-- Datenschutz: Das Protokoll trägt die Daten der zweiten Person, solange ein
-- Rückweg möglich sein soll. Wird die bleibende Person gelöscht
-- (`anonymize_person`), fällt der Inhalt mit — Schritt 10 dort.
--
-- Rechte: alles am Abschnitt `duplicates` (nur admin, Verwaltung).
-- Basis: snapshot/functions/anonymize_person.sql (Schritt 10 neu, sonst gleich).
set search_path = public, extensions;

alter table person_merge_log
  add column undone_at timestamptz,
  add column undone_by uuid references person (id) on delete set null;
comment on column person_merge_log.payload is
  'ADM-036: {report, undo}. undo = Zeile der zweiten Person, umgehängte Schlüssel je Tabelle, gefallene Zeilen, gefüllte Felder, Konto. Fällt mit anonymize_person der bleibenden Person (dann kein Rückweg).';
comment on column person_merge_log.undone_at is 'ADM-036: Zusammenführung zurückgenommen (unmerge_persons).';

-- ---------------------------------------------------------------------------
-- Intern: der Ablauf. Liefert {report, undo}; löscht die zweite Person nur,
-- wenn es keinen Konflikt gibt.
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
revoke execute on function person_merge_core(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Vorschau: der echte Ablauf, danach zurückgenommen.
create or replace function person_merge_preview(p_survivor uuid, p_merged uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_res jsonb; v_people jsonb;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('duplicates') then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Die beiden Personen, wie sie vorher dastehen — für die Gegenüberstellung.
  select jsonb_object_agg(case when p.id = p_survivor then 'survivor' else 'merged' end, jsonb_build_object(
           'name', nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           'email', (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           'emails', (select count(*) from person_email pe where pe.person_id = p.id),
           'has_account', p.auth_user_id is not null,
           'blocked', p.access_blocked_at is not null,
           'created_at', p.created_at))
    into v_people from person p where p.id in (p_survivor, p_merged);
  begin
    v_res := person_merge_core(p_survivor, p_merged);
    -- Alles zurücknehmen; v_res überlebt das (Variablen sind nicht Teil der Transaktion).
    raise exception 'preview_rollback' using errcode = 'P0098';
  exception when sqlstate 'P0098' then null;
  end;
  return (v_res->'report') || coalesce(v_people, '{}');
end $$;

-- ---------------------------------------------------------------------------
-- Zusammenführen: Ablauf, Protokoll, Audit. Gibt die Protokoll-ID zurück.
create or replace function merge_persons(p_survivor uuid, p_merged uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_res jsonb; v_log uuid; v_name text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('duplicates') then raise exception 'not allowed' using errcode = '42501'; end if;

  v_res := person_merge_core(p_survivor, p_merged);
  if jsonb_array_length(v_res->'report'->'blocking') > 0 then
    -- Ausnahme nimmt auch die schon umgehängten Zeilen zurück.
    raise exception 'merge_conflict' using errcode = 'P0001', detail = (v_res->'report'->'blocking')::text;
  end if;

  insert into person_merge_log (surviving_person_id, merged_person_id, actor, payload)
  values (p_survivor, p_merged, auth.uid()::text, v_res)
  returning id into v_log;

  v_name := nullif(btrim(coalesce(v_res->'undo'->'merged_row'->>'first_name', '') || ' '
                         || coalesce(v_res->'undo'->'merged_row'->>'last_name', '')), '');
  perform log_audit('person.merge', 'person', p_survivor::text,
    jsonb_build_object('merged_person_id', p_merged, 'merged_name', v_name),
    jsonb_build_object('merge_log_id', v_log, 'moved', v_res->'report'->'moved',
                       'deduplicated', v_res->'report'->'deduplicated', 'filled', v_res->'report'->'filled',
                       'account_moved', v_res->'report'->'account_moved'));
  return v_log;
end $$;

-- ---------------------------------------------------------------------------
-- Rückweg: die zweite Person mit derselben ID zurück, protokollierte Zeilen
-- zurückhängen, Gefallenes zurücklegen, gefüllte Felder leeren.
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

-- ---------------------------------------------------------------------------
-- Liste der Zusammenführungen (Protokoll mit Rückweg).
create or replace function person_merges_admin(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, merged_at timestamp with time zone, survivor_id uuid, survivor_name text,
               merged_person_id uuid, merged_name text, merged_email text, actor_name text,
               moved_rows integer, undone_at timestamp with time zone, can_undo boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('duplicates') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select l.id, l.merged_at, l.surviving_person_id,
           nullif(btrim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')), ''),
           l.merged_person_id,
           nullif(btrim(coalesce(l.payload->'undo'->'merged_row'->>'first_name', '') || ' '
                        || coalesce(l.payload->'undo'->'merged_row'->>'last_name', '')), ''),
           (select pe.email::text from person_email pe
             where pe.id in (select (e->>'id')::uuid from jsonb_array_elements(l.payload->'undo'->'emails') e
                              where (e->>'primary')::boolean)),
           (select nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '')
              from person a where a.auth_user_id::text = l.actor),
           (select coalesce(sum((m->>'rows')::integer), 0)::integer from jsonb_array_elements(l.payload->'report'->'moved') m),
           l.undone_at,
           l.undone_at is null and l.payload->'undo' is not null
             and l.surviving_person_id = (l.payload->'undo'->>'survivor_id')::uuid
      from person_merge_log l
      left join person s on s.id = l.surviving_person_id
     order by l.merged_at desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

-- ---------------------------------------------------------------------------
-- Kandidaten mit Namen und Adresse statt ID-Fragmenten.
create or replace function duplicate_candidates_admin(p_status text DEFAULT 'open'::text)
 RETURNS TABLE(id uuid, score numeric, signals jsonb, status text,
               person_a uuid, name_a text, email_a text, has_account_a boolean, created_a timestamp with time zone,
               person_b uuid, name_b text, email_b text, has_account_b boolean, created_b timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('duplicates') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('open', 'confirmed_dupe', 'not_dupe') then
    raise exception 'invalid_state' using errcode = '22023', detail = p_status;
  end if;
  return query
    select d.id, d.score, d.signals, d.status,
           a.id, nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), ''),
           (select pe.email::text from person_email pe where pe.person_id = a.id and pe.is_primary),
           a.auth_user_id is not null, a.created_at,
           b.id, nullif(btrim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')), ''),
           (select pe.email::text from person_email pe where pe.person_id = b.id and pe.is_primary),
           b.auth_user_id is not null, b.created_at
      from potential_duplicate d
      join person a on a.id = d.person_id_a
      join person b on b.id = d.person_id_b
     where (p_status is null or d.status = p_status)
     order by d.score desc, d.created_at
     limit 500;
end $$;

-- ---------------------------------------------------------------------------
-- Dublettensuche: gleiche LinkedIn-Adresse, gleiche Telefonnummer, gleicher
-- Name mit gleichem Geburtsdatum, gleicher Name. E-Mail kann kein Signal sein —
-- eine Adresse gehört genau einer Person (`person_email_email_key`).
-- Vorhandene Paare behalten ihren Status; offene bekommen die neuen Signale.
create or replace function duplicate_scan()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('duplicates') then raise exception 'not allowed' using errcode = '42501'; end if;

  with p as (
    select id, linkedin_normalized, phone_e164, birthdate,
           nullif(immutable_unaccent(lower(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')))), '') as nm
      from person where deleted_at is null
  ), pairs as (
    select a.id as a, b.id as b, 'linkedin' as sig, 0.9 as w from p a join p b on a.id < b.id and a.linkedin_normalized = b.linkedin_normalized
    union all
    select a.id, b.id, 'phone', 0.8 from p a join p b on a.id < b.id and a.phone_e164 = b.phone_e164
    union all
    select a.id, b.id, 'name_birthdate', 0.9 from p a join p b on a.id < b.id and a.nm = b.nm and a.birthdate = b.birthdate
    union all
    select a.id, b.id, 'name', 0.5 from p a join p b on a.id < b.id and a.nm = b.nm and position(' ' in a.nm) > 0
  ), agg as (
    select a, b, jsonb_object_agg(sig, true) as signals,
           least(1.0, max(w) + 0.05 * (count(*) - 1))::numeric(3, 2) as score
      from pairs group by a, b
  ), ins as (
    insert into potential_duplicate (person_id_a, person_id_b, score, signals)
    select a, b, score, signals from agg
    on conflict (person_id_a, person_id_b) do update
      set signals = excluded.signals, score = excluded.score
      where potential_duplicate.status = 'open'
    returning (xmax = 0) as neu
  )
  select count(*) filter (where neu) into v_n from ins;

  perform log_audit('duplicate.scan', 'potential_duplicate', 'scan', null, jsonb_build_object('new', v_n));
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- anonymize_person: Schritt 10 neu — Protokolle, in denen die Person die
-- bleibende war, tragen die Daten der zweiten Person; sie fallen mit.
create or replace function anonymize_person(p_person_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_hash text; v_profile uuid[];
begin
  if p_person_id is null then raise exception 'person_not_found' using errcode = 'P0002'; end if;
  perform log_audit('profile.delete', 'person', p_person_id::text, null, null);

  select array_agg(sp.id) into v_profile from speaker_profile sp where sp.person_id = p_person_id;
  v_profile := coalesce(v_profile, '{}');

  -- 1 · Sperrliste. Der Hash bleibt, die Adresse geht.
  insert into suppression (email_hash, reason)
    select email_hash(email::text), 'profile_deleted' from person_email where person_id = p_person_id
  on conflict (email_hash) do nothing;
  select email_hash(pe.email::text) into v_hash
    from person_email pe where pe.person_id = p_person_id and pe.is_primary;

  -- 2 · Dateien zum Wegräumen anmelden, **bevor** die Zeilen fallen: danach
  --     wüsste niemand mehr, welche Pfade gemeint waren.
  insert into storage_purge_queue (bucket, path)
    select 'speaker-assets', sa.storage_path from speaker_asset sa where sa.profile_id = any (v_profile)
  on conflict (bucket, path) do nothing;
  -- Porträt aus dem Teilnehmer-Profil (TAL-012).
  insert into storage_purge_queue (bucket, path)
    select 'person-photos', p.photo_path from person p
     where p.id = p_person_id and p.photo_path is not null
  on conflict (bucket, path) do nothing;
  -- Lebenslauf aus dem Teilnehmer-Profil (TAL-013, B3).
  insert into storage_purge_queue (bucket, path)
    select 'person-cv', p.cv_path from person p
     where p.id = p_person_id and p.cv_path is not null
  on conflict (bucket, path) do nothing;

  -- 3 · Zeilen, die ohne die Person keinen Sinn mehr haben.
  delete from person_interest            where person_id = p_person_id;
  delete from person_acquisition_channel where person_id = p_person_id;
  delete from person_language            where person_id = p_person_id;
  delete from role_assignment            where person_id = p_person_id;
  -- Ansprechperson einer Organisation kann nur sein, wen es gibt.
  delete from org_membership             where person_id = p_person_id;
  delete from speaker_asset  where profile_id = any (v_profile);
  -- Anreise ist reine Logistik eines vergangenen Termins: Flugnummer, Ankunft,
  -- Notiz. Nichts davon trägt eine Zahl, die später jemand braucht.
  delete from speaker_travel where profile_id = any (v_profile);

  -- 4 · Die Person selbst. Grobe Merkmale bleiben für die Statistik
  --     (career_level, study_field, country, tier, occupation_status) — sie
  --     beschreiben eine Gruppe, keinen Menschen. Freitext, Kontaktdaten und
  --     alles nach Art. 9 DSGVO (Ernährung, Geschlecht) fällt weg.
  update person set
    first_name = null, last_name = null, birthdate = null, phone = null, phone_e164 = null,
    linkedin_url = null, linkedin_normalized = null,
    employer_name = null, university = null, title = null, city = null,
    nationality = null, invite_code = null, auth_user_id = null,
    gender = null, diet = null, diet_note = null, photo_path = null,
    job_title = null, study_program_label = null, cv_path = null,
    salutation_de = null, salutation_en = null, self_assessment = null,
    deleted_at = now()
  where id = p_person_id;

  delete from person_email where person_id = p_person_id and not is_primary;
  update person_email
     set email = ('deleted+' || p_person_id::text || '@anonym.invalid')::citext, verified = false
   where person_id = p_person_id and is_primary;

  -- 5 · Mail-Protokoll: die Zeile bleibt als Zahl (wie viele Einladungen gingen
  --     raus), die Adresse wird zum Hash und die eingesetzten Angaben — dort
  --     steht der Name im Klartext — verschwinden.
  update mail_log
     set to_email = ('deleted:' || coalesce(v_hash, p_person_id::text))::citext,
         meta = coalesce(meta, '{}'::jsonb) - 'vars'
   where person_id = p_person_id;

  -- 6 · Freitexte und Fremdschlüssel in allen übrigen Tabellen mit `person_id`.
  --     Was bleibt, ist jeweils der zählbare Teil: Status, Typ, Zeitpunkt.
  update application      set answers = '{}'::jsonb where person_id = p_person_id;
  update hack_application set motivation = null, team_pref = null, note = null,
                              github_url = null, website_url = null, behance_url = null
   where person_id = p_person_id;
  -- Der Einwilligungsnachweis bleibt — er ist der Beleg, dass wir durften, was
  -- wir getan haben. Das Gerät, von dem sie kam, ist dafür ohne Bedeutung.
  update consent_record   set user_agent = null where person_id = p_person_id;
  -- Fremdsystem-Verweise zeigen auf Kopien, die dort noch den Namen tragen;
  -- der Verweis selbst darf nicht bleiben (siehe Kopf, vivenu).
  update registration     set external_ref = null, external_ids = '{}'::jsonb where person_id = p_person_id;
  update shift_assignment set decline_reason = null where person_id = p_person_id;
  update volunteer_profile set availability = null, buddy_note = null, notes_internal = null,
                               decision_note = null, coupon_error = null, buddy_person_id = null
   where person_id = p_person_id;
  update ticket set holder_email = null, holder_first_name = null, holder_last_name = null,
                    holder_company = null, holder_position = null, buyer_email = null,
                    team_note = null, extra_fields = '{}'::jsonb
   where person_id = p_person_id;

  -- 7 · Speaker-Profil und was daran hängt.
  update speaker_profile set
    bio_short_de = null, bio_short_en = null, bio_long_de = null, bio_long_en = null,
    job_title = null, organization_name = null, internal_notes = null,
    -- `tech_rider` und `socials` sind `not null default '{}'` — hier gehoert der
    -- leere Wert hin, nicht `null` (Probelauf der Architektur-Session, 23502).
    tech_rider = '{}'::jsonb, socials = '{}'::jsonb,
    decline_reason = null, photo_asset_id = null,
    -- Der Kontakt ohne Portalzugang (0127) gehoert einer **dritten** Person:
    -- Agentur, Office, Management. Sie hat hier nie ein Konto gehabt und kann
    -- die Loeschung auch nicht selbst verlangen — deshalb faellt sie mit dem
    -- Profil, das sie eingetragen hat. Keine Sperrliste: die Adresse stand nie
    -- in einem Verteiler, das Portal kann an sie gar nicht senden (`queue_mail`
    -- braucht eine `person_id`, und eine hat sie nicht).
    contact_first_name = null, contact_last_name = null, contact_email = null,
    contact_phone = null, contact_kind = null, contact_consent_at = null,
    -- LEAD-039: die Einordnung ist eine Einschätzung über die Person, und
    -- `contact_via` nennt, über wen sie läuft.
    category = null, topic_cluster = null, topic_role = null, priority = null,
    recommended_format = null, contact_via = null, outreach_channel = null
   where person_id = p_person_id;
  delete from speaker_stage_candidate where profile_id = any (v_profile);
  -- LEAD-039 Schnitt 2: der Verlauf über die Person geht mit. Einträge, die sie
  -- selbst über andere geschrieben hat, bleiben; sie zeigen dann den
  -- anonymisierten Namen.
  delete from speaker_activity where profile_id = any (v_profile);
  -- Titel und Beschreibung sind der veröffentlichte Programmpunkt und gehören
  -- zur Veranstaltung, nicht zur Person; die interne Notiz nicht.
  update session_submission  set notes = null      where speaker_profile_id = any (v_profile);
  update hospitality_booking set details = '{}'::jsonb, team_note = null where profile_id = any (v_profile);

  -- 8 · Reisekosten. Der Antrag bleibt als Buchung (§147 AO), die Bankdaten
  --     nicht: bezahlt ist bezahlt, und ein offener Antrag ist eine Hürde, die
  --     bis hierher gar nicht kommt.
  delete from vault.secrets
   where id in (select ec.bank_secret_id from expense_claim ec
                 where ec.profile_id = any (v_profile) and ec.bank_secret_id is not null);
  update expense_claim set bank_secret_id = null, bank_masked = null, bank_holder = null,
                           review_note = null
   where profile_id = any (v_profile);

  -- 9 · Der selbst geschriebene Grund ist Freitext von dieser Person und darf
  --     ihre Löschung nicht überleben. Status, Hürden und Zeitpunkt bleiben —
  --     das ist der Nachweis, und der trägt keinen Personenbezug.
  update profile_deletion_request set reason = null where person_id = p_person_id;

  -- 10 · ADM-036: Zusammenführungen, in denen diese Person die bleibende war,
  --      tragen im Protokoll die Daten der zweiten Person (für den Rückweg).
  --      Mit der Löschung gibt es keinen Rückweg mehr; die Zeile bleibt als
  --      Nachweis, dass zusammengeführt wurde.
  update person_merge_log set payload = null where surviving_person_id = p_person_id;
end $$;

select harden_definer_functions();
