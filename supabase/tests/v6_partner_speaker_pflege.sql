-- Smoke-Test 0139 (Der Partner pflegt seinen Speaker, Welle 6 B6 / PART-044). Belegt:
--   01 einen selbst eingetragenen Speaker zeigt `partner_speakers` mit `can_edit` **und**
--      den Programmfeldern — das ist der Fall, für den das Pflegerecht gedacht ist;
--   02 der Partner pflegt Name, Position und Biografie, und es steht danach da;
--   03 ein Feld ausserhalb der Whitelist (Telefon) wird mit P0001 `not_editable` abgewiesen —
--      private Angaben gehoeren der Person, nicht dem Partner;
--   04 eine nur per Mailadresse zugeordnete **bestehende** Person: kein Pflegerecht, und die
--      Anzeige gibt ausser Name und Status nichts heraus (Review-Auflage zu #68);
--   05 Pflegen an so einem Profil ⇒ P0001 `speaker_not_editable`;
--   06 nach dem ersten Login der Speakerin faellt das Recht, und beides gilt wieder: keine
--      Pflege, keine Detailanzeige;
--   07 eine fremde Organisation sieht nichts (42501);
--   08 `anon` darf keine der beiden Funktionen ausfuehren.
-- Probelauf Bau-Chat 21.09.2026 (`sh scripts/db.sh dry-run`): **11/11 gruen**.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_summit uuid;
  v_org uuid; v_fremd uuid; v_oe uuid; v_sess uuid; v_sess2 uuid;
  v_prof uuid; v_prof2 uuid; v_bestand uuid; v_geliehen uuid; v_uid2 uuid;
  v_n integer; v_txt text; v_r record;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_summit from event e where e.edition_id = v_ed order by e.start_date limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into organization (legal_name) values ('ZZ Talk GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremde Talk GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited')
    returning id into v_oe;
  insert into session (event_id, format, title_de, partner_org_id)
    values (v_summit, 'keynote', 'ZZ Keynote', v_org) returning id into v_sess;
  insert into session (event_id, format, title_de, partner_org_id)
    values (v_summit, 'panel', 'ZZ Panel', v_org) returning id into v_sess2;
  -- Eine Person, die es im Portal schon gibt, aber nicht als Speaker dieser Edition.
  insert into person (first_name, last_name) values ('ZZ', 'Bestandsperson') returning id into v_bestand;
  insert into person_email (person_id, email, is_primary) values (v_bestand, 'zz-bestand-b6@example.org', true);
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- 01 Neuer Speaker: Pflegerecht und Detailanzeige
  v_prof := partner_add_speaker(v_sess, 'zz-neu-b6@example.org', 'ZZ', 'Neuling');
  perform partner_update_speaker(v_prof, jsonb_build_object('job_title', 'ZZ Vorstand'));
  select * into v_r from partner_speakers(v_org, v_ed) q where q.profile_id = v_prof;
  insert into t_res values ('01_neuer_speaker_pflegbar',
    case when v_r.can_edit and v_r.job_title = 'ZZ Vorstand' and v_r.session_id = v_sess
         then 'pflegbar, Felder sichtbar, an der Session (richtig)'
         else 'unerwartet can_edit=' || coalesce(v_r.can_edit::text,'null')
              || ' job=' || coalesce(v_r.job_title,'null') end);

  -- 02 Pflege wirkt in beiden Tabellen
  perform partner_update_speaker(v_prof, jsonb_build_object(
    'first_name', 'ZZ Vorname', 'last_name', 'ZZ Nachname', 'title', 'Dr.',
    'organization_name', 'ZZ Talk GmbH', 'bio_short_de', 'ZZ Kurzbio', 'linkedin_url', 'https://zz.example/x'));
  select * into v_r from partner_speakers(v_org, v_ed) q where q.profile_id = v_prof;
  insert into t_res values ('02_pflege_wirkt',
    case when v_r.display_name = 'ZZ Vorname ZZ Nachname' and v_r.title = 'Dr.'
              and v_r.bio_short_de = 'ZZ Kurzbio' and v_r.linkedin_url = 'https://zz.example/x'
         then 'Name, Titel, Bio und LinkedIn (richtig)'
         else 'unerwartet ' || coalesce(v_r.display_name,'?') || '/' || coalesce(v_r.title,'?') end);

  -- 03 Privates Feld abgewiesen
  begin
    perform partner_update_speaker(v_prof, jsonb_build_object('phone_e164', '+49 40 1'));
    insert into t_res values ('03_privates_feld', 'ALLOWED (BUG): Telefon durch den Partner gesetzt');
  exception
    when sqlstate 'P0001' then insert into t_res values ('03_privates_feld', 'P0001 not_editable (richtig)');
    when others then insert into t_res values ('03_privates_feld', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 04 Bestehende Person: Vorbedingung, dann keine Pflege und keine Details
  select count(*)::integer into v_n from speaker_profile sp
   where sp.person_id = v_bestand and sp.edition_id = v_ed;
  insert into t_res values ('04_vorbedingung',
    case when v_n = 0 then 'Person da, Speaker-Profil nicht (richtig)'
         else 'FEHLT — die RPC fasst ein vorhandenes Profil nicht an, der Zweig bliebe ungeprueft' end);
  v_prof2 := partner_add_speaker(v_sess2, 'zz-bestand-b6@example.org', 'ZZ', 'Egal');
  select * into v_r from partner_speakers(v_org, v_ed) q where q.profile_id = v_prof2;
  insert into t_res values ('04b_geclaimt_ohne_details',
    case when v_r.can_edit then 'ALLOWED (BUG): Pflegerecht an einer geclaimten Person'
         when v_r.job_title is not null or v_r.bio_short_de is not null or v_r.linkedin_url is not null
           then 'ALLOWED (BUG): fremde Stammdaten sichtbar'
         when v_r.display_name is null then 'zu wenig — auch der Name fehlt'
         else 'Name und Status, sonst nichts (richtig)' end);

  -- 05 Pflege daran abgewiesen
  begin
    perform partner_update_speaker(v_prof2, jsonb_build_object('job_title', 'ZZ Fremd'));
    insert into t_res values ('05_geclaimt_nicht_pflegbar', 'ALLOWED (BUG): fremde Stammdaten geaendert');
  exception
    when sqlstate 'P0001' then insert into t_res values ('05_geclaimt_nicht_pflegbar', 'P0001 (richtig)');
    when others then insert into t_res values ('05_geclaimt_nicht_pflegbar', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 06 Nach dem ersten Login faellt das Recht. Das Konto wird geliehen, nicht erfunden:
  --    `person.auth_user_id` zeigt auf `auth.users`.
  --    Der Speaker wird **neu** angelegt (nur dann gilt das Recht), und das Konto kommt von
  --    einer anderen Person: erst weg bei ihr, dann hin zu ihm. `person.auth_user_id` ist
  --    eindeutig und zeigt auf `auth.users` — erfundene UUIDs gehen nicht.
  select p.id, p.auth_user_id into v_geliehen, v_uid2
    from person p where p.auth_user_id is not null and p.id <> v_pid limit 1;
  if v_geliehen is null then
    insert into t_res values ('06_vor_login', 'AUSGESETZT — kein zweites Konto im Bestand');
  else
    -- Neue Mailadresse, also legt die RPC eine neue Person an: Pflegerecht gilt.
    v_prof2 := partner_add_speaker(v_sess, 'zz-login-b6@example.org', 'ZZ', 'Loginfall');
    select q.can_edit::text, q.person_id into v_txt, v_bestand
      from partner_speakers(v_org, v_ed) q where q.profile_id = v_prof2;
    insert into t_res values ('06_vor_login',
      case when v_txt = 'true' then 'vor dem Login pflegbar (richtig)' else 'unerwartet ' || coalesce(v_txt,'null') end);
    -- Sie meldet sich an: das geliehene Konto wandert auf die neue Person.
    insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
    update person set auth_user_id = null where id = v_geliehen;
    update person set auth_user_id = v_uid2 where id = v_bestand;
    delete from role_assignment where person_id = v_pid and role = 'admin';
    begin
      perform partner_update_speaker(v_prof2, jsonb_build_object('job_title', 'ZZ Zu spaet'));
      insert into t_res values ('06b_nach_login', 'ALLOWED (BUG): Pflege nach dem Login');
    exception
      when sqlstate 'P0001' then insert into t_res values ('06b_nach_login', 'P0001 speaker_not_editable (richtig)');
      when others then insert into t_res values ('06b_nach_login', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
    end;
    select * into v_r from partner_speakers(v_org, v_ed) q where q.profile_id = v_prof2;
    insert into t_res values ('06c_anzeige_nach_login',
      case when v_r.job_title is null and v_r.display_name is not null
           then 'nur noch Name und Status (richtig)'
           else 'ALLOWED (BUG): Details bleiben sichtbar' end);
  end if;

  -- 07 Fremde Organisation
  begin
    perform partner_speakers(v_fremd, v_ed);
    insert into t_res values ('07_fremde_org', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('07_fremde_org', '42501 (richtig)');
    when others then insert into t_res values ('07_fremde_org', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;

-- 08 anon darf nichts
insert into t_res
select '08_anon_gesperrt',
       case when has_function_privilege('anon', 'partner_speakers(uuid, uuid)', 'execute')
              or has_function_privilege('anon', 'partner_update_speaker(uuid, jsonb)', 'execute')
            then 'ALLOWED (BUG)' else 'beide gesperrt (richtig)' end;

select * from t_res order by step;
rollback;
