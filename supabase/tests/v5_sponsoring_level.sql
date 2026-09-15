-- Smoke-Test 0097 (Sponsoring-Level · Vokabular mit Rang, Logo-Pflicht). Belegt:
--   01 sponsoring_level_key normalisiert wie lib/sanity/mapping.ts (klein, `_`, Rand-`_` weg, leer/null ⇒ null);
--   02 der Export liefert Schlüssel und Rang aus dem Vokabular ('Premium' ⇒ premium/40);
--   03 ein unbekanntes Level kommt normalisiert ohne Rang; ohne Level sind beide null;
--   04 das Vokabular hat acht aktive Einträge mit eindeutigen Rängen;
--   05 sponsoring_level_key ist für authenticated gesperrt; der Export bleibt für Partner ohne Team-Rolle 42501;
--   06 die Pflicht logo_vector nennt die Transparenz in beiden Sprachen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_org2 uuid; v_org3 uuid;
        v_n integer; v_key text; v_rank integer; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid;
  select id into v_ed from event where is_edition and slug = 'fls27';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');

  -- 01 Schlüsselbildung
  insert into t_res values ('01_key',
    coalesce(sponsoring_level_key(' Start Up '), 'null') || ' ' || coalesce(sponsoring_level_key('Main Stage Loge'), 'null') || ' '
    || coalesce(sponsoring_level_key('Start-Up'), 'null') || ' ' || coalesce(sponsoring_level_key(''), 'null') || ' ' || coalesce(sponsoring_level_key(null), 'null')
    || case when sponsoring_level_key(' Start Up ') = 'start_up' and sponsoring_level_key('Main Stage Loge') = 'main_stage_loge'
                 and sponsoring_level_key('Start-Up') = 'start_up' and sponsoring_level_key('') is null and sponsoring_level_key(null) is null
            then ' (richtig)' else ' FALSCH' end);

  -- 02/03 drei Wegwerf-Organisationen: bekanntes Level, unbekanntes Level, kein Level
  insert into organization (legal_name, communication_name, type, website) values ('ZZ Rang Premium GmbH', 'ZZ Premium', 'corporate', 'p.example') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status, sponsoring_level) values (v_org, v_ed, 'filled', 'Premium');
  insert into organization (legal_name, type) values ('ZZ Rang Unbekannt GmbH', 'corporate') returning id into v_org2;
  insert into org_edition (org_id, edition_id, onboarding_status, sponsoring_level) values (v_org2, v_ed, 'filled', 'Sonder Stand');
  insert into organization (legal_name, type) values ('ZZ Rang Ohne GmbH', 'corporate') returning id into v_org3;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org3, v_ed, 'invited');

  select x.sponsoring_key, x.sponsoring_rank into v_key, v_rank from event_app_exhibitors(v_ed) x where x.org_id = v_org;
  insert into t_res values ('02_premium', case when v_key = 'premium' and v_rank = 40 then 'premium/40 (richtig)'
                                               else 'FALSCH ' || coalesce(v_key, 'null') || '/' || coalesce(v_rank::text, 'null') end);
  select x.sponsoring_key, x.sponsoring_rank into v_key, v_rank from event_app_exhibitors(v_ed) x where x.org_id = v_org2;
  insert into t_res values ('03a_unbekannt', case when v_key = 'sonder_stand' and v_rank is null then 'sonder_stand/null (richtig)'
                                                  else 'FALSCH ' || coalesce(v_key, 'null') || '/' || coalesce(v_rank::text, 'null') end);
  select x.sponsoring_key, x.sponsoring_rank into v_key, v_rank from event_app_exhibitors(v_ed) x where x.org_id = v_org3;
  insert into t_res values ('03b_ohne_level', case when v_key is null and v_rank is null then 'null/null (richtig)'
                                                   else 'FALSCH ' || coalesce(v_key, 'null') || '/' || coalesce(v_rank::text, 'null') end);

  -- 04 Vokabular
  select count(*), count(distinct sort_order) into v_n, v_rank from vocab_term where vocabulary = 'sponsoring_level' and active;
  insert into t_res values ('04_vokabular', case when v_n = 8 and v_rank = 8 then '8 Eintraege, 8 Raenge (richtig)' else 'FALSCH ' || v_n || '/' || v_rank end);

  -- 05 Rechte
  insert into t_res values ('05a_key_grant', 'authenticated_exec=' || has_function_privilege('authenticated', 'sponsoring_level_key(text)', 'execute')::text);
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  begin
    perform event_app_exhibitors(v_ed);
    insert into t_res values ('05b_partner_export', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05b_partner_export', 'abgewiesen ' || sqlstate); end;

  -- 06 Pflichttext
  select description_de || ' | ' || description_en into v_txt from deliverable_template where key = 'logo_vector';
  insert into t_res values ('06_pflicht_text', case when v_txt ilike '%transparentem hintergrund%' and v_txt ilike '%transparent background%'
                                                    then 'nennt Transparenz DE+EN (richtig)' else 'FEHLT: ' || left(v_txt, 160) end);
end $$;
select * from t_res order by step;
rollback;
