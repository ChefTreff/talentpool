-- Smoke-Test v6_bewerbung_email (Vorschlag, PART-147): die E-Mail-Adresse einer Bewerbung steht im `profile` der Partner-Ansichten — nur mit Weitergabe
-- (`application.consent_share`) und nur die primäre Adresse. Wegwerf-Organisationen, -Tour, -Sessions und -Bewerbende, echte Partnerrolle des angemeldeten Kontos,
-- danach die Teamrolle; alles wird zurückgerollt. Jede Abweisung und jedes Fehlen hat sein Gegenstück (sichtbar neben unsichtbar); „0 Treffer“ allein beweist nichts.
-- Erwartung je Schritt als Muster in `t_erw`, `99_auswertung` am Ende.
--   01 Company Tour (`partner_tour_applications`): mit Einwilligung die primäre Adresse (eine zweite, nicht primäre Adresse derselben Person bleibt weg); ohne Einwilligung
--      keine Zeile mit Personenbezug und nirgends ein „@“; Bewerbende einer fremden Session erscheinen nicht.
--   02 Masterclass / Side Event / Interview Table (`partner_applications` → `applications_for_session`): dasselbe für den Partner der Gastgeber-Organisation.
--   03 Widerruf: ohne Einwilligung ist die Adresse sofort weg, mit erneuter Einwilligung wieder da.
--   04 Team (`applications_for_session`): sieht Profilfelder auch ohne Einwilligung, die Adresse aber nur mit ihr.
--   05 Fremde Organisation: beide Funktionen und `applications_for_session` unmittelbar 42501 (Gegenstück zu 01 und 02; die Funktion ist auch direkt aufrufbar).
--   06 Audit: jeder Abruf steht drin (`application.partner_view`), keiner mit Adresse.
--   07 Form: SECURITY DEFINER, fester search_path, `authenticated` ja, `anon` nein; die Zeilenform ist unverändert (`profile jsonb`).
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('01a_tour_mit', '^ok email=true privat=false nur_primaer=true$'),
  ('01b_tour_ohne', '^ok profil_leer=true kein_at=true$'),
  ('01c_tour_fremde_session', '^ok zeilen=2 fremde_adresse=false$'),
  ('02a_session_mit', '^ok email=true privat=false$'),
  ('02b_session_ohne', '^ok profil_leer=true kein_at=true$'),
  ('03a_widerruf', '^ok email_weg=true kein_at=true$'),
  ('03b_erneut', '^ok email=true$'),
  ('04a_team_mit', '^ok email=true$'),
  ('04b_team_ohne', '^ok profil=true email=false kein_at=true$'),
  ('05a_fremder_stopp', '^rejected 42501$'),
  ('05b_fremde_session', '^rejected 42501$'),
  ('05c_session_direkt', '^rejected 42501$'),
  ('06_audit', '^ok abrufe=[1-9][0-9]* ohne_adresse=true$'),
  ('07a_form_session', '^ok$'),
  ('07b_form_tour', '^ok$'),
  ('07c_zeilenform', '^ok$');

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_ev uuid;
  v_a uuid; v_b uuid; v_se_tour uuid; v_se_mc uuid; v_se_fremd uuid; v_tour uuid; v_stopp uuid; v_stopp_fremd uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_app_mc1 uuid; v_r record; v_n integer; v_txt text; v_b1 boolean; v_b2 boolean; v_b3 boolean;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_ev from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  if v_ev is null then raise exception 'VORBEDINGUNG: Summit fehlt'; end if;

  insert into organization (legal_name) values ('ZZ Mail GmbH') returning id into v_a;
  insert into organization (legal_name) values ('ZZ Mail Fremd GmbH') returning id into v_b;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_a, v_ed, 'invited'), (v_b, v_ed, 'invited');
  insert into org_membership (person_id, org_id, roles) values (v_pid, v_a, '{additional}');
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', v_a);

  -- Company Tour mit zwei Stopps (eigener und fremder), Masterclass der eigenen Organisation, Masterclass der fremden.
  insert into session (event_id, format, title_de, access_mode, publish_status, tags)
    values (v_ev, 'company_tour', 'ZZ Mail Tour', 'application', 'draft', '{}') returning id into v_se_tour;
  insert into session (event_id, format, title_de, access_mode, publish_status, tags, host_org_id)
    values (v_ev, 'masterclass', 'ZZ Mail Masterclass', 'application', 'draft', '{}', v_a) returning id into v_se_mc;
  insert into session (event_id, format, title_de, access_mode, publish_status, tags, host_org_id)
    values (v_ev, 'masterclass', 'ZZ Mail Fremde Masterclass', 'application', 'draft', '{}', v_b) returning id into v_se_fremd;
  insert into company_tour (edition_id, name, session_id) values (v_ed, 'ZZ Mail Tour', v_se_tour) returning id into v_tour;
  insert into company_tour_stop (tour_id, sort_order, host_org_id, target_profile) values (v_tour, 1, v_a, '{}') returning id into v_stopp;
  insert into company_tour_stop (tour_id, sort_order, host_org_id, target_profile) values (v_tour, 2, v_b, '{}') returning id into v_stopp_fremd;

  -- Drei Personen; die erste hat neben der primären eine zweite, nicht primäre Adresse.
  insert into person (first_name, last_name, city) values ('ZZ', 'Eins', 'Hamburg') returning id into v_p1;
  insert into person (first_name, last_name, city) values ('ZZ', 'Zwei', 'Berlin') returning id into v_p2;
  insert into person (first_name, last_name) values ('ZZ', 'Drei') returning id into v_p3;
  insert into person_email (person_id, email, is_primary) values
    (v_p1, 'zz-mail-eins@example.org', true), (v_p1, 'zz-mail-eins-privat@example.org', false),
    (v_p2, 'zz-mail-zwei@example.org', true), (v_p3, 'zz-mail-drei@example.org', true);

  -- Bewerbungen: Tour (eins mit, zwei ohne Einwilligung), Masterclass der eigenen Organisation (dieselben), Masterclass der fremden (drei, mit).
  insert into application (session_id, person_id, answers, consent_share) values
    (v_se_tour, v_p1, '{}'::jsonb, true), (v_se_tour, v_p2, '{}'::jsonb, false);
  insert into application (session_id, person_id, answers, consent_share) values (v_se_mc, v_p1, '{}'::jsonb, true) returning id into v_app_mc1;
  insert into application (session_id, person_id, answers, consent_share) values (v_se_mc, v_p2, '{}'::jsonb, false);
  insert into application (session_id, person_id, answers, consent_share) values (v_se_fremd, v_p3, '{}'::jsonb, true);

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  if not partner_can_edit(v_a) then raise exception 'VORBEDINGUNG: Konto darf die Organisation nicht bearbeiten'; end if;

  -- 01 Company Tour
  select * into v_r from partner_tour_applications(v_stopp) x where x.consent_share;
  v_b1 := coalesce(v_r.profile->>'email' = 'zz-mail-eins@example.org', false);
  v_b2 := coalesce(position('privat' in v_r.profile::text) = 0, false);
  v_b3 := coalesce((select count(*) from jsonb_each_text(v_r.profile) kv where kv.value like '%@%') = 1, false);  -- genau eine Adresse im Profil
  insert into t_res values ('01a_tour_mit', 'ok email=' || v_b1 || ' privat=' || (not v_b2) || ' nur_primaer=' || v_b3);  -- v_b2 falsch heißt auch „keine Zeile / kein Profil“: dann steht privat=true und das Muster greift nicht
  -- Jede Spalte des Zeilenwerts als Text: keine Adresse in einer Zeile ohne Einwilligung.
  select (x.profile is null) into v_b1 from partner_tour_applications(v_stopp) x where not x.consent_share;
  select position('@' in to_jsonb(x)::text) = 0 into v_b2 from partner_tour_applications(v_stopp) x where not x.consent_share;
  insert into t_res values ('01b_tour_ohne', 'ok profil_leer=' || coalesce(v_b1::text, 'keine Zeile') || ' kein_at=' || coalesce(v_b2::text, 'keine Zeile'));
  select count(*)::integer, bool_and(position('zz-mail-drei' in to_jsonb(x)::text) = 0) into v_n, v_b1 from partner_tour_applications(v_stopp) x;
  insert into t_res values ('01c_tour_fremde_session', 'ok zeilen=' || v_n || ' fremde_adresse=' || (not v_b1));

  -- 02 Masterclass der eigenen Organisation
  select * into v_r from partner_applications(v_se_mc) x where x.consent_share;
  insert into t_res values ('02a_session_mit', 'ok email=' || coalesce(v_r.profile->>'email' = 'zz-mail-eins@example.org', false)
                                               || ' privat=' || coalesce(position('privat' in v_r.profile::text) > 0, true));
  select (x.profile is null) into v_b1 from partner_applications(v_se_mc) x where not x.consent_share;
  select position('@' in to_jsonb(x)::text) = 0 into v_b2 from partner_applications(v_se_mc) x where not x.consent_share;
  insert into t_res values ('02b_session_ohne', 'ok profil_leer=' || coalesce(v_b1::text, 'keine Zeile') || ' kein_at=' || coalesce(v_b2::text, 'keine Zeile'));

  -- 03 Widerruf und erneute Einwilligung (die Person ändert `consent_share`; die Ansicht liest es bei jedem Abruf)
  update application set consent_share = false where id = v_app_mc1;
  select (x.profile is null) into v_b1 from partner_applications(v_se_mc) x where x.id = v_app_mc1;
  select position('@' in to_jsonb(x)::text) = 0 into v_b2 from partner_applications(v_se_mc) x where x.id = v_app_mc1;
  insert into t_res values ('03a_widerruf', 'ok email_weg=' || coalesce(v_b1::text, 'keine Zeile') || ' kein_at=' || coalesce(v_b2::text, 'keine Zeile'));
  update application set consent_share = true where id = v_app_mc1;
  select x.profile->>'email' into v_txt from partner_applications(v_se_mc) x where x.id = v_app_mc1;
  insert into t_res values ('03b_erneut', 'ok email=' || coalesce(v_txt = 'zz-mail-eins@example.org', false));

  -- 04 Team: die Rolle wechselt, das Konto bleibt Partner (beides zugleich: `is_application_team` entscheidet)
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_talent', 'global');
  select x.profile->>'email' into v_txt from applications_for_session(v_se_mc) x where x.consent_share;
  insert into t_res values ('04a_team_mit', 'ok email=' || coalesce(v_txt = 'zz-mail-eins@example.org', false));
  select (x.profile is not null and x.profile ? 'city'), (x.profile ? 'email'), position('zz-mail-zwei' in to_jsonb(x)::text) = 0
    into v_b1, v_b2, v_b3 from applications_for_session(v_se_mc) x where not x.consent_share;
  insert into t_res values ('04b_team_ohne', 'ok profil=' || coalesce(v_b1::text, 'keine Zeile') || ' email=' || coalesce(v_b2::text, 'keine Zeile') || ' kein_at=' || coalesce(v_b3::text, 'keine Zeile'));
  delete from role_assignment where person_id = v_pid and role = 'area_lead_talent';

  -- 05 Fremde Organisation (Gegenstück zu 01 und 02)
  begin
    perform * from partner_tour_applications(v_stopp_fremd);
    insert into t_res values ('05a_fremder_stopp', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05a_fremder_stopp', 'rejected ' || sqlstate);
  end;
  begin
    perform * from partner_applications(v_se_fremd);
    insert into t_res values ('05b_fremde_session', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05b_fremde_session', 'rejected ' || sqlstate);
  end;
  begin
    perform * from applications_for_session(v_se_fremd);
    insert into t_res values ('05c_session_direkt', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05c_session_direkt', 'rejected ' || sqlstate);
  end;

  -- 06 Audit: jeder Abruf steht drin, keiner mit Adresse
  select count(*)::integer, bool_and(position('@' in coalesce(a.after::text, '') || coalesce(a.before::text, '')) = 0) into v_n, v_b1
    from audit_log a where a.action = 'application.partner_view' and a.object_id in (v_se_tour::text, v_se_mc::text);
  insert into t_res values ('06_audit', 'ok abrufe=' || v_n || ' ohne_adresse=' || coalesce(v_b1::text, 'keine Zeile'));
end $$;

-- 07 Form: beide Funktionen
insert into t_res
select '07a_form_session',
       case when not p.prosecdef then 'BUG: nicht SECURITY DEFINER'
            when not coalesce(p.proconfig::text like '%search_path=public, extensions%', false) then 'BUG: search_path nicht fest'
            when not has_function_privilege('authenticated', p.oid, 'execute') then 'BUG: authenticated darf nicht'
            when has_function_privilege('anon', p.oid, 'execute') then 'ALLOWED (BUG): anon'
            else 'ok' end
  from pg_proc p where p.oid = 'applications_for_session(uuid)'::regprocedure;
insert into t_res
select '07b_form_tour',
       case when not p.prosecdef then 'BUG: nicht SECURITY DEFINER'
            when not coalesce(p.proconfig::text like '%search_path=public, extensions%', false) then 'BUG: search_path nicht fest'
            when not has_function_privilege('authenticated', p.oid, 'execute') then 'BUG: authenticated darf nicht'
            when has_function_privilege('anon', p.oid, 'execute') then 'ALLOWED (BUG): anon'
            else 'ok' end
  from pg_proc p where p.oid = 'partner_tour_applications(uuid)'::regprocedure;
insert into t_res
select '07c_zeilenform',
       case when pg_get_function_result('applications_for_session(uuid)'::regprocedure) like '%profile jsonb)' and
                 pg_get_function_result('partner_tour_applications(uuid)'::regprocedure) like '%profile jsonb, wished boolean)'
            then 'ok' else 'BUG: Zeilenform geändert' end;

-- Auswertung: jede erwartete Zeile muss da sein und ihr Muster treffen; nichts Unerwartetes.
insert into t_res
select '99_auswertung',
       case when exists (select 1 from t_erw e where not exists (select 1 from t_res r where r.step = e.step)) then
              'FEHLT: ' || (select string_agg(e.step, ', ') from t_erw e where not exists (select 1 from t_res r where r.step = e.step))
            when exists (select 1 from t_res r join t_erw e on e.step = r.step where coalesce(r.result, '') !~ e.muster) then
              'ABWEICHUNG: ' || (select string_agg(r.step || ' = ' || coalesce(r.result, 'NULL'), ' | ') from t_res r join t_erw e on e.step = r.step where coalesce(r.result, '') !~ e.muster)
            else 'alle ' || (select count(*) from t_erw) || ' Schritte richtig' end;

select * from t_res order by step;
rollback;
