-- Rollenkonten-Probe (Security-Check Teil 2, Architektur-Session 25.09.2026). Echter Rollenwechsel
-- (`set local role authenticated`), Erwartungen fest, jede Abweichung wird mit Tabelle und Zahl genannt:
--   01 Externe ohne Rolle: in Tabellen mit person_id keine Zeile fremder Personen — Ausnahme
--      session_speaker für **veröffentlichte** Sessions (Programm) und die Mitsprecher der **eigenen** Sessions;
--   02 Externe ohne Rolle: Tabellen mit org_id/organization_id nur für Organisationen, deren Mitglied man ist;
--   03 Externe ohne Rolle: keine fremden Entwürfe, keine Slots ohne veröffentlichte Session (außer Rahmen);
--   04 Externe ohne Rolle: ticket_secret, audit_log, organization ohne Grant; expense_claim,
--      hospitality_booking, role_assignment leer;
--   05 Partner-Kontakt einer Organisation A: keine Zeile fremder Organisationen in Tabellen mit org_id.
-- Läuft gegen den Bestand (Testperson = älteste Person mit Konto, Rollen im Lauf entfernt), alles zurückgerollt.
-- Erster Lauf 25.09.2026: 5/5 ok (11 Tabellen mit person_id lesbar, 3 mit org_id). Nach 0189 zeigte 01 einen
-- Mitsprecher an der eigenen Entwurfs-Session der Testperson — kein Leck (is_speaker_of), seither ausgenommen.
begin;
create temp table t_res (step text, result text) on commit drop;
grant insert on t_res to authenticated;
do $$
declare v_pid uuid; v_uid uuid; r record; v_n bigint; v_txt text; v_tabs int; v_m bigint;
        v_orgA uuid; v_pidA uuid; v_uidA uuid;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 01
  v_txt := ''; v_tabs := 0;
  for r in select distinct c.table_name from information_schema.columns c
             join pg_class k on k.relname = c.table_name join pg_namespace n on n.oid = k.relnamespace and n.nspname = 'public'
            where c.table_schema = 'public' and k.relkind = 'r' and c.column_name = 'person_id' order by 1 loop
    begin
      if r.table_name = 'session_speaker' then
        execute 'select count(*) from public.session_speaker ss where ss.person_id is distinct from $1 and not exists (select 1 from public.session se where se.id = ss.session_id and se.publish_status = ''published'') and not exists (select 1 from public.session_speaker s2 where s2.session_id = ss.session_id and s2.person_id = $1)' into v_n using v_pid;
      else
        execute format('select count(*) from public.%I where person_id is distinct from $1', r.table_name) into v_n using v_pid;
      end if;
      v_tabs := v_tabs + 1;
      if v_n > 0 then v_txt := v_txt || r.table_name || '=' || v_n || ' '; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  insert into t_res values ('01_ohne_rolle_fremde_person_id', case when v_txt = '' then 'ok (' || v_tabs || ' Tabellen)' else 'LECK: ' || v_txt end);

  -- 02
  v_txt := ''; v_tabs := 0;
  for r in select distinct c.table_name, c.column_name from information_schema.columns c
             join pg_class k on k.relname = c.table_name join pg_namespace n on n.oid = k.relnamespace and n.nspname = 'public'
            where c.table_schema = 'public' and k.relkind = 'r' and c.column_name in ('org_id', 'organization_id') order by 1 loop
    begin
      execute format('select count(*) from public.%I where %I is not null and not is_member_of_org(%I)', r.table_name, r.column_name, r.column_name) into v_n;
      v_tabs := v_tabs + 1;
      if v_n > 0 then v_txt := v_txt || r.table_name || '=' || v_n || ' '; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  insert into t_res values ('02_ohne_rolle_fremde_orgs', case when v_txt = '' then 'ok (' || v_tabs || ' Tabellen)' else 'LECK: ' || v_txt end);

  -- 03
  select count(*) into v_n from session s where s.publish_status <> 'published'
     and not exists (select 1 from session_speaker ss where ss.session_id = s.id and ss.person_id = v_pid);
  select count(*) into v_m from slot sl where sl.slot_type <> 'frame' and not exists (select 1 from session se where se.slot_id = sl.id and se.publish_status = 'published');
  insert into t_res values ('03_ohne_rolle_programm', case when v_n = 0 and v_m = 0 then 'ok' else 'LECK: fremde Entwürfe=' || v_n || ' Slots=' || v_m end);

  -- 04
  v_txt := '';
  for r in select unnest(array['ticket_secret','audit_log','organization']) as t loop
    begin
      execute format('select count(*) from public.%I', r.t) into v_n; v_txt := v_txt || r.t || '=lesbar(' || v_n || ') ';
    exception when insufficient_privilege then null;
    end;
  end loop;
  for r in select unnest(array['expense_claim','hospitality_booking','role_assignment']) as t loop
    begin
      execute format('select count(*) from public.%I', r.t) into v_n; if v_n > 0 then v_txt := v_txt || r.t || '=' || v_n || ' '; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  insert into t_res values ('04_ohne_rolle_sensible_tabellen', case when v_txt = '' then 'ok' else 'LECK: ' || v_txt end);
  execute 'reset role';

  -- 05
  select ra.person_id, ra.scope_id into v_pidA, v_orgA from role_assignment ra join person p on p.id = ra.person_id
   where ra.scope_type = 'org' and ra.role like 'partner%' and p.auth_user_id is not null and p.deleted_at is null limit 1;
  if v_pidA is null then
    insert into t_res values ('05_partner_fremde_orgs', 'übersprungen: kein Partner-Kontakt mit Konto');
  else
    select p.auth_user_id into v_uidA from person p where p.id = v_pidA;
    perform set_config('request.jwt.claims', json_build_object('sub', v_uidA, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_txt := ''; v_tabs := 0;
    for r in select distinct c.table_name, c.column_name from information_schema.columns c
               join pg_class k on k.relname = c.table_name join pg_namespace n on n.oid = k.relnamespace and n.nspname = 'public'
              where c.table_schema = 'public' and k.relkind = 'r' and c.column_name in ('org_id', 'organization_id') order by 1 loop
      begin
        execute format('select count(*) from public.%I where %I is not null and %I <> $1', r.table_name, r.column_name, r.column_name) into v_n using v_orgA;
        v_tabs := v_tabs + 1;
        if v_n > 0 then v_txt := v_txt || r.table_name || '=' || v_n || ' '; end if;
      exception when insufficient_privilege then null;
      end;
    end loop;
    execute 'reset role';
    insert into t_res values ('05_partner_fremde_orgs', case when v_txt = '' then 'ok (' || v_tabs || ' Tabellen)' else 'LECK: ' || v_txt end);
  end if;
end $$;
select * from t_res order by step;
rollback;
