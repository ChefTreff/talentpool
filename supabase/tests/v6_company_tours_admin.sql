-- Smoke-Test ADM-058/ADM-052 (Company Tours im Admin). Belegt:
--   01 **ADM-052 schwarz auf weiss**: `is_programme_editor(null)` ist fuer ein
--      Mitglied des Programm-Teams `false` — das war die Sperre. Ueber den neuen
--      Weg (`has_admin_section('companyTours')`) kommt dasselbe Konto durch;
--   02 ohne Rolle: 42501 auf Liste, Stopps, Optionen, Anlegen und Stopp-Anlegen;
--   03 `production_team` darf (die gewollte Erweiterung), `talent_team` nicht;
--   04 Tour anlegen, Session verknuepfen, in der Liste steht der Session-Titel;
--   05 eine Session aus einer **anderen** Edition wird abgewiesen (P0002) — sonst
--      zeigte die Tour auf ein fremdes Programm, und das faellt erst im Portal auf;
--   06 `session_id: null` loest die Verknuepfung wieder;
--   07 Stopp anlegen und aendern, `company_tour_stops_admin` zeigt ihn mit Gastgeber;
--   08 Optionen: Tage, Begleitungen (nur `tour_lead`), Sessions, Organisationen —
--      und eine **bereits verknuepfte** Session bleibt in der Liste, auch wenn ihr
--      Format nicht mehr `company_tour` ist (sonst schriebe der Editor sie still weg).
-- Der Test legt Touren an und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_ed2 uuid; v_tour uuid; v_stop uuid;
  v_ses uuid; v_ses2 uuid; v_org uuid; v_opt jsonb; v_txt text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select id into v_ed from event where is_edition and slug = 'fls27';
  select id into v_org from organization where active order by legal_name limit 1;

  -- Eine zweite Edition mit eigener Session, fuer Schritt 05.
  insert into event (name, slug, is_edition, format_tag, start_date, end_date)
  values ('ZZTEST Edition', 'zztest-edition', true, 'summit', current_date + 400, current_date + 401)
  returning id into v_ed2;
  insert into session (event_id, format, title_de) values (v_ed2, 'company_tour', 'ZZTEST Fremde Tour')
  returning id into v_ses2;
  insert into session (event_id, format, title_de) values (v_ed, 'company_tour', 'ZZTEST Tour-Session')
  returning id into v_ses;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 02 ohne Rolle
  begin perform company_tours_admin(v_ed); insert into t_res values ('02a_liste_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('02a_liste_ohne_recht', 'abgewiesen ' || sqlstate); end;
  begin perform company_tour_options(v_ed); insert into t_res values ('02b_optionen_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('02b_optionen_ohne_recht', 'abgewiesen ' || sqlstate); end;
  begin perform upsert_company_tour(jsonb_build_object('edition_id', v_ed, 'name', 'ZZTEST'));
        insert into t_res values ('02c_anlegen_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('02c_anlegen_ohne_recht', 'abgewiesen ' || sqlstate); end;
  begin perform upsert_company_tour_stop(jsonb_build_object('tour_id', gen_random_uuid()));
        insert into t_res values ('02d_stopp_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('02d_stopp_ohne_recht', 'abgewiesen ' || sqlstate); end;

  -- 01 ADM-052: die alte Bedingung war fuer das Programm-Team immer falsch
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'programme_team', 'global');
  insert into t_res values ('01a_alte_bedingung', coalesce(is_programme_editor(null)::text, 'null'));
  insert into t_res values ('01b_neuer_weg', has_admin_section('companyTours')::text);

  -- 04 Tour anlegen und Session verknuepfen
  v_tour := upsert_company_tour(jsonb_build_object('edition_id', v_ed, 'name', 'ZZTEST Company Tour', 'capacity', 12));
  perform upsert_company_tour(jsonb_build_object('id', v_tour, 'session_id', v_ses));
  select x.name || ' · Session: ' || coalesce(x.session_title, '-') || ' · Plaetze ' || coalesce(x.capacity::text, '-')
    into v_txt from company_tours_admin(v_ed) x where x.tour_id = v_tour;
  insert into t_res values ('04_tour_mit_session', v_txt);

  -- 05 fremde Edition
  begin
    perform upsert_company_tour(jsonb_build_object('id', v_tour, 'session_id', v_ses2));
    insert into t_res values ('05_fremde_session', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('05_fremde_session', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  select x.session_title into v_txt from company_tours_admin(v_ed) x where x.tour_id = v_tour;
  insert into t_res values ('05b_verknuepfung_unveraendert', coalesce(v_txt, 'WEG (BUG)'));

  -- 06 loesen
  perform upsert_company_tour(jsonb_build_object('id', v_tour, 'session_id', null));
  select coalesce(x.session_title, '(keine)') into v_txt from company_tours_admin(v_ed) x where x.tour_id = v_tour;
  insert into t_res values ('06_geloest', v_txt);
  perform upsert_company_tour(jsonb_build_object('id', v_tour, 'session_id', v_ses));

  -- 07 Stopp
  v_stop := upsert_company_tour_stop(jsonb_build_object('tour_id', v_tour, 'sort_order', 1, 'host_org_id', v_org, 'address', 'ZZTEST-Weg 1'));
  perform upsert_company_tour_stop(jsonb_build_object('id', v_stop, 'address', 'ZZTEST-Weg 2'));
  select s.sort_order::text || ' · ' || coalesce(s.host_org_name, '-') || ' · ' || coalesce(s.address, '-')
    into v_txt from company_tour_stops_admin(v_tour) s where s.stop_id = v_stop;
  insert into t_res values ('07_stopp', v_txt);
  select x.stops::text || ' Stopp(s)' into v_txt from company_tours_admin(v_ed) x where x.tour_id = v_tour;
  insert into t_res values ('07b_zaehler', v_txt);

  -- 08 Optionen; die verknuepfte Session bleibt, auch mit anderem Format
  update session set format = 'talk' where id = v_ses;
  v_opt := company_tour_options(v_ed);
  insert into t_res values ('08a_listen',
    'Tage ' || jsonb_array_length(v_opt->'days') || ', Begleitungen ' || jsonb_array_length(v_opt->'leads')
    || ', Orgs ' || (case when jsonb_array_length(v_opt->'orgs') > 0 then 'ja' else 'NEIN' end));
  insert into t_res values ('08b_verknuepfte_session_bleibt',
    (select count(*) from jsonb_array_elements(v_opt->'sessions') s where s->>'id' = v_ses::text)::text || ' Treffer');
  insert into t_res values ('08c_nur_tour_leads',
    (select count(*) from jsonb_array_elements(v_opt->'leads') l
      join edition_contact c on c.id = (l->>'id')::uuid where c.type <> 'tour_lead')::text || ' falsche');

  -- 03 andere Rollen
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'production_team', 'global');
  insert into t_res values ('03a_production', has_admin_section('companyTours')::text);
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'talent_team', 'global');
  insert into t_res values ('03b_talent', has_admin_section('companyTours')::text);
end $$;

select * from t_res order by step;
rollback;

-- Lauf 25.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 17/17 gruen.
--   01a is_programme_editor(null) = false (die Sperre aus ADM-052), 01b neuer Weg true;
--   02a-d ohne Rolle abgewiesen 42501 (Liste, Optionen, Anlegen, Stopp);
--   03a production_team true, 03b talent_team false;
--   04 'ZZTEST Company Tour · Session: ZZTEST Tour-Session · Plaetze 12';
--   05 fremde Session abgewiesen P0002 session_not_found, 05b Verknuepfung unveraendert;
--   06 geloest '(keine)'; 07 '1 · TEST — Partner · ZZTEST-Weg 2', 07b '1 Stopp(s)';
--   08a 'Tage 2, Begleitungen 0, Orgs ja', 08b verknuepfte Session bleibt (1 Treffer),
--   08c 0 falsche Begleitungen.
