-- Test „Präsentationen ansehen und herunterladen“ (LEAD-060, **keine Migration**). Die Liste unter `/speaker-leads/praesentationen` (und im Admin unter Technik) signiert beim Klick
-- eine Adresse für die Datei im privaten Bucket `speaker-assets` — ob das klappt, entscheidet die Pfadregel `speaker_asset_path_allowed` (Policy auf `storage.objects`), und was die
-- Liste kennt (`storage_path`, `mime`, alle Fassungen), liefert `my_speaker_assets`. Mit echtem Rollenwechsel an Wegwerf-Konten (ZZ …, mit eigener `auth_user_id`; `current_person_id()`
-- kommt aus den JWT-Claims) und der Rolle `authenticated` direkt gegen den Bucket. Aufbau: Summit mit zwei Bühnen A und B, je ein Slot mit einer Session, Speaker SA auf A (Profil PA, zwei
-- Fassungen der Präsentation) und SB auf B (Profil PB, eine Fassung); L1 Stage Lead von A, L2 Stage Lead von B, T das Team (`area_lead_speaker`), E eine Fremde ohne Rolle. Alles wird
-- zurückgerollt; geurteilt wird nur über die selbst angelegten Objekte und Zeilen. Erwartung je Schritt als Muster in `t_erw`; `99_auswertung` am Ende.
--   01 L1 liest beide Fassungen von PA (Bühne A), nicht die Datei von PB;
--   02 L2 liest die Datei von PB, nicht die von PA — jeder Stage Lead nur die Dateien seiner Bühne;
--   03 die Speakerin SA liest ihre beiden Fassungen, nicht die von PB;
--   04 das Team liest alle drei; eine Fremde keine; `anon` nichts;
--   05 `my_speaker_assets` für L1: beide Fassungen von PA mit `storage_path` und `mime` (daraus baut die Liste „Ansehen“, „Herunterladen“ und „Frühere Fassungen“), keine von PB;
--      für L2 umgekehrt; für das Team alle drei;
--   06 die Rechnung (`invoice`) eines Speakers liest ein Stage Lead nicht (nur Speaker, Assistenz, Spesenprüfung) — die Regel, die für Präsentationen **nicht** gilt;
--   07 Form: die Pfadregel — `anon` ohne EXECUTE, `authenticated` ja, DEFINER, `search_path` gepinnt — und die Policy am Bucket nutzt sie.
-- Probelauf (`sh scripts/db.sh test supabase/tests/lead060_praesentationen_lesen.sql`, 10.10.2026): siehe README.
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('01_l1_buehne_a', '^ok pa=2 pb=0$'),
  ('02_l2_buehne_b', '^ok pa=0 pb=1$'),
  ('03_speakerin', '^ok pa=2 pb=0$'),
  ('04_team_fremde_anon', '^ok team=3 fremde=0 anon=0$'),
  ('05_my_speaker_assets', '^ok l1=2/2 l2=1/1 team=3$'),
  ('06_rechnung', '^ok l1=0 speakerin=1$'),
  ('07_form', '^ok anon=false auth=true definer=true pfad=true policy=true$');

-- Hilfen -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Eine Wegwerf-Person mit eigenem Konto (`person.auth_user_id` verweist auf `auth.users`).
create function pg_temp.person(p_name text) returns uuid language plpgsql as $$
declare v_u uuid := gen_random_uuid(); v_id uuid;
begin
  insert into auth.users (id, email, aud, role) values (v_u, lower(replace(p_name, ' ', '-')) || '@zzlead060.test', 'authenticated', 'authenticated');
  insert into person (first_name, last_name, preferred_language, auth_user_id) values ('Xaver', p_name, 'en', v_u) returning id into v_id;
  return v_id;
end $$;

-- Als diese Person handeln (JWT-Claims); ohne Person: ohne Anmeldung.
create function pg_temp.als(p_person uuid) returns void language plpgsql as $$
begin
  if p_person is null then
    perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', (select auth_user_id from person where id = p_person), 'role', 'authenticated')::text, true);
  end if;
end $$;

-- Wie viele der Objekte (nach Name) sieht diese Person im Bucket `speaker-assets` — mit den Rechten der Rolle `authenticated` (oder `anon`)? Zahl oder SQLSTATE.
create function pg_temp.sieht(p_person uuid, p_namen text[], p_rolle text default 'authenticated') returns text language plpgsql as $$
declare v_n bigint;
begin
  perform pg_temp.als(p_person);
  execute 'set local role ' || quote_ident(p_rolle);
  select count(*) into v_n from storage.objects where bucket_id = 'speaker-assets' and name = any (p_namen);
  execute 'reset role';
  return v_n::text;
exception when others then
  execute 'reset role';
  return sqlstate;
end $$;

