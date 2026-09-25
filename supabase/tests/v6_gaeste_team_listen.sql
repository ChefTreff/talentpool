-- Smoke-Test zum Vorschlag v6_gaeste_team_listen (SPK-070). Aufbau im Rollback:
-- eine Test-Bühne am Summit, ein Slot morgen, eine veröffentlichte Session darauf
-- mit drei Beteiligten:
--   P  regulärer Speaker (Profil, bestätigt)
--   G  Gast des Partners (Profil mit stage_guest, bestätigt, ohne Owner)
--   M  Moderation ohne Speaker-Profil (LEAD-042)
-- T mit programme_team an der Edition liest die Listen; K mit marketing_team lädt
-- das erste Bühnenfoto.
--
--   01 manager_speakers und speaker_detail: G mit stage_guest = true, P mit false;
--      internal_notes und next_task bleiben Spalten              (gegen live: Spalte fehlt)
--   02 unassigned_speakers: G fehlt, ein Profil ohne Owner (P) steht drin (gegen live: G drin)
--   03 send_presentation_reminders: Mail an P, keine an G             (gegen live: auch an G)
--   04 register_session_asset (erstes Bühnenfoto): Mail an P, keine an G, keine an M
--                                                                     (gegen live: an alle drei)
--   05 speaker_leads_admin: T betreut P und G — gezählt wird nur P     (gegen live: beide)
--   06 speaker_travel_list: P steht in der Anreise, G nicht            (gegen live: G drin)
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_sum uuid; v_day uuid; v_s uuid; v_sl uuid; v_se uuid; v_org uuid;
  v_pp uuid; v_pg uuid; v_pm uuid; v_spp uuid; v_spg uuid;
  v_pt uuid; v_ut uuid; v_pk uuid; v_uk uuid;
  v_r record; v_txt text; v_n int; v_p int; v_g int; v_m int; v_s0 int; v_c0 int;
