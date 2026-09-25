-- Smoke-Test zum Vorschlag v6_session_verantwortliche (ADM-018). Aufbau im
-- Rollback: am Summit Bühne A mit drei Slots (Tag 1, Tag 2, Tag 1 mit eigenem
-- Slot-Lead) und Bühne B mit einem Slot, je eine Entwurfs-Session.
-- Leads: LS (Bühne A), L1 (Bühnentag A/Tag 1, Live-Konto), L2 (A/Tag 2), L3
-- (Slot 3), LB (Bühne B), LE (Bühne A, abgelaufen). X ist kein Lead. T hat
-- programme_team (Programmleitung), K keine Rolle. T, L1 und K sind
-- Live-Konten; geurteilt wird nur über die selbst angelegten Personen und
-- Sessions (Live-Konten können weitere Rollen haben).
--
--   01 session_responsibles als T: engste Stufe gewinnt — S1 → L1 (Tag vor Bühne),
--      S2 → L2, S3 → L3 (Slot vor Tag), SB → LB; LE nirgends; keine Übersteuerung
--                                                             (gegen live: Funktion fehlt)
--   02 set_session_owner als T: S1 auf L2 → Übersteuerung mit Namen, Ableitung bleibt,
--      Audit-Eintrag; zurück auf null → wieder abgeleitet
--   03 nur Stage Leads der Veranstaltung: X → 22023 owner_not_lead, LE (abgelaufen) ebenso
--   04 K ohne Rolle: Lesen, Auswahl und Setzen → 42501
--   05 L1 (Tag-Lead A/Tag 1): sieht S1 und S3 (beide an seinem Tag — `can_edit_slot`;
--      abgeleitet bleibt für S3 trotzdem L3), nicht S2 und nicht SB; Setzen → 42501
--   06 session_owner_candidates als T: LS, L1, L2, L3, LB — nicht X, nicht LE
--   07 direkt `update session set owner_person_id` als T → 42501 (nur über die RPC)
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_sum uuid; v_d1 uuid; v_d2 uuid; v_a uuid; v_b uuid; v_sd1 uuid; v_sd2 uuid;
  v_sl1 uuid; v_sl2 uuid; v_sl3 uuid; v_slb uuid; v_s1 uuid; v_s2 uuid; v_s3 uuid; v_sb uuid;
  v_ls uuid; v_l2 uuid; v_l3 uuid; v_lb uuid; v_le uuid; v_x uuid;
  v_pt uuid; v_ut uuid; v_l1 uuid; v_u1 uuid; v_pk uuid; v_uk uuid;
  v_txt text; v_ok boolean; v_n int; v_m int; v_st1 text; v_st2 text; v_st3 text; v_name text; v_ids uuid[];
