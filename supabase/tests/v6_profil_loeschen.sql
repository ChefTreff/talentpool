-- Smoke-Test 0115 (Profil löschen · ADM-031, Art. 17 DSGVO). Belegt:
--   01 ohne Login 28000;
-- Die drei Testpersonen sind **geliehene** Konten: `person.auth_user_id` zeigt
-- auf `auth.users`, erfundene UUIDs gehen also nicht. Ihre Bindungen werden zu
-- Beginn geloest, damit die Ausgangslage bekannt ist; alles rollt zurueck.
--   02 eine Person ohne Bindung hat keine Hürde;
--   03 sie löscht sofort: Rückgabe `done`, Name weg, Zugang weg, `deleted_at` gesetzt;
--   04 die Adresse steht als Hash auf der Sperrliste;
--   05 der Vorgang bleibt als `done` nachweisbar, auch wenn die Person anonym ist;
--   06 eine Teamrolle ist eine Hürde;
--   07 ein zugesagter Auftritt einer kommenden Edition auch;
--   08 mit Hürde entsteht ein **Antrag** statt einer Löschung — die Person bleibt;
--   09 ein zweiter Antrag ⇒ P0001 `already_requested`;
--   10 die Warteschlange ohne Admin-Rolle 42501;
--   11 mit Admin steht der Antrag drin, mit Namen, Adresse und den Hürden;
--   12 Ablehnen ohne Begründung ⇒ 22023 `note_required`;
--   13 Ablehnen mit Begründung schliesst den Antrag und reiht die Antwort ein;
--   14 ein erfundener Vorgang ⇒ 22023 `invalid_action`, ein unbekannter ⇒ P0002;
--   15 Löschen aus der Warteschlange anonymisiert die Person.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_admin uuid; v_admin_uid uuid; v_admin_mail text;
  v_frei uuid; v_frei_uid uuid; v_frei_mail text; v_hash text;
  v_geb uuid; v_geb_uid uuid; v_geb_mail text;
  v_ed uuid; v_req uuid; v_txt text; v_n integer; v_b text[]; v_leihe uuid[] := '{}';