begin
  -- ---- Aufbau
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_sum from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  select d.id into v_day from event_day d where d.event_id = v_sum order by d.day_date limit 1;
  select o.id into v_org from organization o order by o.created_at limit 1;
  insert into stage (event_id, name, slug, type, active) values (v_sum, 'ZZ Test Gäste', 'zz-test-gaeste', 'side', true) returning id into v_s;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_s, v_day, now() + interval '1 day', now() + interval '1 day 30 minutes', 'content', 'final') returning id into v_sl;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, language, access_mode, publish_status)
  values (v_sum, v_sl, 'panel', 'ZZ Test Gäste-Panel', 'ZZ Test guest panel', 'Beschreibung.', 'de', 'open', 'published') returning id into v_se;

  -- Wegwerf-Personen; die primäre E-Mail prüft der Trigger erst beim Commit.
  insert into person (first_name, last_name, preferred_language) values ('Paula', 'ZZGast Speaker', 'de') returning id into v_pp;
  insert into person (first_name, last_name, preferred_language) values ('Gero', 'ZZGast Gast', 'de') returning id into v_pg;
  insert into person (first_name, last_name, preferred_language) values ('Mona', 'ZZGast Moderation', 'de') returning id into v_pm;
  -- `queue_mail` schreibt nur an eine primäre Adresse — ohne sie gäbe es für
  -- niemanden eine Mail, und 03/04 belegten nichts.
  insert into person_email (person_id, email, is_primary) values
    (v_pp, 'zzgast-speaker@example.org', true),
    (v_pg, 'zzgast-gast@example.org', true),
    (v_pm, 'zzgast-moderation@example.org', true);
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (v_pp, v_ed, 'panelist', 'confirmed', now()) returning id into v_spp;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, stage_guest,
                               stage_guest_consent_at, created_by_org_id, lounge_access, reception_eligible,
                               travel_costs_covered, hospitality_status)
  values (v_pg, v_ed, 'panelist', 'confirmed', now(), true, now(), v_org, false, false, false, 'none') returning id into v_spg;
  insert into session_speaker (session_id, person_id, role, confirmed) values
    (v_se, v_pp, 'speaker', true), (v_se, v_pg, 'speaker', true), (v_se, v_pm, 'moderator', true);

  select p.id, p.auth_user_id into v_pt, v_ut from person p where p.auth_user_id is not null order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pk, v_uk from person p where p.auth_user_id is not null and p.id <> v_pt order by p.created_at limit 1;
  delete from role_assignment where person_id in (v_pt, v_pk);
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pt, 'programme_team', 'edition', v_ed);
  insert into role_assignment (person_id, role, scope_type) values (v_pk, 'marketing_team', 'global');

  -- ---- T: Listen
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute $q$select bool_or(m.stage_guest) filter (where m.id = $1), bool_or(m.stage_guest) filter (where m.id = $2)
                 from manager_speakers($3) m$q$
      into v_r using v_spg, v_spp, v_ed;
    v_txt := case when v_r.bool_or is true then 'ok' else 'FEHLER' end;
    execute 'select count(*) from manager_speakers($1) m where m.id = $2 and m.stage_guest is false' into v_n using v_ed, v_spp;
    v_txt := case when v_txt = 'ok' and v_n = 1 then 'ok' else 'FEHLER gast/speaker' end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  -- speaker_detail trägt dasselbe Kennzeichen.
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    if not coalesce((speaker_detail(v_spg)->>'stage_guest')::boolean, false)
       or coalesce((speaker_detail(v_spp)->>'stage_guest')::boolean, true) then
      v_txt := 'FEHLER detail';
    end if;
  exception when others then v_txt := 'FEHLER detail ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('01_manager_speakers_kennzeichnet',
    case when v_txt <> 'ok' then v_txt
         when pg_get_function_result('manager_speakers(uuid)'::regprocedure) like '%internal_notes text%'
          and pg_get_function_result('manager_speakers(uuid)'::regprocedure) like '%next_task jsonb%' then 'ok'
         else 'FEHLER alte Spalten' end);

  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) filter (where u.profile_id = v_spg), count(*) filter (where u.profile_id = v_spp)
      into v_g, v_p from unassigned_speakers(v_ed) u;
    v_txt := case when v_g = 0 and v_p = 1 then 'ok' else 'FEHLER gast=' || v_g || ' speaker=' || v_p end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('02_ohne_betreuung_ohne_gaeste', v_txt);

  -- ---- Präsentations-Erinnerung (als Server, ohne Konto)
  perform set_config('request.jwt.claims', null, true);
  begin
    perform send_presentation_reminders();
    select count(*) filter (where m.person_id = v_pp), count(*) filter (where m.person_id = v_pg)
      into v_p, v_g from mail_log m
     where m.template_key = 'presentation_reminder' and m.related_type = 'session' and m.related_id = v_se;
    v_txt := case when v_p = 1 and v_g = 0 then 'ok' else 'FEHLER speaker=' || v_p || ' gast=' || v_g end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  insert into t_res values ('03_erinnerung_nicht_an_gaeste', v_txt);

  -- ---- K: erstes Bühnenfoto
  perform set_config('request.jwt.claims', json_build_object('sub', v_uk, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform register_session_asset(jsonb_build_object('session_id', v_se, 'kind', 'stage_photo',
                                                      'storage_path', v_se::text || '/stage_photo/zz-test.jpg',
                                                      'filename', 'zz-test.jpg'));
    v_txt := 'ok';
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  select count(*) filter (where m.person_id = v_pp), count(*) filter (where m.person_id = v_pg),
         count(*) filter (where m.person_id = v_pm)
    into v_p, v_g, v_m from mail_log m
   where m.template_key = 'stage_photos_ready' and m.related_type = 'session' and m.related_id = v_se;
  insert into t_res values ('04_fotomail_nur_an_speaker',
    case when v_txt <> 'ok' then v_txt
         when v_p = 1 and v_g = 0 and v_m = 0 then 'ok'
         else 'FEHLER speaker=' || v_p || ' gast=' || v_g || ' moderation=' || v_m end);

  -- ---- T als Lead: übernimmt P und G. Gezählt wird gegen den Stand vorher —
  -- T kann live schon Speaker betreuen.
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pt, 'speaker_manager', 'edition', v_ed);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select l.speakers, l.confirmed into v_s0, v_c0 from speaker_leads_admin(v_ed) l where l.person_id = v_pt;
    v_txt := case when v_s0 is null then 'FEHLER T fehlt in der Liste' else 'ok' end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  update speaker_profile set owner_person_id = v_pt where id in (v_spp, v_spg);
  if v_txt = 'ok' then
    perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      select l.speakers, l.confirmed into v_p, v_g from speaker_leads_admin(v_ed) l where l.person_id = v_pt;
      v_txt := case when v_p = v_s0 + 1 and v_g = v_c0 + 1 then 'ok'
                    else 'FEHLER speakers +' || (v_p - v_s0) || ' confirmed +' || (v_g - v_c0) end;
    exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
    end;
    execute 'reset role';
  end if;
  insert into t_res values ('05_leads_zaehlen_keine_gaeste', v_txt);

  -- ---- T: Anreise
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) filter (where l.profile_id = v_spp), count(*) filter (where l.profile_id = v_spg)
      into v_p, v_g from speaker_travel_list(v_ed) l;
    v_txt := case when v_p = 1 and v_g = 0 then 'ok' else 'FEHLER speaker=' || v_p || ' gast=' || v_g end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('06_anreise_ohne_gaeste', v_txt);
end $$;
select * from t_res order by step;
rollback;
