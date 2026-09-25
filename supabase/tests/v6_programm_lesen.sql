-- Smoke-Test zum Vorschlag v6_programm_lesen (LEAD-032). Prüft RLS **mit echtem
-- Rollenwechsel** (`set local role authenticated`) — als Superuser griffe RLS nicht,
-- und ein grüner Test belegte nichts. Aufbau im Rollback: zwei Organisationen,
-- zwei Test-Bühnen (S1 Stage Lead, S2 Standbühne von B), drei Slots, vier Sessions.
--
--   A  Partner A mit Standbühnen-Rolle (Scope org A), Mitglied von A
--      01 liest Veröffentlichtes — Vorbedingung: RLS lässt A überhaupt lesen
--      02 liest den eigenen Entwurf (host_org_id = A)
--      03 liest den Entwurf von Partner B **nicht**            (gegen live: BUG)
--      04 sieht den Planungs-Slot auf B's Standbühne **nicht**  (gegen live: BUG)
--      05 sieht die Speaker von B's Entwurf **nicht**          (gegen live: BUG)
--      06 bekommt den Board-Kanal (Standbühne) — neues Prädikat
--   L  Stage Lead mit `speaker_manager` auf S1
--      07 liest den Entwurf auf der eigenen Bühne S1 — Vorbedingung
--      08 liest B's Entwurf **nicht**                           (gegen live: BUG)
--      09 sieht den eigenen Planungs-Slot, den auf S2 nicht     (gegen live: BUG)
--      10 sieht die Speaker der eigenen Bühne, die von B nicht  (gegen live: BUG)
--      11 das Board (`programme_board`, security_invoker) zeigt S1, nicht S2
--   I  Programm-Team (Scope Edition)
--      12 liest B's Entwurf und dessen Slot — intern bleibt alles sichtbar
--   P  Partner A nur als Kontakt der Organisation (`partner_contact`), ohne Standbühne
--      13 liest den eigenen Entwurf, nicht B's; kein Board-Kanal
--   S  Partner A nur mit Standbühnen-Rolle (Scope org A), **ohne** Kontaktrolle
--      15 liest den Entwurf seiner Organisation ohne Slot (Bindung über host_org_id)
--      16 liest die Session auf der eigenen Standbühne S3 und deren Slot (Bindung
--         über stage.partner_org_id), B's Entwurf und Slot nicht
--   14 EXECUTE für `authenticated` an allen Prädikaten, die die Policies aufrufen
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_day uuid; v_tag date;
  v_pa uuid; v_ua uuid; v_pl uuid; v_ul uuid; v_px uuid;
  v_org_a uuid; v_org_b uuid; v_s1 uuid; v_s2 uuid;
  v_sl1a uuid; v_sl1b uuid; v_sl2 uuid; v_s3 uuid; v_sl3 uuid; v_a_buehne uuid;
  v_pub uuid; v_a_entwurf uuid; v_b_entwurf uuid; v_l_entwurf uuid;
  b1 boolean; b2 boolean; b3 boolean; b4 boolean; b5 boolean; b6 boolean; b7 boolean;
  v_kanal text;
