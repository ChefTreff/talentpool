-- Test zu `v6_logokategorie` (ADM-046). Belegt:
--   01 ohne Abschnitt logoWall: set_logo_category 42501 (Teamrolle ohne Abschnitt);
--   02 Auffangsatz: Partner ohne Stufe und ohne Feld ⇒ official (fallback),
--      Swapcard official_partner — niemand fällt heraus;
--   03 aus der Stufe: HubSpot-Freitext „Signature" ⇒ presenting (level),
--      Swapcard presenting_partner;
--   04 Feld schlägt Stufe: small ⇒ small (manual), Swapcard official_partner;
--      die Foto-Wand zeigt dieselbe Kategorie;
--   05 unbekannte Kategorie: invalid_category; leeren ⇒ zurück zur Stufe;
--   06 Audit trägt alt und neu;
--   07 jede Zeile der Ausstellerliste hat eine Kategorie (auch im Bestand).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_ed uuid; v_o1 uuid; v_o2 uuid; v_oe1 uuid; v_oe2 uuid;
  v_txt text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select id into v_ed from event where is_edition order by start_date desc limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'talent_team', 'global');

  insert into organization (legal_name) values ('ZZTEST Logo ohne Stufe GmbH') returning id into v_o1;
  insert into organization (legal_name) values ('ZZTEST Logo Signature GmbH') returning id into v_o2;
  insert into org_edition (org_id, edition_id) values (v_o1, v_ed) returning id into v_oe1;
  insert into org_edition (org_id, edition_id, sponsoring_level) values (v_o2, v_ed, 'Signature') returning id into v_oe2;

  -- 01
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform set_logo_category(v_oe1, 'small'); v_txt := 'ERLAUBT'; exception when sqlstate '42501' then v_txt := '42501'; end;
  insert into t_res values ('01_ohne_abschnitt', v_txt || ' (erwartet 42501)');

  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 02
  select x.logo_category || '/' || x.logo_category_source || '/' || x.sponsor_category into v_txt
    from event_app_exhibitors(v_ed) x where x.org_edition_id = v_oe1;
  insert into t_res values ('02_auffangsatz', coalesce(v_txt, '-') || ' (erwartet official/fallback/official_partner)');

  -- 03
  select x.logo_category || '/' || x.logo_category_source || '/' || x.sponsor_category into v_txt
    from event_app_exhibitors(v_ed) x where x.org_edition_id = v_oe2;
  insert into t_res values ('03_aus_stufe', coalesce(v_txt, '-') || ' (erwartet presenting/level/presenting_partner)');

  -- 04
  v_txt := set_logo_category(v_oe2, 'small');
  select v_txt || ' ' || x.logo_category || '/' || x.logo_category_source || '/' || x.sponsor_category into v_txt
    from event_app_exhibitors(v_ed) x where x.org_edition_id = v_oe2;
  insert into t_res values ('04a_feld', coalesce(v_txt, '-') || ' (erwartet small small/manual/official_partner)');
  select x.logo_category || '/' || x.logo_category_source into v_txt
    from partner_logo_production(v_ed) x where x.org_edition_id = v_oe2;
  insert into t_res values ('04b_fotowand', coalesce(v_txt, '-') || ' (erwartet small/manual)');

  -- 05
  begin perform set_logo_category(v_oe2, 'gold'); v_txt := 'ANGENOMMEN'; exception when sqlstate '22023' then v_txt := sqlerrm; end;
  v_txt := v_txt || ', geleert=' || set_logo_category(v_oe2, null);
  insert into t_res values ('05_unbekannt_leeren', v_txt || ' (erwartet invalid_category, geleert=presenting)');

  -- 06
  select string_agg(coalesce(a.before->>'logo_category', '-') || '>' || coalesce(a.after->>'logo_category', '-'), ' ' order by a.created_at)
    into v_txt from audit_log a where a.action = 'partner.logo_category' and a.object_id = v_oe2::text;
  insert into t_res values ('06_audit', coalesce(v_txt, '-') || ' (erwartet ->small small>-)');

  -- 07
  select count(*) into v_n from event_app_exhibitors(v_ed) x where x.logo_category is null or x.sponsor_category is null;
  insert into t_res values ('07_niemand_ohne', v_n || ' (erwartet 0)');
end $$;
select * from t_res order by step;
rollback;
