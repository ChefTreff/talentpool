-- Test zu `v6_award_kontakt_frist` (K-51). Belegt:
--   01 Edition vor 15 Monaten zu Ende: Vor-, Nachname, E-Mail geleert, Zeitpunkt gesetzt,
--      Texte und Stimmen bleiben; Audit ohne Adresse;
--   02 Edition vor 13 Monaten zu Ende: unberührt (Gegenprobe);
--   03 zweiter Lauf: 0 (idempotent);
--   04 mit Sitzung ohne Abschnitt initiatives: 42501; mit partner_team (Abschnitt): erlaubt;
--   05 Prüfregel: ohne Leerungszeitpunkt keine leere Adresse.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_alt uuid; v_neu uuid; v_a uuid; v_b uuid; v_n integer; v_txt text; v_me uuid; v_uid uuid; v_email text;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into event (name, format_tag, slug, is_edition, start_date, end_date)
  values ('ZZTEST Award alt', 'edition', 'zztest-award-alt', true, current_date - interval '15 months 2 days', (current_date - interval '15 months')::date) returning id into v_alt;
  insert into event (name, format_tag, slug, is_edition, start_date, end_date)
  values ('ZZTEST Award jung', 'edition', 'zztest-award-jung', true, current_date - interval '13 months 2 days', (current_date - interval '13 months')::date) returning id into v_neu;
  insert into award_application (edition_id, name, location, description, mission, project, contact_first_name, contact_last_name, contact_email, privacy_consent_at, status)
  values (v_alt, 'ZZTEST Alt', 'Hamburg', 'D', 'M', 'P', 'Ada', 'ZZTEST', 'zztest-alt@example.org', now(), 'accepted') returning id into v_a;
  insert into award_application (edition_id, name, location, description, mission, project, contact_first_name, contact_last_name, contact_email, privacy_consent_at)
  values (v_neu, 'ZZTEST Jung', 'Hamburg', 'D', 'M', 'P', 'Bea', 'ZZTEST', 'zztest-jung@example.org', now()) returning id into v_b;
  insert into award_vote (application_id, edition_id, voter_hash) values (v_a, v_alt, repeat('a', 64));

  v_n := award_purge_contacts();
  select coalesce(contact_first_name, '-') || '/' || coalesce(contact_email::text, '-') || '/' || (contact_purged_at is not null)::text || '/' || name || '/' || description
    into v_txt from award_application where id = v_a;
  insert into t_res values ('01_alt_geleert', 'n>=1=' || (v_n >= 1)::text || ' ' || v_txt
    || ' stimmen=' || (select count(*) from award_vote where application_id = v_a)
    || ' audit_ohne_adresse=' || (select bool_and(after::text not like '%@%') from audit_log where action = 'award.contacts_purged' and object_id = v_alt::text)::text
    || ' (erwartet n>=1=true -/-/true/ZZTEST Alt/D stimmen=1 audit_ohne_adresse=true)');
  select contact_first_name || '/' || contact_email || '/' || (contact_purged_at is null)::text into v_txt from award_application where id = v_b;
  insert into t_res values ('02_jung_unberuehrt', v_txt || ' (erwartet Bea/zztest-jung@example.org/true)');
  select count(*) into v_n from award_application where id in (v_a, v_b) and contact_purged_at is not null;
  insert into t_res values ('03_idempotent', 'zweiter=' || award_purge_contacts() || ' geleert=' || v_n || ' (erwartet zweiter=0 geleert=1)');

  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'talent_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform award_purge_contacts(); v_txt := 'ERLAUBT'; exception when sqlstate '42501' then v_txt := '42501'; end;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform award_purge_contacts(); v_txt := v_txt || ' partner_team=ok'; exception when sqlstate '42501' then v_txt := v_txt || ' partner_team=42501'; end;
  insert into t_res values ('04_rechte', v_txt || ' (erwartet 42501 partner_team=ok)');
  perform set_config('request.jwt.claims', '', true);

  begin update award_application set contact_email = null where id = v_b; v_txt := 'LEER ERLAUBT'; exception when check_violation then v_txt := 'check_violation'; end;
  insert into t_res values ('05_pruefregel', v_txt || ' (erwartet check_violation)');
end $$;
select * from t_res order by step;
rollback;