begin
  select e.id into v_ed from event e where e.is_edition and e.end_date >= current_date
   order by e.start_date limit 1;

  -- Drei Personen mit echtem Login. `person.auth_user_id` zeigt auf `auth.users`
  -- — erfundene UUIDs gehen nicht, also leihen wir uns bestehende Konten und
  -- **loesen ihre Bindungen im Test**, damit die Ausgangslage bekannt ist.
  -- Alles rollt am Ende zurueck.
  for v_frei, v_frei_uid, v_frei_mail in
    select p.id, p.auth_user_id, pe.email::text
      from person p join person_email pe on pe.person_id = p.id and pe.is_primary
     where p.auth_user_id is not null and p.deleted_at is null
     order by p.created_at limit 3
  loop
    v_leihe := array_append(v_leihe, v_frei);
  end loop;
  v_frei := v_leihe[1]; v_geb := v_leihe[2]; v_admin := v_leihe[3];
  select p.auth_user_id, pe.email::text into v_frei_uid, v_frei_mail
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.id = v_frei;
  select p.auth_user_id, pe.email::text into v_geb_uid, v_geb_mail
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.id = v_geb;
  select p.auth_user_id, pe.email::text into v_admin_uid, v_admin_mail
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.id = v_admin;

  -- Bekannte Ausgangslage: keine Rolle, keine Organisation, keine Zusage.
  delete from role_assignment where person_id = any (v_leihe);
  delete from org_membership   where person_id = any (v_leihe);
  update speaker_profile   set confirmed_at = null where person_id = any (v_leihe);
  update volunteer_profile set status = 'applied'  where person_id = any (v_leihe);
  update person set first_name = 'ZZTEST',
                    last_name = case when id = v_frei then 'Frei'
                                     when id = v_geb  then 'Gebunden' else 'Admin' end
   where id = any (v_leihe);

  -- 01 ohne Login ------------------------------------------------------------
  perform set_config('request.jwt.claims', null, true);
  begin
    perform my_deletion_blockers();
    insert into t_res values ('01_ohne_login', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01_ohne_login', 'abgewiesen ' || sqlstate); end;

  -- 02/03/04/05 ohne Bindung --------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_frei_uid, 'role', 'authenticated', 'email', v_frei_mail)::text, true);
  v_b := my_deletion_blockers();
  insert into t_res values ('02_keine_huerde',
    case when cardinality(v_b) = 0 then 'keine (richtig)' else 'unerwartet ' || array_to_string(v_b, ',') end);

  v_txt := request_profile_deletion('Kein Interesse mehr');
  insert into t_res values ('03_sofort_geloescht',
    case when v_txt = 'done'
          and exists (select 1 from person p where p.id = v_frei
                       and p.first_name is null and p.auth_user_id is null and p.deleted_at is not null)
         then 'geloescht (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  select count(*)::integer into v_n from suppression
   where email_hash = email_hash(v_frei_mail) and reason = 'profile_deleted';
  insert into t_res values ('04_sperrliste',
    case when v_n = 1 then 'Hash gesperrt (richtig)' else 'FEHLT (' || v_n || ')' end);

  select status || '|' || coalesce(reason, '-') into v_txt
    from profile_deletion_request where person_id = v_frei;
  insert into t_res values ('05_vorgang_bleibt',
    case when v_txt = 'done|Kein Interesse mehr' then 'nachweisbar (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 06 Teamrolle als Hürde ----------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_geb_uid, 'role', 'authenticated', 'email', v_geb_mail)::text, true);
  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_geb, 'speaker_manager', 'global', now() - interval '1 hour');
  v_b := my_deletion_blockers();
  insert into t_res values ('06_huerde_teamrolle',
    case when 'team_role' = any (v_b) then 'erkannt (richtig)' else 'FEHLT (' || array_to_string(v_b, ',') || ')' end);
  delete from role_assignment where person_id = v_geb;

  -- 07 zugesagter Auftritt ----------------------------------------------------
  insert into speaker_profile (person_id, edition_id, speaker_type, confirmed_at)
  values (v_geb, v_ed, 'keynote', now())
  on conflict (person_id, edition_id) do update set confirmed_at = now(), declined_at = null;
  v_b := my_deletion_blockers();
  insert into t_res values ('07_huerde_speaker',
    case when 'speaker' = any (v_b) then 'erkannt (richtig)' else 'FEHLT (' || array_to_string(v_b, ',') || ')' end);

  -- 08 Antrag statt Löschung ---------------------------------------------------
  v_txt := request_profile_deletion('Bitte alles weg');
  insert into t_res values ('08_antrag',
    case when v_txt = 'pending'
          and exists (select 1 from person p where p.id = v_geb and p.first_name = 'ZZTEST' and p.deleted_at is null)
         then 'Antrag, Person bleibt (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 09 zweiter Antrag ----------------------------------------------------------
  begin
    perform request_profile_deletion(null);
    insert into t_res values ('09_zweiter_antrag', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('09_zweiter_antrag', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 10 Warteschlange ohne Recht -------------------------------------------------
  begin
    perform deletion_requests_admin();
    insert into t_res values ('10_liste_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('10_liste_ohne_recht', 'abgewiesen ' || sqlstate); end;

  -- 11 Warteschlange mit Admin --------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin_uid, 'role', 'authenticated', 'email', v_admin_mail)::text, true);
  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_admin, 'admin', 'global', now() - interval '1 hour');

  select r.id, r.person_name || '|' || r.email || '|' || array_to_string(r.blockers, ',')
    into v_req, v_txt
    from deletion_requests_admin('pending') r where r.person_id = v_geb;
  insert into t_res values ('11_liste_mit_admin',
    case when v_txt = 'ZZTEST Gebunden|' || v_geb_mail || '|speaker'
         then 'Zeile mit Name, Adresse, Huerde (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 12 Ablehnen ohne Begründung ---------------------------------------------------
  begin
    perform resolve_deletion_request(v_req, 'reject');
    insert into t_res values ('12_reject_ohne_grund', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('12_reject_ohne_grund', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 13 Ablehnen mit Begründung ----------------------------------------------------
  perform resolve_deletion_request(v_req, 'reject', 'Dein Auftritt steht noch aus.');
  select r.status || '|' || coalesce(r.handled_note, '-') into v_txt
    from profile_deletion_request r where r.id = v_req;
  select count(*)::integer into v_n from mail_log
   where template_key = 'deletion_rejected' and related_id = v_req;
  insert into t_res values ('13_reject',
    case when v_txt = 'rejected|Dein Auftritt steht noch aus.' and v_n = 1
         then 'geschlossen, Antwort eingereiht (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') || ' / mails ' || v_n end);

  -- 14 falsche Eingaben -------------------------------------------------------------
  begin
    perform resolve_deletion_request(v_req, 'vernichten', 'x');
    insert into t_res values ('14a_aktion', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('14a_aktion', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin
    perform resolve_deletion_request(gen_random_uuid(), 'delete');
    insert into t_res values ('14b_unbekannt', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('14b_unbekannt', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 15 Löschen aus der Warteschlange ---------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_geb_uid, 'role', 'authenticated', 'email', v_geb_mail)::text, true);
  perform request_profile_deletion('zweiter Anlauf');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin_uid, 'role', 'authenticated', 'email', v_admin_mail)::text, true);
  select r.id into v_req from deletion_requests_admin('pending') r where r.person_id = v_geb;
  perform resolve_deletion_request(v_req, 'delete');
  insert into t_res values ('15_loeschen_aus_liste',
    case when exists (select 1 from person p where p.id = v_geb
                       and p.first_name is null and p.auth_user_id is null and p.deleted_at is not null)
          and exists (select 1 from profile_deletion_request r where r.id = v_req
                       and r.status = 'done' and r.handled_by = v_admin)
         then 'anonymisiert und abgehakt (richtig)' else 'FEHLT' end);
end $$;
select * from t_res order by step;
rollback;
-- Lauf am 17.09. gegen die Datenbank (Migration + Test in einer Transaktion, rollback): 16/16 gruen
-- (Schritt 14 zaehlt als 14a/14b).