begin
  -- ---- Aufbau (Superuser)
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select d.id, d.day_date into v_day, v_tag from event_day d where d.event_id = v_ed order by d.day_date limit 1;
  select p.id, p.auth_user_id into v_pa, v_ua from person p where p.auth_user_id is not null order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pl, v_ul from person p where p.auth_user_id is not null and p.id <> v_pa order by p.created_at limit 1;
  select p.id into v_px from person p where p.id not in (v_pa, v_pl) order by p.created_at limit 1;
  delete from role_assignment where person_id in (v_pa, v_pl);

  insert into organization (legal_name, communication_name, type) values ('ZZ Test Partner A GmbH', 'ZZ Test A', 'corporate') returning id into v_org_a;
  insert into organization (legal_name, communication_name, type) values ('ZZ Test Partner B GmbH', 'ZZ Test B', 'corporate') returning id into v_org_b;
  insert into org_membership (org_id, person_id, roles) values (v_org_a, v_pa, array['primary_ops']);

  insert into stage (event_id, name, slug, type, active) values (v_ed, 'ZZ Test Bühne L', 'zz-test-lead', 'side', true) returning id into v_s1;
  insert into stage (event_id, name, slug, type, partner_org_id, active)
  values (v_ed, 'ZZ Test Standbühne B', 'zz-test-stand-b', 'partner_booth', v_org_b, true) returning id into v_s2;

  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_s1, v_day, v_tag + time '10:00', v_tag + time '10:30', 'content', 'open') returning id into v_sl1a;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_s1, v_day, v_tag + time '11:00', v_tag + time '11:30', 'content', 'confirmed') returning id into v_sl1b;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_s2, v_day, v_tag + time '10:00', v_tag + time '10:30', 'partner_block', 'open') returning id into v_sl2;
  insert into stage (event_id, name, slug, type, partner_org_id, active)
  values (v_ed, 'ZZ Test Standbühne A', 'zz-test-stand-a', 'partner_booth', v_org_a, true) returning id into v_s3;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_s3, v_day, v_tag + time '10:00', v_tag + time '10:20', 'content', 'open') returning id into v_sl3;

  -- Veröffentlichen verlangt Slot, beide Titel und eine Beschreibung (`session_publish_check`).
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, language, access_mode, publish_status)
  values (v_ed, v_sl1b, 'keynote', 'ZZ Test veröffentlicht', 'ZZ Test published', 'Testbeschreibung.', 'de', 'open', 'published')
  returning id into v_pub;
  insert into session (event_id, format, title_de, language, access_mode, publish_status, host_org_id)
  values (v_ed, 'masterclass', 'ZZ Test Entwurf A', 'de', 'application', 'draft', v_org_a) returning id into v_a_entwurf;
  insert into session (event_id, slot_id, format, title_de, language, access_mode, publish_status, host_org_id)
  values (v_ed, v_sl2, 'masterclass', 'ZZ Test Entwurf B', 'de', 'application', 'draft', v_org_b) returning id into v_b_entwurf;
  insert into session (event_id, slot_id, format, title_de, language, access_mode, publish_status)
  values (v_ed, v_sl1a, 'talk', 'ZZ Test Entwurf Bühne L', 'de', 'open', 'draft') returning id into v_l_entwurf;
  -- Ein Speaker-Slot auf A's Standbühne, ohne Organisation an der Session.
  insert into session (event_id, slot_id, format, title_de, language, access_mode, publish_status)
  values (v_ed, v_sl3, 'talk', 'ZZ Test Standbühne A Talk', 'de', 'open', 'draft') returning id into v_a_buehne;
  insert into session_speaker (session_id, person_id, role, confirmed) values (v_b_entwurf, v_px, 'speaker', true);
  insert into session_speaker (session_id, person_id, role, confirmed) values (v_l_entwurf, v_px, 'speaker', true);

  -- `partner_roles()` zählt die Mitgliedschaft nur mit `partner_contact` für die Organisation.
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pa, 'partner_contact', 'org', v_org_a);
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pa, 'standbuehne_editor', 'org', v_org_a);
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pl, 'speaker_manager', 'stage', v_s1);

  -- ---- A: Partner mit Standbühnen-Rolle
  perform set_config('request.jwt.claims', json_build_object('sub', v_ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  b1 := exists (select 1 from session where id = v_pub);
  b2 := exists (select 1 from session where id = v_a_entwurf);
  b3 := exists (select 1 from session where id = v_b_entwurf);
  b4 := exists (select 1 from slot where id = v_sl2);
  b5 := exists (select 1 from session_speaker where session_id = v_b_entwurf);
  begin
    execute 'select public.is_programme_board_user()::text' into v_kanal;
  exception when undefined_function then v_kanal := 'fehlt';
  end;
  execute 'reset role';
  insert into t_res values ('01_A_veroeffentlicht', case when b1 then 'ok' else 'FEHLER' end);
  insert into t_res values ('02_A_eigener_entwurf', case when b2 then 'ok' else 'FEHLER' end);
  insert into t_res values ('03_A_fremder_entwurf', case when not b3 then 'ok' else 'SICHTBAR (BUG)' end);
  insert into t_res values ('04_A_fremder_slot', case when not b4 then 'ok' else 'SICHTBAR (BUG)' end);
  insert into t_res values ('05_A_fremde_speaker', case when not b5 then 'ok' else 'SICHTBAR (BUG)' end);
  insert into t_res values ('06_A_boardkanal', case when v_kanal = 'true' then 'ok' else 'FEHLER ' || v_kanal end);

  -- ---- L: Stage Lead auf S1
  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  b1 := exists (select 1 from session where id = v_l_entwurf);
  b2 := exists (select 1 from session where id = v_b_entwurf);
  b3 := exists (select 1 from slot where id = v_sl1a);
  b4 := exists (select 1 from slot where id = v_sl2);
  b5 := exists (select 1 from session_speaker where session_id = v_l_entwurf);
  b6 := exists (select 1 from session_speaker where session_id = v_b_entwurf);
  b7 := exists (select 1 from programme_board where slot_id = v_sl1a)
        and not exists (select 1 from programme_board where slot_id = v_sl2);
  execute 'reset role';
  insert into t_res values ('07_L_eigene_buehne', case when b1 then 'ok' else 'FEHLER' end);
  insert into t_res values ('08_L_fremder_entwurf', case when not b2 then 'ok' else 'SICHTBAR (BUG)' end);
  insert into t_res values ('09_L_slots', case when b3 and not b4 then 'ok' else 'FEHLER eigen=' || b3 || ' fremd=' || b4 end);
  insert into t_res values ('10_L_speaker', case when b5 and not b6 then 'ok' else 'FEHLER eigen=' || b5 || ' fremd=' || b6 end);
  insert into t_res values ('11_L_board', case when b7 then 'ok' else 'FEHLER' end);

  -- ---- I: Programm-Team der Edition (A bekommt die Teamrolle statt der Standbühne)
  delete from role_assignment where person_id = v_pa;
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pa, 'programme_team', 'edition', v_ed);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  b1 := exists (select 1 from session where id = v_b_entwurf);
  b2 := exists (select 1 from slot where id = v_sl2);
  execute 'reset role';
  insert into t_res values ('12_I_intern_alles', case when b1 and b2 then 'ok' else 'FEHLER session=' || b1 || ' slot=' || b2 end);

  -- ---- P: Partner A nur als Kontakt der Organisation, ohne Standbühne
  delete from role_assignment where person_id = v_pa;
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pa, 'partner_contact', 'org', v_org_a);
  execute 'set local role authenticated';
  b1 := exists (select 1 from session where id = v_a_entwurf);
  b2 := exists (select 1 from session where id = v_b_entwurf);
  begin
    execute 'select public.is_programme_board_user()::text' into v_kanal;
  exception when undefined_function then v_kanal := 'fehlt';
  end;
  execute 'reset role';
  insert into t_res values ('13_P_nur_mitglied',
    case when b1 and not b2 and v_kanal = 'false' then 'ok'
         else 'FEHLER eigen=' || b1 || ' fremd=' || b2 || ' kanal=' || v_kanal end);

  -- ---- S: Partner A nur mit Standbühnen-Rolle, ohne Kontaktrolle
  delete from role_assignment where person_id = v_pa;
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pa, 'standbuehne_editor', 'org', v_org_a);
  execute 'set local role authenticated';
  b1 := exists (select 1 from session where id = v_a_entwurf);
  b2 := exists (select 1 from session where id = v_a_buehne);
  b3 := exists (select 1 from slot where id = v_sl3);
  b4 := exists (select 1 from session where id = v_b_entwurf);
  b5 := exists (select 1 from slot where id = v_sl2);
  execute 'reset role';
  insert into t_res values ('15_S_entwurf_der_org', case when b1 then 'ok' else 'FEHLER' end);
  insert into t_res values ('16_S_eigene_standbuehne',
    case when b2 and b3 and not b4 and not b5 then 'ok'
         else 'FEHLER session=' || b2 || ' slot=' || b3 || ' fremd=' || b4 || ' fremdslot=' || b5 end);

  -- ---- Rechte
  insert into t_res values ('14_grants',
    case when has_function_privilege('authenticated', 'can_edit_session(uuid)', 'execute')
          and has_function_privilege('authenticated', 'can_edit_slot(uuid)', 'execute')
          and has_function_privilege('authenticated', 'is_partner_of(uuid)', 'execute')
          and has_function_privilege('authenticated', 'is_session_visible(uuid)', 'execute')
          and case when to_regprocedure('is_standbuehne_editor_of(uuid)') is null then false
                   else has_function_privilege('authenticated', 'is_standbuehne_editor_of(uuid)', 'execute') end
          -- `case`, nicht `and`: gegen live fehlt die Funktion, und `and` wertet nicht
          -- sicher von links aus — has_function_privilege würfe dann.
          and case when to_regprocedure('is_programme_board_user()') is null then false
                   else has_function_privilege('authenticated', 'is_programme_board_user()', 'execute') end
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
