-- Smoke-Test zum Vorschlag v6_speaker_mail_weiche (PART-091). Braucht
-- `v6_talk_speaker_zugang` (Partner-Chat, Spalte `speaker_profile.mail_via_contact_id`)
-- davor. Aufbau im Rollback: eine Test-Bühne am Summit, ein Slot morgen, eine
-- veröffentlichte Session darauf mit
--   A, B  Speaker, die der Partner verwaltet — beide über denselben Kontakt C (ein Panel)
--   P     Speaker mit eigenem Zugang
--   E     verwaltet, aber sein Kontakt D hat keinen Zugang — Rückfall auf E
-- T mit programme_team an der Edition, K mit marketing_team.
--
--   01 speaker_mail_recipient: A, B → C; P → P; E → E                    (gegen live: Funktion fehlt)
--   02 send_presentation_reminders: eine Mail an C, die A und B nennt; P und E je eine
--      ohne Zeile; A und B keine                                         (gegen live: an A und B)
--   03 register_session_asset (erstes Bühnenfoto): dasselbe für „Bühnenfotos bereit“
--   04 ticket_final_mail: für A an C mit dem Namen von A, für E an E ohne (gegen live: an A)
--   05 invite_speaker: A → P0001 speaker_managed_by_partner, P → Einladung an P
--   06 speaker_detail: A mit mail_via (Name von C, Zugang), P ohne     (gegen live: fehlt)
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_sum uuid; v_day uuid; v_s uuid; v_sl uuid; v_se uuid;
  v_pa uuid; v_pb uuid; v_pp uuid; v_pe uuid; v_pc uuid; v_pd uuid;
  v_spa uuid; v_spb uuid; v_spp uuid; v_spe uuid; v_ca uuid; v_cb uuid; v_ce uuid;
  v_pt uuid; v_ut uuid; v_pk uuid; v_uk uuid;
  v_t ticket; v_txt text; v_n int; v_mail bigint; v_j jsonb;