begin
  -- ---- Aufbau
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_sum from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  select d.id into v_d1 from event_day d where d.event_id = v_sum order by d.day_date limit 1;
  select d.id into v_d2 from event_day d where d.event_id = v_sum order by d.day_date offset 1 limit 1;
  insert into stage (event_id, name, slug, type, active) values (v_sum, 'ZZ ADM018 A', 'zz-adm018-a', 'side', true) returning id into v_a;
  insert into stage (event_id, name, slug, type, active) values (v_sum, 'ZZ ADM018 B', 'zz-adm018-b', 'side', true) returning id into v_b;
  insert into stage_day (stage_id, event_day_id) values (v_a, v_d1) returning id into v_sd1;
  insert into stage_day (stage_id, event_day_id) values (v_a, v_d2) returning id into v_sd2;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_a, v_d1, now() + interval '1 day', now() + interval '1 day 30 minutes', 'content', 'open') returning id into v_sl1;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_a, v_d2, now() + interval '2 days', now() + interval '2 days 30 minutes', 'content', 'open') returning id into v_sl2;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_a, v_d1, now() + interval '1 day 1 hour', now() + interval '1 day 90 minutes', 'content', 'open') returning id into v_sl3;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_b, v_d1, now() + interval '1 day', now() + interval '1 day 30 minutes', 'content', 'open') returning id into v_slb;
  insert into session (event_id, slot_id, format, title_de, title_en, language, access_mode, publish_status) values
    (v_sum, v_sl1, 'talk', 'ZZ ADM018 S1', 'ZZ ADM018 S1', 'de', 'open', 'draft') returning id into v_s1;
  insert into session (event_id, slot_id, format, title_de, title_en, language, access_mode, publish_status) values
    (v_sum, v_sl2, 'talk', 'ZZ ADM018 S2', 'ZZ ADM018 S2', 'de', 'open', 'draft') returning id into v_s2;
  insert into session (event_id, slot_id, format, title_de, title_en, language, access_mode, publish_status) values
    (v_sum, v_sl3, 'talk', 'ZZ ADM018 S3', 'ZZ ADM018 S3', 'de', 'open', 'draft') returning id into v_s3;
  insert into session (event_id, slot_id, format, title_de, title_en, language, access_mode, publish_status) values
    (v_sum, v_slb, 'talk', 'ZZ ADM018 SB', 'ZZ ADM018 SB', 'de', 'open', 'draft') returning id into v_sb;

  insert into person (first_name, last_name, preferred_language) values ('Lea', 'ZZADM018 Buehne', 'de') returning id into v_ls;
  insert into person (first_name, last_name, preferred_language) values ('Lou', 'ZZADM018 Tag2', 'de') returning id into v_l2;
  insert into person (first_name, last_name, preferred_language) values ('Lia', 'ZZADM018 Slot', 'de') returning id into v_l3;
  insert into person (first_name, last_name, preferred_language) values ('Leo', 'ZZADM018 BuehneB', 'de') returning id into v_lb;
  insert into person (first_name, last_name, preferred_language) values ('Len', 'ZZADM018 Alt', 'de') returning id into v_le;
  insert into person (first_name, last_name, preferred_language) values ('Xen', 'ZZADM018 Kein', 'de') returning id into v_x;

  select p.id, p.auth_user_id into v_pt, v_ut from person p where p.auth_user_id is not null order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_l1, v_u1 from person p where p.auth_user_id is not null and p.id <> v_pt order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pk, v_uk from person p where p.auth_user_id is not null and p.id not in (v_pt, v_l1) order by p.created_at limit 1;
  delete from role_assignment where person_id in (v_pt, v_l1, v_pk);
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pt, 'programme_team', 'edition', v_ed);
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values
    (v_ls, 'speaker_manager', 'stage', v_a, v_ed),
    (v_l1, 'speaker_manager', 'stage_day', v_sd1, v_ed),
    (v_l2, 'speaker_manager', 'stage_day', v_sd2, v_ed),
    (v_l3, 'speaker_manager', 'slot', v_sl3, v_ed),
    (v_lb, 'speaker_manager', 'stage', v_b, v_ed);
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from, valid_to) values
    (v_le, 'speaker_manager', 'stage', v_a, v_ed, now() - interval '30 days', now() - interval '1 day');

  -- ---- 01 Ableitung als Programmleitung
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute $q$select bool_and(case r.session_id
                 when $2 then r.derived_person_ids = array[$6]::uuid[]
                 when $3 then r.derived_person_ids = array[$7]::uuid[]
                 when $4 then r.derived_person_ids = array[$8]::uuid[]
                 when $5 then r.derived_person_ids = array[$9]::uuid[] end
               and r.owner_person_id is null and not ($10 = any(r.derived_person_ids))), count(*)
               from session_responsibles($1) r where r.session_id in ($2, $3, $4, $5)$q$
      into v_ok, v_n using v_sum, v_s1, v_s2, v_s3, v_sb, v_l1, v_l2, v_l3, v_lb, v_le;
    v_txt := case when v_ok and v_n = 4 then 'ok' else 'FEHLER passend=' || coalesce(v_ok::text, '?') || ' zeilen=' || v_n end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('01_engste_stufe_gewinnt', v_txt);

  -- ---- 02 Übersteuern und zurück
  v_txt := null;
  execute 'set local role authenticated';
  begin
    execute 'select set_session_owner($1, $2)' using v_s1, v_l2;
    execute 'select r.owner_name, r.derived_person_ids from session_responsibles($1) r where r.session_id = $2'
      into v_name, v_ids using v_sum, v_s1;
    execute 'select set_session_owner($1, null)' using v_s1;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  select count(*) into v_m from audit_log a
   where a.action = 'session.owner' and a.object_id = v_s1::text and a.actor_person_id = v_pt;
  -- Dynamisch: gegen live fehlt die Spalte, der Schritt soll trotzdem einzeln ausfallen.
  begin
    execute 'select count(*) from session se where se.id = $1 and se.owner_person_id is null' into v_n using v_s1;
  exception when others then v_n := null;
  end;
  insert into t_res values ('02_uebersteuern_und_zurueck',
    coalesce(v_txt, case when v_name = 'Lou ZZADM018 Tag2' and v_ids = array[v_l1] and v_m = 2 and v_n = 1 then 'ok'
                         else 'FEHLER name=' || coalesce(v_name, '?') || ' audit=' || v_m || ' zurueck=' || v_n end));

  -- ---- 03 Nur Stage Leads der Veranstaltung
  execute 'set local role authenticated';
  begin
    execute 'select set_session_owner($1, $2)' using v_s1, v_x;
    v_st1 := 'kein Fehler';
  exception when others then v_st1 := sqlstate || ' ' || sqlerrm;
  end;
  begin
    execute 'select set_session_owner($1, $2)' using v_s1, v_le;
    v_st2 := 'kein Fehler';
  exception when others then v_st2 := sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('03_nur_leads_der_veranstaltung',
    case when v_st1 = '22023 owner_not_lead' and v_st2 = '22023 owner_not_lead' then 'ok'
         else 'FEHLER X=' || v_st1 || ' abgelaufen=' || v_st2 end);

  -- ---- 04 Ohne Rolle
  perform set_config('request.jwt.claims', json_build_object('sub', v_uk, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform 1 from session_responsibles(v_sum);
    v_st1 := 'kein Fehler';
  exception when others then v_st1 := sqlstate;
  end;
  begin
    perform 1 from session_owner_candidates(v_sum);
    v_st2 := 'kein Fehler';
  exception when others then v_st2 := sqlstate;
  end;
  begin
    perform set_session_owner(v_s1, v_l1);
    v_st3 := 'kein Fehler';
  exception when others then v_st3 := sqlstate;
  end;
  execute 'reset role';
  insert into t_res values ('04_ohne_rolle_gesperrt',
    case when v_st1 = '42501' and v_st2 = '42501' and v_st3 = '42501' then 'ok'
         else 'FEHLER lesen=' || v_st1 || ' auswahl=' || v_st2 || ' setzen=' || v_st3 end);

  -- ---- 05 Tag-Lead sieht nur die eigenen Slots und setzt nichts
  v_txt := null;
  perform set_config('request.jwt.claims', json_build_object('sub', v_u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select count(*) filter (where r.session_id in ($2, $3)), count(*) filter (where r.session_id in ($4, $5)) from session_responsibles($1) r'
      into v_n, v_m using v_sum, v_s1, v_s3, v_s2, v_sb;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  begin
    perform set_session_owner(v_s1, v_l1);
    v_st1 := 'kein Fehler';
  exception when others then v_st1 := sqlstate;
  end;
  execute 'reset role';
  insert into t_res values ('05_tag_lead_nur_eigenes',
    coalesce(v_txt, case when v_n = 2 and v_m = 0 and v_st1 = '42501' then 'ok'
                         else 'FEHLER eigen=' || v_n || ' fremd=' || v_m || ' setzen=' || v_st1 end));

  -- ---- 06 Auswahl für die Übersteuerung
  v_txt := null;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select count(*) filter (where c.person_id in ($2, $3, $4, $5, $6)), count(*) filter (where c.person_id in ($7, $8)) from session_owner_candidates($1) c'
      into v_n, v_m using v_sum, v_ls, v_l1, v_l2, v_l3, v_lb, v_x, v_le;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  -- ---- 07 Direkt schreiben geht nicht
  begin
    execute 'update session set owner_person_id = $1 where id = $2' using v_l2, v_s1;
    v_st1 := 'kein Fehler';
  exception when others then v_st1 := sqlstate;
  end;
  execute 'reset role';
  insert into t_res values ('06_auswahl_nur_aktive_leads',
    coalesce(v_txt, case when v_n = 5 and v_m = 0 then 'ok' else 'FEHLER leads=' || v_n || ' fremde=' || v_m end));
  insert into t_res values ('07_nur_ueber_die_rpc', case when v_st1 = '42501' then 'ok' else 'FEHLER ' || v_st1 end);
end $$;
select * from t_res order by step;
rollback;
