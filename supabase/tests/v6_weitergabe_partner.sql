-- Test „Weitergabe an Partner“ (PART-129, K-78 Weg B, v6_weitergabe_partner.sql). Belegt:
--   01 session_needs_partner_share: Masterclass, Company Tour, Side-Event, Interview Table mit Bewerbung ⇒ wahr;
--      Talk, Reception, Masterclass ohne Bewerbungsweg ⇒ falsch;
--   02 Bewerbung ohne Haken bei einem solchen Format ⇒ P0001 consent_share_required (keine Zeile); mit Haken ok,
--      Nachweis in consent_record (share_with_partner, partner_share_2027-1, meta mit application_id, Sprache);
--      ungültige Version ⇒ 22023; Format ohne Partner-Auswahl bleibt ohne Haken möglich;
--   03 Nachholen: Bestandsbewerbung ohne Haken ⇒ release_application_share setzt das Flag, Nachweis, Audit
--      ohne Adresse; fremde Bewerbung ⇒ P0002; zweiter Aufruf ändert nichts (kein zweiter Nachweis);
--   04 Widerruf: revoke_application_share setzt das Flag zurück, Nachweis granted = false mit derselben Version,
--      Audit;
--   05 Rechte: ohne Sitzung 28000, anon ohne EXECUTE.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_other uuid; v_ed uuid; v_ev uuid; v_day uuid; v_st uuid; v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid;
  v_mc uuid; v_ct uuid; v_se uuid; v_talk uuid; v_a1 uuid; v_a2 uuid; v_old uuid; v_s text; v_n integer; v_org uuid; r record;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 0 limit 1;
  select p.id into v_other from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 1 limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from application where person_id in (v_pid, v_other);
  insert into event (name, format_tag, is_edition, slug) values ('TEST Ed', 'edition', true, 't-ed-p129') returning id into v_ed;
  insert into event (name, format_tag, edition_id, slug) values ('TEST Summit', 'summit', v_ed, 't-summit-p129') returning id into v_ev;
  insert into event_day (event_id, day_date) values (v_ev, '2027-04-16') returning id into v_day;
  insert into stage (event_id, name, slug) values (v_ev, 'Side', 'side-p129') returning id into v_st;
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st, v_day, '2027-04-16 09:00+02', '2027-04-16 10:00+02') returning id into v_s1;
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st, v_day, '2027-04-16 11:00+02', '2027-04-16 12:00+02') returning id into v_s2;
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st, v_day, '2027-04-16 13:00+02', '2027-04-16 14:00+02') returning id into v_s3;
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st, v_day, '2027-04-16 15:00+02', '2027-04-16 16:00+02') returning id into v_s4;
  insert into organization (legal_name, type) values ('ZZ Gastgeber', 'company') returning id into v_org;
  insert into session (event_id, slot_id, title_de, title_en, description_de, format, access_mode, publish_status, capacity, host_org_id)
    values (v_ev, v_s1, 'MC', 'MC', 'x', 'masterclass', 'application', 'published', 20, v_org) returning id into v_mc;
  insert into session (event_id, slot_id, title_de, title_en, description_de, format, access_mode, publish_status, capacity)
    values (v_ev, v_s2, 'CT', 'CT', 'x', 'company_tour', 'application', 'published', 20) returning id into v_ct;
  insert into session (event_id, slot_id, title_de, title_en, description_de, format, access_mode, publish_status, capacity)
    values (v_ev, v_s3, 'SE', 'SE', 'x', 'side_event', 'application', 'published', 20) returning id into v_se;
  insert into session (event_id, slot_id, title_de, title_en, description_de, format, access_mode, publish_status, capacity)
    values (v_ev, v_s4, 'Talk', 'Talk', 'x', 'talk', 'application', 'published', 20) returning id into v_talk;

  -- 01
  insert into t_res values ('01_formate',
    case when session_needs_partner_share(v_mc) and session_needs_partner_share(v_ct) and session_needs_partner_share(v_se)
          and not session_needs_partner_share(v_talk)
          and not coalesce(session_needs_partner_share(gen_random_uuid()), false)
         then 'ok' else 'FEHLER' end);

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 02
  v_s := '';
  begin perform apply_to_session(v_mc, '{}'::jsonb, false); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlerrm = 'consent_share_required' then 'ok' else sqlstate || sqlerrm end; end;
  begin perform apply_to_session(v_mc, '{}'::jsonb, true, 'beliebig'); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '22023' then '/ok' else '/' || sqlstate end; end;
  select count(*) into v_n from application where person_id = v_pid and session_id = v_mc;
  v_a1 := apply_to_session(v_mc, '{}'::jsonb, true, 'partner_share_2027-1', 'de');
  v_a2 := apply_to_session(v_talk, '{}'::jsonb, false);        -- kein Partner-Format: ohne Haken möglich
  select * into r from consent_record c where c.person_id = v_pid and c.consent_type = 'share_with_partner' order by c.granted_at desc limit 1;
  insert into t_res values ('02_pflicht_und_nachweis',
    case when v_s = 'ok/ok' and v_n = 0
          and (select consent_share from application where id = v_a1)
          and not (select consent_share from application where id = v_a2)
          and r.version = 'partner_share_2027-1' and r.granted and r.meta->>'application_id' = v_a1::text
          and r.meta->>'language' = 'de' and r.meta->>'form' = 'application'
         then 'ok' else v_s || ' n=' || v_n end);

  -- 03 Bestandsbewerbung ohne Haken nachholen (Insert am Gate vorbei, wie sie vor der Änderung entstand)
  insert into application (session_id, person_id, answers, consent_share) values (v_ct, v_pid, '{}'::jsonb, false) returning id into v_old;
  select count(*) into v_n from consent_record where person_id = v_pid and consent_type = 'share_with_partner';
  perform release_application_share(v_old, 'partner_share_2027-1', 'en');
  perform release_application_share(v_old);                  -- zweiter Aufruf: nichts
  v_s := '';
  begin perform release_application_share(gen_random_uuid()); v_s := 'ALLOWED (BUG)'; exception when others then v_s := case when sqlstate = 'P0002' then 'ok' else sqlstate end; end;
  insert into application (session_id, person_id, answers, consent_share) values (v_se, v_other, '{}'::jsonb, false);
  begin perform release_application_share((select id from application where person_id = v_other and session_id = v_se));
    v_s := v_s || '/ALLOWED (BUG)'; exception when others then v_s := v_s || case when sqlstate = 'P0002' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('03_nachholen',
    case when v_s = 'ok/ok' and (select consent_share from application where id = v_old)
          and (select count(*) from consent_record where person_id = v_pid and consent_type = 'share_with_partner') = v_n + 1
          and not (select consent_share from application where person_id = v_other and session_id = v_se)
          and exists (select 1 from audit_log a where a.action = 'application.share_release' and a.object_id = v_old::text and a.after::text not like '%@%')
         then 'ok' else v_s || ' n=' || v_n end);

  -- 04 Widerruf
  perform revoke_application_share(v_old);
  insert into t_res values ('04_widerruf',
    case when not (select consent_share from application where id = v_old)
          and exists (select 1 from consent_record c where c.person_id = v_pid and c.consent_type = 'share_with_partner' and not c.granted
                       and c.version = 'partner_share_2027-1' and c.meta->>'application_id' = v_old::text and c.meta->>'form' = 'revoke')
          and exists (select 1 from audit_log a where a.action = 'application.share_revoke' and a.object_id = v_old::text)
         then 'ok' else 'FEHLER' end);

  -- 05 Rechte
  perform set_config('request.jwt.claims', null, true);
  v_s := '';
  begin perform release_application_share(v_old); v_s := 'ALLOWED (BUG)'; exception when others then v_s := case when sqlstate = '28000' then 'ok' else sqlstate end; end;
  insert into t_res values ('05_rechte',
    case when v_s = 'ok'
          and not has_function_privilege('anon', 'release_application_share(uuid,text,text)', 'execute')
          and not has_function_privilege('anon', 'revoke_application_share(uuid)', 'execute')
          and not has_function_privilege('anon', 'apply_to_session(uuid,jsonb,boolean,text,text)', 'execute')
         then 'ok' else v_s end);
end $$;
select * from t_res order by step;
rollback;
