-- Smoke-Test 0140 (`partner_format_sessions` nennt Fläche und Tag, Welle 6 B7). Belegt:
--   01 die Funktion liefert `stage_id` und `event_day_id`, und beide zeigen auf die Zeilen,
--      an denen der Slot wirklich haengt — nicht nur auf irgendetwas;
--   02 **zwei Tische mit demselben Namen** bleiben unterscheidbar: genau dafuer gibt es die
--      Spalte. Ueber `stage_name` waeren die Gespraeche des einen beim anderen gelandet;
--   03 die bestehenden Spalten stehen unveraendert an ihrer Stelle (rein additiv) — geprueft
--      an der Reihenfolge der Rueckgabe, nicht an einzelnen Werten;
--   04 eine fremde Organisation bekommt weiterhin 42501.
-- Probelauf Bau-Chat 21.09.2026 (`sh scripts/db.sh dry-run`): **5/5 gruen**.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_summit uuid; v_day uuid;
  v_org uuid; v_fremd uuid; v_oe uuid; v_t1 uuid; v_t2 uuid; v_s1 uuid; v_s2 uuid;
  v_start timestamptz; v_n integer; v_r record;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_summit from event e where e.edition_id = v_ed order by e.start_date limit 1;
  select ed.id into v_day from event_day ed where ed.event_id = v_summit order by ed.sort_order limit 1;
  select (ed.day_date + time '09:00') at time zone 'Europe/Berlin' into v_start
    from event_day ed where ed.id = v_day;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into organization (legal_name) values ('ZZ Tische GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremde Tische GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited')
    returning id into v_oe;
  -- **Zwei Tische mit demselben Namen** — der Fall, den der Namensvergleich verloren haette.
  insert into stage (event_id, name, type, partner_org_id, active)
    values (v_summit, 'ZZ Tisch', 'interview_table', v_org, true) returning id into v_t1;
  insert into stage (event_id, name, type, partner_org_id, active)
    values (v_summit, 'ZZ Tisch', 'interview_table', v_org, true) returning id into v_t2;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  delete from role_assignment where person_id = v_pid and role = 'admin';

  v_s1 := partner_create_session(v_org, 'interview_table', v_t1, v_day, v_start,
            v_start + interval '20 minutes', 'ZZ Gespraech A', 1, '{}'::jsonb, v_ed);
  v_s2 := partner_create_session(v_org, 'interview_table', v_t2, v_day, v_start,
            v_start + interval '20 minutes', 'ZZ Gespraech B', 1, '{}'::jsonb, v_ed);

  -- 01 Die neuen Spalten zeigen auf die richtigen Zeilen
  select * into v_r from partner_format_sessions(v_org, 'interview_table', v_ed) q where q.id = v_s1;
  insert into t_res values ('01_flaeche_und_tag',
    case when v_r.stage_id = v_t1 and v_r.event_day_id = v_day
         then 'stage_id und event_day_id richtig'
         else 'unerwartet ' || coalesce(v_r.stage_id::text,'null') || '/' || coalesce(v_r.event_day_id::text,'null') end);

  -- 02 Zwei gleich benannte Tische bleiben unterscheidbar
  select count(*)::integer into v_n from partner_format_sessions(v_org, 'interview_table', v_ed) q
   where q.stage_id = v_t1;
  insert into t_res values ('02_gleiche_namen_getrennt',
    case when v_n = 1 then 'je Tisch ein Gespraech (richtig)'
         else 'ALLOWED (BUG): ' || v_n || ' am ersten Tisch — der Name traegt nicht' end);
  select count(distinct q.stage_name)::integer into v_n from partner_format_sessions(v_org, 'interview_table', v_ed) q;
  insert into t_res values ('02b_name_waere_mehrdeutig',
    case when v_n = 1 then 'beide heissen gleich (die Vorbedingung des Tests stimmt)'
         else 'Vorbedingung fehlt — der Test belegt nichts' end);

  -- 03 Die bestehenden Spalten stehen unveraendert vorn
  select string_agg(a.attname, ',' order by a.attnum) into v_r.stage_name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(p.proallargtypes, p.proargnames, p.proargmodes)
         with ordinality as a(atttypid, attname, attmode, attnum)
   where n.nspname = 'public' and p.proname = 'partner_format_sessions' and a.attmode = 't';
  insert into t_res values ('03_additiv',
    case when v_r.stage_name like 'id,format,title_de,%is_host,stage_id,event_day_id'
         then 'bestehende Spalten unveraendert, zwei neue hinten (richtig)'
         else 'Reihenfolge geaendert: ' || left(coalesce(v_r.stage_name,'null'), 160) end);

  -- 04 Fremde Organisation
  begin
    perform partner_format_sessions(v_fremd, null, v_ed);
    insert into t_res values ('04_fremde_org', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('04_fremde_org', '42501 (richtig)');
    when others then insert into t_res values ('04_fremde_org', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;

select * from t_res order by step;
rollback;
