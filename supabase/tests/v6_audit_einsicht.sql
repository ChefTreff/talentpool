-- Smoke-Test PORT4a (Audit-Einsicht). Belegt:
--   01 **eine Teamrolle reicht nicht**: `area_lead_partner` bekommt 42501 auf
--      beide Funktionen. Das Protokoll zeigt Vorher- und Nachher-Staende aus dem
--      ganzen System — es ist der eine Ort, an dem „Teammitglied" zu wenig ist;
--   02 `admin` liest;
--   03 die Filter greifen einzeln: Aktion, Objekttyp, Objektkennung, Person;
--   04 der Zeitraum schneidet beidseitig, und `p_to` ist **exklusiv** — sonst
--      zaehlte ein Eintrag in zwei aneinandergrenzende Zeitraeume;
--   05 `total` nennt die Gesamtzahl **der Treffer**, nicht die der Seite: sonst
--      wuesste niemand, ob es eine zweite Seite gibt;
--   06 die Seite selbst ist begrenzt und `p_limit` wird gedeckelt (200);
--   07 die Filterlisten nennen nur, was vorkommt.
-- Der Test schreibt Audit-Zeilen und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_n integer; v_txt text; v_gesamt bigint; v_opt jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;

  perform set_config('request.jwt.claims', '', true);
  insert into audit_log (actor_person_id, action, object_type, object_id, before, after, created_at) values
    (v_pid, 'zztest.eins', 'zzding', 'A', '{"x":1}'::jsonb, '{"x":2}'::jsonb, now() - interval '3 days'),
    (v_pid, 'zztest.eins', 'zzding', 'B', null, '{"x":3}'::jsonb, now() - interval '2 days'),
    (v_pid, 'zztest.zwei', 'zzanderes', 'A', null, null, now() - interval '1 day'),
    (null,  'zztest.zwei', 'zzding', 'C', null, null, now());

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 Teamrolle reicht nicht
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  begin perform audit_log_admin(); insert into t_res values ('01a_teamrolle', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01a_teamrolle', 'abgewiesen ' || sqlstate); end;
  begin perform audit_log_filters(); insert into t_res values ('01b_filter_teamrolle', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01b_filter_teamrolle', 'abgewiesen ' || sqlstate); end;

  -- 02 admin liest
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  select count(*) into v_n from audit_log_admin(p_action := 'zztest.eins');
  insert into t_res values ('02_admin_liest', v_n::text || ' Zeilen');

  -- 03 Filter einzeln
  select count(*) into v_n from audit_log_admin(p_object_type := 'zzding');
  insert into t_res values ('03a_objekttyp', v_n::text);
  select count(*) into v_n from audit_log_admin(p_object_type := 'zzding', p_object_id := 'A');
  insert into t_res values ('03b_objektkennung', v_n::text);
  select count(*) into v_n from audit_log_admin(p_actor := v_pid, p_action := 'zztest.zwei');
  insert into t_res values ('03c_person', v_n::text);

  -- 04 Zeitraum, p_to exklusiv
  select count(*) into v_n from audit_log_admin(p_action := 'zztest.eins',
                                                p_from := now() - interval '2 days 1 hour');
  insert into t_res values ('04a_ab', v_n::text);
  select count(*) into v_n from audit_log_admin(p_action := 'zztest.eins',
                                                p_to := now() - interval '2 days 1 hour');
  insert into t_res values ('04b_bis_exklusiv', v_n::text);

  -- 05 total zaehlt die Treffer, nicht die Seite
  select x.total into v_gesamt from audit_log_admin(p_object_type := 'zzding', p_limit := 1) x;
  select count(*) into v_n from audit_log_admin(p_object_type := 'zzding', p_limit := 1);
  insert into t_res values ('05_total', 'Seite ' || v_n::text || ', gesamt ' || coalesce(v_gesamt::text, '-'));

  -- 06 Deckel
  select count(*) into v_n from audit_log_admin(p_object_type := 'zzding', p_limit := 1, p_offset := 1);
  insert into t_res values ('06_seite_zwei', v_n::text || ' Zeile');

  -- 07 Filterlisten
  v_opt := audit_log_filters();
  insert into t_res values ('07_filterlisten',
    (select count(*) from jsonb_array_elements_text(v_opt->'actions') a where a like 'zztest%')::text
    || ' Aktionen, ' ||
    (select count(*) from jsonb_array_elements_text(v_opt->'object_types') o where o like 'zz%')::text
    || ' Objekttypen');
end $$;

select * from t_res order by step;
rollback;

-- Lauf 25.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 11/11 gruen.
--   01a/01b area_lead_partner abgewiesen 42501 auf beide Funktionen;
--   02 admin liest 2 Zeilen zur gefilterten Aktion;
--   03a Objekttyp 3, 03b Objektkennung 1, 03c Person+Aktion 1;
--   04a ab 1, 04b bis (exklusiv) 1;
--   05 'Seite 1, gesamt 3' — total zaehlt die Treffer, nicht die Seite;
--   06 Seite zwei 1 Zeile; 07 '2 Aktionen, 2 Objekttypen' in den Filterlisten.
