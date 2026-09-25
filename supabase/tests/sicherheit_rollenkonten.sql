-- Rollenkonten-Probe (Security-Check Teil 2, Architektur-Session 25.09.2026). Echter Rollenwechsel
-- (`set local role authenticated`), Erwartungen fest, jede Abweichung wird mit Tabelle und Zahl genannt:
--   01 Externe ohne Rolle: in Tabellen mit person_id keine Zeile fremder Personen — Ausnahme
--      session_speaker für **veröffentlichte** Sessions (Programm) und die Mitsprecher der **eigenen** Sessions;
--   02 Externe ohne Rolle: Tabellen mit org_id/organization_id nur für Organisationen, deren Mitglied man ist;
--   03 Externe ohne Rolle: keine fremden Entwürfe, keine Slots ohne veröffentlichte Session (außer Rahmen);
--   04 Externe ohne Rolle: ticket_secret, audit_log, organization ohne Grant; expense_claim,
--      hospitality_booking, role_assignment leer;
--   05 Partner-Kontakt einer Organisation A: keine Zeile fremder Organisationen in Tabellen mit org_id;
--   06 Stage Lead mit Bühnen-Scope (nach 0210, Security-Check Teil 3): eigener Entwurf sichtbar, fremder Entwurf
--      0 Zeilen (Vorbedingung gesetzt), Suche findet nur die eigene Bühne, upsert_speaker auf ein fremdes Profil
--      (per Adresse und per person_id) → 42501.
-- Läuft gegen den Bestand (Testperson = älteste Person mit Konto, Rollen im Lauf entfernt), alles zurückgerollt.
-- Erster Lauf 25.09.2026: 5/5 ok (11 Tabellen mit person_id lesbar, 3 mit org_id). Nach 0189 zeigte 01 einen
-- Mitsprecher an der eigenen Entwurfs-Session der Testperson — kein Leck (is_speaker_of), seither ausgenommen.
begin;
create temp table t_res (step text, result text) on commit drop;
grant insert on t_res to authenticated;
do $$
declare v_pid uuid; v_uid uuid; r record; v_n bigint; v_txt text; v_tabs int; v_m bigint;
        v_orgA uuid; v_pidA uuid; v_uidA uuid;
        v_ed uuid; v_sum uuid; v_day uuid; v_sa uuid; v_sb uuid; v_sla uuid; v_slb uuid; v_sea uuid; v_seb uuid;
        v_psa uuid; v_psb uuid; v_a bigint; v_b bigint; v_ha bigint; v_hb bigint; r6a text; r6b text;
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
  -- 06 Stage Lead mit Bühnen-Scope (nach 0210): Bühne A eigen, Bühne B fremd — nur selbst angelegte Zeilen zählen.
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_sum from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  select d.id into v_day from event_day d where d.event_id = v_sum order by d.day_date limit 1;
  if v_sum is null or v_day is null then
    insert into t_res values ('06_stage_lead_eigene_buehne', 'übersprungen: kein Summit oder kein Veranstaltungstag');
  else
    insert into stage (event_id, name, slug, type, active) values (v_sum, 'ZZ Probe A', 'zz-probe-a', 'side', true) returning id into v_sa;
    insert into stage (event_id, name, slug, type, active) values (v_sum, 'ZZ Probe B', 'zz-probe-b', 'side', true) returning id into v_sb;
    insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (v_sa, v_day, now() + interval '2 days', now() + interval '2 days 30 minutes', 'content', 'open') returning id into v_sla;
    insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (v_sb, v_day, now() + interval '2 days', now() + interval '2 days 30 minutes', 'content', 'open') returning id into v_slb;
    insert into session (event_id, slot_id, format, title_de, title_en, description_de, language, access_mode, publish_status)
    values (v_sum, v_sla, 'talk', 'ZZ Probe Entwurf A', 'ZZ Probe draft A', 'Beschreibung.', 'de', 'open', 'draft') returning id into v_sea;
    insert into session (event_id, slot_id, format, title_de, title_en, description_de, language, access_mode, publish_status)
    values (v_sum, v_slb, 'talk', 'ZZ Probe Entwurf B', 'ZZ Probe draft B', 'Beschreibung.', 'de', 'open', 'draft') returning id into v_seb;
    insert into person (first_name, last_name) values ('Sina', 'ZZProbe A') returning id into v_psa;
    insert into person (first_name, last_name) values ('Bodo', 'ZZProbe B') returning id into v_psb;
    insert into person_email (person_id, email, is_primary) values (v_psb, 'zzprobe-b@example.org', true);
    insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at) values (v_psa, v_ed, 'panelist', 'confirmed', now());
    insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, job_title) values (v_psb, v_ed, 'panelist', 'confirmed', now(), 'Vorher');
    insert into session_speaker (session_id, person_id, role, confirmed) values (v_sea, v_psa, 'speaker', true), (v_seb, v_psb, 'speaker', true);
    delete from role_assignment where person_id = v_pid;
    insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_pid, 'speaker_manager', 'stage', v_sa, v_ed);
    -- Vorbedingung (als Superuser): der fremde Entwurf existiert.
    select count(*) into v_n from session se where se.id = v_seb and se.publish_status = 'draft';

    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_a from session se where se.id = v_sea;
    select count(*) into v_b from session se where se.id = v_seb;
    begin
      execute $q$select count(*) filter (where s.id = $1), count(*) filter (where s.id = $2) from board_search_people($3, 'ZZProbe', 25) s$q$
        into v_ha, v_hb using v_psa, v_psb, v_sum;
    exception when others then v_ha := -1; v_hb := -1;
    end;
    begin
      execute $q$select upsert_speaker(jsonb_build_object('edition_id', $1, 'email', 'zzprobe-b@example.org', 'first_name', 'Bodo', 'last_name', 'ZZProbe B', 'job_title', 'Überschrieben'))$q$ using v_ed;
      r6a := 'überschrieben';
    exception when others then r6a := sqlstate;
    end;
    begin
      execute $q$select upsert_speaker(jsonb_build_object('edition_id', $1, 'person_id', $2, 'job_title', 'Überschrieben'))$q$ using v_ed, v_psb;
      r6b := 'angenommen';
    exception when others then r6b := sqlstate;
    end;
    execute 'reset role';
    insert into t_res values ('06_stage_lead_eigene_buehne',
      case when v_n <> 1 then 'FEHLER Vorbedingung: fremder Entwurf fehlt'
           when v_a = 1 and v_b = 0 and v_ha = 1 and v_hb = 0 and r6a = '42501' and r6b = '42501' then 'ok'
           else 'LECK: eigener Entwurf=' || v_a || ' fremder Entwurf=' || v_b || ' Suche A=' || v_ha || ' B=' || v_hb
                || ' upsert per Adresse=' || r6a || ' per person_id=' || r6b end);
  end if;
end $$;
select * from t_res order by step;
rollback;
