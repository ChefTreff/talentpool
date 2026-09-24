-- Smoke-Test (Rückgabegrund für den Partner, PART-083). Nummer offen. Belegt:
--   01 eine Rückgabe hält den Grund fest (getrimmt, mit Person und Zeit), und der Partner liest ihn
--      in `partner_format_sessions` (`return_note`, `returned_at`) — Vorbedingung: vorher stand
--      dort keiner;
--   02 eine zweite Rückgabe ersetzt die erste (eine Zeile, neuer Text);
--   03 eine Rückgabe ohne Grund wird weiter abgewiesen (22023 `fields_required`) und ändert den
--      gespeicherten Grund nicht;
--   04 die Freigabe löscht den Grund — Vorbedingung: die Session erfüllt die Freigabe-Bedingungen;
--   05 der Grund steht **nicht** an `session` (keine Spalte dort) und die neue Tabelle hat keine
--      Grants: weder `authenticated` noch `anon` dürfen sie lesen;
--   06 `partner_format_sessions` behält die bisherigen Spalten vorn, `return_note`, `returned_at`
--      hinten; nach drop + create darf `authenticated` sie ausführen, `anon` nicht;
--   07 fremde Organisation 42501.
-- Probelauf Bau-Chat 24.09.2026 (Nacht) auf main 8b0afc6 (`sh scripts/db.sh dry-run`, fn-diff ohne
-- unerklärte Zeile): **7/7 grün**, zurückgerollt; `v6_format_sessions_flaeche.sql` mit dieser Migration 5/5.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_summit uuid; v_day uuid;
  v_org uuid; v_fremd uuid; v_oe uuid; v_tisch uuid; v_s uuid;
  v_start timestamptz; v_n integer; v_txt text; v_r record;
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
  insert into organization (legal_name) values ('ZZ Rückgabe GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremde Rückgabe GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited')
    returning id into v_oe;
  insert into stage (event_id, name, type, partner_org_id, active)
    values (v_summit, 'ZZ Tisch Rückgabe', 'interview_table', v_org, true) returning id into v_tisch;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}', 'Geschäftsführung');
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- Der Partner legt die Session an.
  v_s := partner_create_session(v_org, 'interview_table', v_tisch, v_day, v_start,
           v_start + interval '20 minutes', 'ZZ Gespräch Rückgabe', 1, '{}'::jsonb, v_ed);

  -- 01 Rückgabe durch das Team
  select q.return_note into v_txt from partner_format_sessions(v_org, 'interview_table', v_ed) q where q.id = v_s;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  perform release_partner_session(v_s, false, '  Bitte den Titel kürzen  ');
  delete from role_assignment where person_id = v_pid and role = 'admin';
  select q.return_note, q.returned_at into v_r from partner_format_sessions(v_org, 'interview_table', v_ed) q where q.id = v_s;
  select count(*)::integer into v_n from partner_session_return
   where session_id = v_s and note = 'Bitte den Titel kürzen' and returned_by = v_pid and returned_at is not null;
  insert into t_res values ('01_rueckgabe_sichtbar',
    case when v_txt is not null then 'VORBEDINGUNG: es stand schon ein Grund da — Schritt belegt nichts'
         when v_r.return_note = 'Bitte den Titel kürzen' and v_r.returned_at is not null and v_n = 1
           then 'Grund getrimmt, mit Person und Zeit, beim Partner sichtbar (richtig)'
         else 'unerwartet: ' || coalesce(v_r.return_note, 'null') || ' / ' || v_n end);

  -- 02 Zweite Rückgabe ersetzt die erste
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  perform release_partner_session(v_s, false, 'Bitte die Beschreibung auf Englisch ergänzen');
  select count(*)::integer, max(note) into v_n, v_txt from partner_session_return where session_id = v_s;
  insert into t_res values ('02_zweite_ersetzt',
    case when v_n = 1 and v_txt = 'Bitte die Beschreibung auf Englisch ergänzen' then 'eine Zeile, neuer Grund (richtig)'
         else 'unerwartet: ' || v_n || ' Zeilen, ' || coalesce(v_txt, 'null') end);

  -- 03 Rückgabe ohne Grund bleibt abgewiesen und ändert nichts
  begin
    perform release_partner_session(v_s, false, '   ');
    insert into t_res values ('03_ohne_grund', 'ALLOWED (BUG): Rückgabe ohne Grund');
  exception
    when sqlstate '22023' then insert into t_res values ('03_ohne_grund',
      case when sqlerrm = 'fields_required'
                and (select note from partner_session_return where session_id = v_s) = 'Bitte die Beschreibung auf Englisch ergänzen'
           then 'fields_required, gespeicherter Grund unverändert (richtig)'
           else '22023 ' || sqlerrm end);
    when others then insert into t_res values ('03_ohne_grund', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 04 Freigabe löscht den Grund (Vorbedingung: Titel DE/EN und Beschreibung sind da, Slot hängt dran)
  update session set title_en = 'ZZ Talk return', description_de = 'ZZ Beschreibung' where id = v_s;
  select count(*)::integer into v_n from session
   where id = v_s and slot_id is not null and title_de is not null and title_en is not null and description_de is not null;
  perform release_partner_session(v_s, true, null);
  delete from role_assignment where person_id = v_pid and role = 'admin';
  select q.return_note into v_txt from partner_format_sessions(v_org, 'interview_table', v_ed) q where q.id = v_s;
  insert into t_res values ('04_freigabe_loescht',
    case when v_n <> 1 then 'VORBEDINGUNG: Session erfüllt die Freigabe nicht — Schritt belegt nichts'
         when v_txt is null and not exists (select 1 from partner_session_return where session_id = v_s)
           then 'Grund nach der Freigabe weg (richtig)'
         else 'unerwartet: ' || coalesce(v_txt, 'null') end);

  -- 07 Fremde Organisation
  begin
    perform partner_format_sessions(v_fremd, null, v_ed);
    insert into t_res values ('07_fremde_org', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('07_fremde_org', '42501 (richtig)');
    when others then insert into t_res values ('07_fremde_org', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;

-- 05 Nicht an session, keine Grants auf der Tabelle
insert into t_res
select '05_nicht_an_session',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'session' and column_name in ('return_note', 'returned_at'))
              then 'ALLOWED (BUG): Grund steht an session'
            when has_table_privilege('authenticated', 'partner_session_return', 'select')
              or has_table_privilege('anon', 'partner_session_return', 'select')
              then 'ALLOWED (BUG): Tabelle lesbar für authenticated/anon'
            when not (select relrowsecurity from pg_class where oid = 'partner_session_return'::regclass)
              then 'BUG: RLS aus'
            else 'eigene Tabelle, RLS an, keine Grants (richtig)' end;

-- 06 Spalten und Rechte nach drop + create
insert into t_res
select '06_spalten_und_rechte',
       case when r not like 'TABLE(id uuid, format text, title_de text,%is_host boolean, stage_id uuid, event_day_id uuid, return_note text, returned_at timestamp with time zone)'
              then 'unerwartet: ' || r
            when not has_function_privilege('authenticated', 'partner_format_sessions(uuid, text, uuid)', 'execute')
              then 'BUG: authenticated darf die Formatseiten nicht mehr lesen'
            when has_function_privilege('anon', 'partner_format_sessions(uuid, text, uuid)', 'execute')
              then 'ALLOWED (BUG): anon darf sie ausführen'
            else 'alte Spalten vorn, zwei neue hinten; authenticated ja, anon nein (richtig)' end
  from (select pg_get_function_result('partner_format_sessions(uuid, text, uuid)'::regprocedure) as r) x;

select * from t_res order by step;
rollback;
