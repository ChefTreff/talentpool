-- Test „Hackathon-Startseite als Event-Seite“ (HACK-020, v6_hack_eventseite.sql). Belegt:
--   01 neue Spalten an event; anon ohne EXECUTE auf hack_event_info und set_hackathon_info;
--   02 set_hackathon_info: ohne Hackathon-Rechte 42501, Team schreibt Zeiten, Zusatzzeile, Ort; Ende vor Beginn
--      22023 invalid_times; Zusatzzeile über 200 Zeichen 22023; Audit nennt nur die Feldnamen, keine Werte;
--   03 hack_event_info: ohne Sitzung 28000, angemeldet ohne Hackathon-Rolle 42501, mit Rolle liefert Datum, Zeiten, Ort, Zusatzzeile in der Sprache
--      (Rückfall auf die andere Sprache);
--   04 Ansprechperson: Typ hackathon_lead über upsert_edition_contact (fremde Adresse ohne Einwilligung ⇒
--      contact_consent_required), erscheint als contact mit Name, Rolle, Mail, Telefon; Kontakte anderer Typen
--      (partner_lead) erscheinen nicht; ohne Kontakt ⇒ contact null;
--   05 Zähler: bei 19 angenommenen Bewerbungen accepted und teams null, bei 20 die Zahlen; keine Namen im Ergebnis.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_admin uuid; v_admin_uid uuid; v_team uuid; v_team_uid uuid; v_user uuid; v_user_uid uuid;
  v_ed uuid; v_ev uuid; v_s text; v_j jsonb; v_n integer; v_acc integer; i integer; v_p uuid; v_id uuid; v_audit text; v_gate text;
