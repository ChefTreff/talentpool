-- Smoke-Test zum Vorschlag v6_speaker_mail_via_admin (SPK-072). Aufbau im
-- Rollback: Speaker S mit Kontakt C1 (Zugang) und C2 (ohne Zugang), ein zweiter
-- Speaker S2 mit Kontakt C3 (Zugang). T mit programme_team an der Edition,
-- K mit marketing_team (kein Speaker-Team).
--
--   01 T setzt C1: Spalte gesetzt, Audit-Eintrag, die Weiche liefert C1   (gegen live: Funktion fehlt)
--   02 T setzt C2 (ohne Zugang) → P0001 contact_without_access
--   03 T setzt C3 (anderes Profil) → P0002 contact_not_found
--   04 K → 42501
--   05 T hebt auf: Spalte leer, zweiter Audit-Eintrag, die Weiche liefert S
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_ps uuid; v_ps2 uuid; v_p1 uuid; v_p2 uuid; v_p3 uuid;
  v_s uuid; v_s2 uuid; v_c1 uuid; v_c2 uuid; v_c3 uuid;
  v_pt uuid; v_ut uuid; v_pk uuid; v_uk uuid;
  r1 text; r2 text; r3 text; r4 text; r5 text; v_n int; v_x text;
begin
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  insert into person (first_name, last_name) values ('Sven', 'ZZVia S') returning id into v_ps;
  insert into person (first_name, last_name) values ('Sara', 'ZZVia S2') returning id into v_ps2;
  insert into person (first_name, last_name) values ('Carl', 'ZZVia C1') returning id into v_p1;
  insert into person (first_name, last_name) values ('Cleo', 'ZZVia C2') returning id into v_p2;
  insert into person (first_name, last_name) values ('Cora', 'ZZVia C3') returning id into v_p3;
  insert into person_email (person_id, email, is_primary) values
    (v_ps, 'zzvia-s@example.org', true), (v_p1, 'zzvia-c1@example.org', true);
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (v_ps, v_ed, 'panelist', 'confirmed', now()) returning id into v_s;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (v_ps2, v_ed, 'panelist', 'confirmed', now()) returning id into v_s2;
  -- Zugang verlangt Person und Adresse (`speaker_contact_access_chk`).
  insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, has_access, consent_at)
  values (v_s, 'assistant', v_p1, 'Carl', 'ZZVia C1', 'zzvia-c1@example.org', true, current_date) returning id into v_c1;
  insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, has_access, consent_at)
  values (v_s, 'office', v_p2, 'Cleo', 'ZZVia C2', 'zzvia-c2@example.org', false, current_date) returning id into v_c2;
  insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, has_access, consent_at)
  values (v_s2, 'assistant', v_p3, 'Cora', 'ZZVia C3', 'zzvia-c3@example.org', true, current_date) returning id into v_c3;

  select p.id, p.auth_user_id into v_pt, v_ut from person p where p.auth_user_id is not null order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pk, v_uk from person p where p.auth_user_id is not null and p.id <> v_pt order by p.created_at limit 1;
  delete from role_assignment where person_id in (v_pt, v_pk);
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pt, 'programme_team', 'edition', v_ed);
  insert into role_assignment (person_id, role, scope_type) values (v_pk, 'marketing_team', 'global');

  -- ---- T
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select set_speaker_mail_via($1, $2)' using v_s, v_c1;
    r1 := 'ok';
  exception when others then r1 := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  begin
    execute 'select set_speaker_mail_via($1, $2)' using v_s, v_c2;
    r2 := 'FEHLER ohne Zugang gesetzt';
  exception when others then
    r2 := case when sqlstate = 'P0001' and sqlerrm = 'contact_without_access' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
  end;
  begin
    execute 'select set_speaker_mail_via($1, $2)' using v_s, v_c3;
    r3 := 'FEHLER fremder Kontakt gesetzt';
  exception when others then
    r3 := case when sqlstate = 'P0002' and sqlerrm = 'contact_not_found' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
  end;
  execute 'reset role';
  if r1 = 'ok' then
    select count(*) into v_n from audit_log a
     where a.action = 'speaker.mail_via' and a.object_id = v_s::text and a.after->>'mail_via_contact_id' = v_c1::text;
    r1 := case when (select mail_via_contact_id from speaker_profile where id = v_s) = v_c1
                and v_n = 1 and speaker_mail_recipient(v_s) = v_p1 then 'ok'
               else 'FEHLER Spalte/Audit/Weiche (audit=' || v_n || ')' end;
  end if;
  -- Nach dem abgewiesenen Versuch steht weiter C1.
  if r2 = 'ok' and (select mail_via_contact_id from speaker_profile where id = v_s) is distinct from v_c1 then
    r2 := 'FEHLER Spalte verändert';
  end if;
  insert into t_res values ('01_team_setzt_kontakt', r1), ('02_ohne_zugang_abgewiesen', r2), ('03_fremder_kontakt_abgewiesen', r3);

  -- ---- K
  perform set_config('request.jwt.claims', json_build_object('sub', v_uk, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select set_speaker_mail_via($1, null)' using v_s;
    r4 := 'FEHLER K durfte';
  exception when others then r4 := case when sqlstate = '42501' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
  end;
  execute 'reset role';
  insert into t_res values ('04_nur_das_speaker_team', r4);

  -- ---- T hebt auf
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select set_speaker_mail_via($1, null)' using v_s;
    r5 := 'ok';
  exception when others then r5 := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  if r5 = 'ok' then
    select count(*) into v_n from audit_log a where a.action = 'speaker.mail_via' and a.object_id = v_s::text;
    select speaker_mail_recipient(v_s)::text into v_x;
    r5 := case when (select mail_via_contact_id from speaker_profile where id = v_s) is null
                and v_n = 2 and v_x = v_ps::text then 'ok'
               else 'FEHLER aufheben (audit=' || v_n || ', weiche=' || coalesce(v_x, 'null') || ')' end;
  end if;
  insert into t_res values ('05_aufheben_mit_audit', r5);
end $$;
select * from t_res order by step;
rollback;