-- Wie viele Zeilen und wie viele davon mit `storage_path` und `mime` liefert `my_speaker_assets()` dieser Person für die genannten Profile? `<Zeilen>/<vollständige>` oder SQLSTATE.
create function pg_temp.assets(p_person uuid, p_profile uuid[]) returns text language plpgsql as $$
declare v_n bigint; v_voll bigint;
begin
  perform pg_temp.als(p_person);
  select count(*), count(*) filter (where a.storage_path is not null and a.mime is not null) into v_n, v_voll
    from my_speaker_assets(null) a where a.profile_id = any (p_profile) and a.kind = 'presentation';
  return v_n || '/' || v_voll;
exception when others then
  return sqlstate;
end $$;

do $$
declare
  v_ed uuid; v_ev uuid; v_day uuid; v_sa uuid; v_sb uuid; v_sla uuid; v_slb uuid; v_sea uuid; v_seb uuid;
  v_l1 uuid; v_l2 uuid; v_t uuid; v_e uuid; v_psa uuid; v_psb uuid; v_pa uuid; v_pb uuid;
  v_pa1 text; v_pa2 text; v_pb1 text; v_rechnung text;
  v_a text; v_b text; v_c text; v_d text; v_n bigint; v_m bigint;
begin
  -- ---- Aufbau
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  if v_ed is null then raise exception 'VORBEDINGUNG: Edition fls27 fehlt'; end if;
  insert into event (name, format_tag, edition_id, slug, timezone) values ('ZZ Summit', 'summit', v_ed, 'zz-lead060-' || substr(md5(random()::text), 1, 8), 'Europe/Berlin') returning id into v_ev;
  insert into event_day (event_id, day_date) values (v_ev, current_date + 30) returning id into v_day;
  insert into stage (event_id, name, slug, room) values (v_ev, 'ZZ Bühne A', 'zz-a', 'Saal 1') returning id into v_sa;
  insert into stage (event_id, name, slug, room) values (v_ev, 'ZZ Bühne B', 'zz-b', 'Saal 2') returning id into v_sb;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (v_sa, v_day, now() + interval '30 days', now() + interval '30 days 30 minutes', 'content', 'open') returning id into v_sla;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (v_sb, v_day, now() + interval '30 days', now() + interval '30 days 30 minutes', 'content', 'open') returning id into v_slb;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, language, access_mode, publish_status)
    values (v_ev, v_sla, 'talk', 'ZZ Talk A', 'ZZ talk A', 'Beschreibung.', 'de', 'open', 'draft') returning id into v_sea;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, language, access_mode, publish_status)
    values (v_ev, v_slb, 'talk', 'ZZ Talk B', 'ZZ talk B', 'Beschreibung.', 'de', 'open', 'draft') returning id into v_seb;

  v_l1 := pg_temp.person('ZZ060 L1'); v_l2 := pg_temp.person('ZZ060 L2'); v_t := pg_temp.person('ZZ060 T'); v_e := pg_temp.person('ZZ060 E');
  v_psa := pg_temp.person('ZZ060 SA'); v_psb := pg_temp.person('ZZ060 SB');
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_l1, 'speaker_manager', 'stage', v_sa, v_ed);
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_l2, 'speaker_manager', 'stage', v_sb, v_ed);
  insert into role_assignment (person_id, role, scope_type) values (v_t, 'area_lead_speaker', 'global');
  insert into speaker_profile (person_id, edition_id, speaker_type) values (v_psa, v_ed, 'panelist') returning id into v_pa;
  insert into speaker_profile (person_id, edition_id, speaker_type) values (v_psb, v_ed, 'panelist') returning id into v_pb;
  insert into session_speaker (session_id, person_id, role, confirmed) values (v_sea, v_psa, 'speaker', true), (v_seb, v_psb, 'speaker', true);

  -- Dateien im Bucket und ihre Zeilen: PA hat zwei Fassungen (v1 abgelöst, v2 aktuell), PB eine; dazu eine Rechnung von PA.
  v_pa1 := v_ed::text || '/' || v_pa::text || '/presentation/zz-v1.pdf';
  v_pa2 := v_ed::text || '/' || v_pa::text || '/presentation/zz-v2.pdf';
  v_pb1 := v_ed::text || '/' || v_pb::text || '/presentation/zz-pb.pdf';
  v_rechnung := v_ed::text || '/' || v_pa::text || '/invoice/zz-rechnung.pdf';
  insert into storage.objects (bucket_id, name) values
    ('speaker-assets', v_pa1), ('speaker-assets', v_pa2), ('speaker-assets', v_pb1), ('speaker-assets', v_rechnung);
  insert into speaker_asset (profile_id, session_id, kind, storage_path, filename, mime, version, is_current) values
    (v_pa, v_sea, 'presentation', v_pa1, 'zz-v1.pdf', 'application/pdf', 1, false),
    (v_pa, v_sea, 'presentation', v_pa2, 'zz-v2.pdf', 'application/pdf', 2, true),
    (v_pb, v_seb, 'presentation', v_pb1, 'zz-pb.pdf', 'application/pdf', 1, true);

  -- ---- 01 L1: Bühne A
  v_a := pg_temp.sieht(v_l1, array[v_pa1, v_pa2]); v_b := pg_temp.sieht(v_l1, array[v_pb1]);
  insert into t_res values ('01_l1_buehne_a', case when v_a = '2' and v_b = '0' then format('ok pa=%s pb=%s', v_a, v_b) else format('FEHLER pa=%s pb=%s', v_a, v_b) end);

  -- ---- 02 L2: Bühne B
  v_a := pg_temp.sieht(v_l2, array[v_pa1, v_pa2]); v_b := pg_temp.sieht(v_l2, array[v_pb1]);
  insert into t_res values ('02_l2_buehne_b', case when v_a = '0' and v_b = '1' then format('ok pa=%s pb=%s', v_a, v_b) else format('FEHLER pa=%s pb=%s', v_a, v_b) end);

  -- ---- 03 die Speakerin
  v_a := pg_temp.sieht(v_psa, array[v_pa1, v_pa2]); v_b := pg_temp.sieht(v_psa, array[v_pb1]);
  insert into t_res values ('03_speakerin', case when v_a = '2' and v_b = '0' then format('ok pa=%s pb=%s', v_a, v_b) else format('FEHLER pa=%s pb=%s', v_a, v_b) end);

  -- ---- 04 Team, Fremde, anon
  v_a := pg_temp.sieht(v_t, array[v_pa1, v_pa2, v_pb1]);
  v_b := pg_temp.sieht(v_e, array[v_pa1, v_pa2, v_pb1]);
  v_c := pg_temp.sieht(null, array[v_pa1, v_pa2, v_pb1], 'anon');
  insert into t_res values ('04_team_fremde_anon',
    case when v_a = '3' and v_b = '0' and v_c in ('0', '42501') then format('ok team=%s fremde=%s anon=%s', v_a, v_b, case when v_c = '42501' then '0' else v_c end)
         else format('FEHLER team=%s fremde=%s anon=%s', v_a, v_b, v_c) end);

  -- ---- 05 my_speaker_assets: was die Liste kennt
  v_a := pg_temp.assets(v_l1, array[v_pa, v_pb]); v_b := pg_temp.assets(v_l2, array[v_pa, v_pb]); v_c := pg_temp.assets(v_t, array[v_pa, v_pb]);
  insert into t_res values ('05_my_speaker_assets',
    case when v_a = '2/2' and v_b = '1/1' and split_part(v_c, '/', 1) = '3' and split_part(v_c, '/', 2) = '3' then format('ok l1=%s l2=%s team=%s', v_a, v_b, split_part(v_c, '/', 1))
         else format('FEHLER l1=%s l2=%s team=%s', v_a, v_b, v_c) end);

  -- ---- 06 die Rechnung: nicht für den Stage Lead
  v_a := pg_temp.sieht(v_l1, array[v_rechnung]); v_b := pg_temp.sieht(v_psa, array[v_rechnung]);
  insert into t_res values ('06_rechnung', case when v_a = '0' and v_b = '1' then format('ok l1=%s speakerin=%s', v_a, v_b) else format('FEHLER l1=%s speakerin=%s', v_a, v_b) end);

  -- ---- 07 Form der Pfadregel
  select count(*) into v_n from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT' and qual like '%speaker_asset_path_allowed%' and qual like '%speaker-assets%';
  insert into t_res values ('07_form', case when v_n >= 1
    then 'ok anon=' || has_function_privilege('anon', 'speaker_asset_path_allowed(text)', 'execute')::text
      || ' auth=' || has_function_privilege('authenticated', 'speaker_asset_path_allowed(text)', 'execute')::text
      || ' definer=' || (select p.prosecdef from pg_proc p where p.oid = 'speaker_asset_path_allowed(text)'::regprocedure)::text
      || ' pfad=' || (select coalesce(p.proconfig::text, '') like '%search_path=%' from pg_proc p where p.oid = 'speaker_asset_path_allowed(text)'::regprocedure)::text
      || ' policy=true'
    else 'FEHLER keine Policy am Bucket speaker-assets, die speaker_asset_path_allowed nutzt' end);
end $$;

insert into t_res
select '99_auswertung',
       case when bool_and(erfuellt) then 'ALLE ERWARTUNGEN ERFÜLLT (' || count(*) || ')'
            else 'OFFEN: ' || string_agg(step, ', ') filter (where not erfuellt) end
  from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;

select * from t_res order by step;
rollback;