begin
  select p.id, p.auth_user_id into v_admin, v_admin_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 0 limit 1;
  select p.id, p.auth_user_id into v_team, v_team_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 1 limit 1;
  select p.id, p.auth_user_id into v_user, v_user_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 2 limit 1;
  delete from role_assignment where person_id in (v_admin, v_team, v_user);
  insert into role_assignment (person_id, role, scope_type) values (v_admin, 'admin', 'global'), (v_team, 'hackathon_team', 'global');
  v_ed := hack_edition(null);
  select id into v_ev from event where format_tag = 'hackathon' and edition_id = v_ed limit 1;
  delete from edition_contact where edition_id = v_ed and type = 'hackathon_lead';

  -- 01
  insert into t_res values ('01_spalten_grants',
    case when (select count(*) from information_schema.columns where table_name = 'event'
                and column_name in ('start_time', 'end_time', 'schedule_note_de', 'schedule_note_en')) = 4
          and not has_function_privilege('anon', 'hack_event_info(uuid,text)', 'execute')
          and not has_function_privilege('anon', 'set_hackathon_info(jsonb)', 'execute')
         then 'ok' else 'FEHLER' end);

  -- 02
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_uid, 'role', 'authenticated')::text, true);
  v_s := '';
  begin perform set_hackathon_info('{"venue":"Halle X"}'::jsonb); v_s := 'ALLOWED (BUG)'; exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_team_uid, 'role', 'authenticated')::text, true);
  perform set_hackathon_info(jsonb_build_object('start_date', '2027-04-15', 'end_date', '2027-04-16', 'start_time', '14:00', 'end_time', '18:00',
      'schedule_note_de', 'Kick-off 14:00 · Demos Samstag', 'venue', 'ZZ Halle 2', 'location', 'Hamburg'));
  begin perform set_hackathon_info('{"end_date":"2027-04-15","end_time":"10:00"}'::jsonb); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlerrm = 'invalid_range' then '/ok' else '/' || sqlstate end; end;
  begin perform set_hackathon_info(jsonb_build_object('schedule_note_en', repeat('x', 201))); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlerrm = 'note_too_long' then '/ok' else '/' || sqlstate end; end;
  select a.after::text into v_audit from audit_log a where a.action = 'hack.info_set' and a.object_id = v_ev::text order by a.created_at desc limit 1;
  insert into t_res values ('02_pflege',
    case when v_s = 'ok/ok/ok'
          and (select venue from event where id = v_ev) = 'ZZ Halle 2'
          and (select start_time from event where id = v_ev) = time '14:00' and (hack_event_info(v_ed, 'en')->>'starts_at')::timestamptz = '2027-04-15T14:00:00+02:00'::timestamptz
          and v_audit like '%schedule_note_de%' and v_audit not like '%Kick-off%' and v_audit not like '%ZZ Halle%'
         then 'ok' else v_s || ' ' || coalesce(v_audit, '-') end);

  -- 03 Gate: angemeldet, aber ohne Hackathon-Rolle ⇒ 42501; mit Rolle ⇒ Auskunft
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_uid, 'role', 'authenticated')::text, true);
  begin perform hack_event_info(v_ed, 'de'); v_gate := 'ALLOWED (BUG)'; exception when others then v_gate := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  perform set_config('request.jwt.claims', null, true);
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_user, 'hackathon_participant', 'edition', null, v_ed);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_uid, 'role', 'authenticated')::text, true);
  v_j := hack_event_info(v_ed, 'de');
  v_s := (hack_event_info(v_ed, 'en')->>'note');
  perform set_config('request.jwt.claims', null, true);
  begin perform hack_event_info(v_ed, 'de'); v_n := 0; exception when others then v_n := case when sqlstate = '28000' then 1 else 2 end; end;
  insert into t_res values ('03_event_info',
    case when v_gate = 'ok' and v_n = 1 and v_j->>'venue' = 'ZZ Halle 2' and v_j->>'note' = 'Kick-off 14:00 · Demos Samstag' and v_s = 'Kick-off 14:00 · Demos Samstag'
          and v_j->>'start_date' is not null and v_j->>'timezone' = 'Europe/Berlin' and v_j->'contact' = 'null'::jsonb
         then 'ok' else v_n::text || ' ' || v_j::text end);

  -- 04
  insert into edition_contact (edition_id, type, display_name, role_label_de, role_label_en, email, phone, is_default)
  values (v_ed, 'partner_lead', 'ZZ Partnerperson', null, null, 'zz-partner@chef-treff.de', '+49 40 1', false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_uid, 'role', 'authenticated')::text, true);
  v_s := '';
  begin perform upsert_edition_contact(jsonb_build_object('edition_id', v_ed, 'type', 'hackathon_lead', 'display_name', 'ZZ Extern', 'email', 'extern@example.com', 'phone', '+49 1'));
    v_s := 'ALLOWED (BUG)'; exception when others then v_s := case when sqlerrm = 'contact_consent_required' then 'ok' else sqlstate || sqlerrm end; end;
  v_id := upsert_edition_contact(jsonb_build_object('edition_id', v_ed, 'type', 'hackathon_lead', 'display_name', 'ZZ Hackathon-Lead',
      'role_label_de', 'Leitung Hackathon', 'role_label_en', 'Hackathon lead', 'email', 'zz-hack@chef-treff.de', 'phone', '+49 40 2', 'is_default', true));
  v_j := hack_event_info(v_ed, 'en');
  insert into t_res values ('04_ansprechperson',
    case when v_s = 'ok' and v_j->'contact'->>'name' = 'ZZ Hackathon-Lead' and v_j->'contact'->>'role' = 'Hackathon lead'
          and v_j->'contact'->>'email' = 'zz-hack@chef-treff.de' and v_j->'contact'->>'phone' = '+49 40 2'
         then 'ok' else v_s || ' ' || coalesce(v_j->>'contact', '-') end);

  -- 05 Zähler: auf genau 19 bzw. 20 angenommene Bewerbungen bringen
  select count(*) into v_acc from hack_application where edition_id = v_ed and status = 'accepted';
  if v_acc > 19 then
    update hack_application set status = 'applied' where edition_id = v_ed and status = 'accepted'
       and id in (select id from hack_application where edition_id = v_ed and status = 'accepted' order by applied_at limit v_acc - 19);
  end if;
  select count(*) into v_acc from hack_application where edition_id = v_ed and status = 'accepted';
  for i in 1..(19 - v_acc) loop
    insert into person (first_name, last_name, source_first, tier) values ('ZZH', 'Zaehler' || i, 'test', 'lead') returning id into v_p;
    insert into hack_application (person_id, edition_id, skills, status, track_prefs) values (v_p, v_ed, '{}', 'accepted', '{}');
  end loop;
  v_j := hack_event_info(v_ed, 'en');
  v_s := case when v_j->'accepted' = 'null'::jsonb and v_j->'teams' = 'null'::jsonb then 'ok' else v_j::text end;
  insert into person (first_name, last_name, source_first, tier) values ('ZZH', 'Zaehler20', 'test', 'lead') returning id into v_p;
  insert into hack_application (person_id, edition_id, skills, status, track_prefs) values (v_p, v_ed, '{}', 'accepted', '{}');
  v_j := hack_event_info(v_ed, 'en');
  insert into t_res values ('05_zaehler',
    case when v_s = 'ok' and (v_j->>'accepted')::integer = 20 and (v_j->>'teams') is not null
          and v_j::text !~ 'Zaehler'
         then 'ok' else v_s || ' ' || v_j::text end);
end $$;
select * from t_res order by step;
rollback;