begin
  -- ---- Aufbau
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_sum from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  select d.id into v_day from event_day d where d.event_id = v_sum order by d.day_date limit 1;
  insert into stage (event_id, name, slug, type, active) values (v_sum, 'ZZ Test Weiche', 'zz-test-weiche', 'side', true) returning id into v_s;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_s, v_day, now() + interval '1 day', now() + interval '1 day 45 minutes', 'content', 'final') returning id into v_sl;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, language, access_mode, publish_status)
  values (v_sum, v_sl, 'panel', 'ZZ Test Weiche-Panel', 'ZZ Test switch panel', 'Beschreibung.', 'de', 'open', 'published') returning id into v_se;

  insert into person (first_name, last_name, preferred_language) values ('Anna', 'ZZWeiche A', 'de') returning id into v_pa;
  insert into person (first_name, last_name, preferred_language) values ('Bert', 'ZZWeiche B', 'de') returning id into v_pb;
  insert into person (first_name, last_name, preferred_language) values ('Paul', 'ZZWeiche P', 'de') returning id into v_pp;
  insert into person (first_name, last_name, preferred_language) values ('Emil', 'ZZWeiche E', 'de') returning id into v_pe;
  insert into person (first_name, last_name, preferred_language) values ('Clara', 'ZZWeiche Kontakt', 'de') returning id into v_pc;
  insert into person (first_name, last_name, preferred_language) values ('Dora', 'ZZWeiche Kontakt', 'de') returning id into v_pd;
  -- `queue_mail` schreibt nur an eine primäre Adresse.
  insert into person_email (person_id, email, is_primary) values
    (v_pa, 'zzweiche-a@example.org', true), (v_pb, 'zzweiche-b@example.org', true),
    (v_pp, 'zzweiche-p@example.org', true), (v_pe, 'zzweiche-e@example.org', true),
    (v_pc, 'zzweiche-c@example.org', true), (v_pd, 'zzweiche-d@example.org', true);
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (v_pa, v_ed, 'panelist', 'confirmed', now()) returning id into v_spa;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (v_pb, v_ed, 'panelist', 'confirmed', now()) returning id into v_spb;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (v_pp, v_ed, 'panelist', 'confirmed', now()) returning id into v_spp;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (v_pe, v_ed, 'panelist', 'confirmed', now()) returning id into v_spe;

  -- Kontakte: C verwaltet A und B (mit Zugang), D ist Kontakt von E ohne Zugang.
  insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, has_access, consent_at)
  values (v_spa, 'assistant', v_pc, 'Clara', 'ZZWeiche Kontakt', 'zzweiche-c@example.org', true, current_date) returning id into v_ca;
  insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, has_access, consent_at)
  values (v_spb, 'assistant', v_pc, 'Clara', 'ZZWeiche Kontakt', 'zzweiche-c@example.org', true, current_date) returning id into v_cb;
  insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, has_access, consent_at)
  values (v_spe, 'assistant', v_pd, 'Dora', 'ZZWeiche Kontakt', 'zzweiche-d@example.org', false, current_date) returning id into v_ce;
  update speaker_profile set mail_via_contact_id = v_ca where id = v_spa;
  update speaker_profile set mail_via_contact_id = v_cb where id = v_spb;
  update speaker_profile set mail_via_contact_id = v_ce where id = v_spe;

  insert into session_speaker (session_id, person_id, role, confirmed) values
    (v_se, v_pa, 'speaker', true), (v_se, v_pb, 'speaker', true),
    (v_se, v_pp, 'speaker', true), (v_se, v_pe, 'speaker', true);

  select p.id, p.auth_user_id into v_pt, v_ut from person p where p.auth_user_id is not null order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pk, v_uk from person p where p.auth_user_id is not null and p.id <> v_pt order by p.created_at limit 1;
  delete from role_assignment where person_id in (v_pt, v_pk);
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pt, 'programme_team', 'edition', v_ed);
  insert into role_assignment (person_id, role, scope_type) values (v_pk, 'marketing_team', 'global');

  -- ---- 01 Empfänger
  begin
    execute 'select array[speaker_mail_recipient($1), speaker_mail_recipient($2), speaker_mail_recipient($3), speaker_mail_recipient($4)]::text'
      into v_txt using v_spa, v_spb, v_spp, v_spe;
    v_txt := case when v_txt = array[v_pc, v_pc, v_pp, v_pe]::text then 'ok' else 'FEHLER ' || v_txt end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  insert into t_res values ('01_empfaenger', v_txt);

  -- ---- 02 Präsentations-Erinnerung (als Server, ohne Konto)
  perform set_config('request.jwt.claims', null, true);
  begin
    perform send_presentation_reminders();
    select count(*) filter (where m.person_id = v_pc and m.meta->'vars'->>'on_behalf_of' = 'Anna ZZWeiche A, Bert ZZWeiche B')
           * 1000
         + count(*) filter (where m.person_id = v_pp and not (m.meta->'vars' ? 'on_behalf_of')) * 100
         + count(*) filter (where m.person_id = v_pe and not (m.meta->'vars' ? 'on_behalf_of')) * 10
         + count(*) filter (where m.person_id in (v_pa, v_pb, v_pd))
      into v_n from mail_log m
     where m.template_key = 'presentation_reminder' and m.related_type = 'session' and m.related_id = v_se;
    v_txt := case when v_n = 1110 then 'ok' else 'FEHLER Muster ' || v_n || ' (C·1000 + P·100 + E·10 + A/B/D)' end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  insert into t_res values ('02_erinnerung_ein_mal_an_den_kontakt', v_txt);

  -- ---- 03 K: erstes Bühnenfoto
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
  if v_txt = 'ok' then
    select count(*) filter (where m.person_id = v_pc and m.meta->'vars'->>'on_behalf_of' = 'Anna ZZWeiche A, Bert ZZWeiche B')
           * 1000
         + count(*) filter (where m.person_id = v_pp and not (m.meta->'vars' ? 'on_behalf_of')) * 100
         + count(*) filter (where m.person_id = v_pe and not (m.meta->'vars' ? 'on_behalf_of')) * 10
         + count(*) filter (where m.person_id in (v_pa, v_pb, v_pd))
      into v_n from mail_log m
     where m.template_key = 'stage_photos_ready' and m.related_type = 'session' and m.related_id = v_se;
    v_txt := case when v_n = 1110 then 'ok' else 'FEHLER Muster ' || v_n || ' (C·1000 + P·100 + E·10 + A/B/D)' end;
  end if;
  insert into t_res values ('03_fotomail_ein_mal_an_den_kontakt', v_txt);

  -- ---- 04 Ticket-Mail über die Weiche (Einzelmail)
  begin
    v_t.id := gen_random_uuid(); v_t.speaker_profile_id := v_spa; v_t.source := 'speaker';
    v_t.holder_first_name := 'Anna'; v_t.holder_last_name := 'ZZWeiche A';
    perform ticket_final_mail(v_t);
    select count(*) into v_n from mail_log m
     where m.template_key = 'ticket_final' and m.related_id = v_t.id and m.person_id = v_pc
       and m.meta->'vars'->>'on_behalf_of' = 'Anna ZZWeiche A';
    v_txt := case when v_n = 1 then 'ok' else 'FEHLER A: an C mit Namen=' || v_n end;
    v_t.id := gen_random_uuid(); v_t.speaker_profile_id := v_spe;
    perform ticket_final_mail(v_t);
    select count(*) into v_n from mail_log m
     where m.template_key = 'ticket_final' and m.related_id = v_t.id and m.person_id = v_pe
       and not (m.meta->'vars' ? 'on_behalf_of');
    if v_txt = 'ok' and v_n <> 1 then v_txt := 'FEHLER E: Rückfall=' || v_n; end if;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  insert into t_res values ('04_einzelmail_ueber_die_weiche', v_txt);

  -- ---- 05 T: Einladung
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform invite_speaker(v_spa);
    v_txt := 'FEHLER A eingeladen';
  exception when others then
    v_txt := case when sqlstate = 'P0001' and sqlerrm = 'speaker_managed_by_partner' then 'ok'
                  else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
  end;
  if v_txt = 'ok' then
    begin
      v_mail := invite_speaker(v_spp);
      v_txt := case when v_mail is not null then 'ok' else 'FEHLER P ohne Mail' end;
    exception when others then v_txt := 'FEHLER P ' || sqlstate || ' ' || sqlerrm;
    end;
  end if;
  execute 'reset role';
  insert into t_res values ('05_einladung_bleibt_persoenlich', v_txt);

  -- ---- 06 T: Admin-Detail
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    v_j := speaker_detail(v_spa);
    v_txt := case when v_j->'mail_via'->>'name' = 'Clara ZZWeiche Kontakt' and (v_j->'mail_via'->>'has_access')::boolean
                  then 'ok' else 'FEHLER A ' || coalesce(v_j->>'mail_via', 'null') end;
    v_j := speaker_detail(v_spp);
    if v_txt = 'ok' and jsonb_typeof(v_j->'mail_via') is distinct from 'null' then
      v_txt := 'FEHLER P ' || coalesce(v_j->>'mail_via', 'fehlt');
    end if;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('06_detail_zeigt_den_weg', v_txt);
end $$;
select * from t_res order by step;
rollback;
