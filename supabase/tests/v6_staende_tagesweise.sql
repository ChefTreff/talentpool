-- Smoke-Test 0124 (Stände tagesweise · A3.5, ADM-022). Belegt:
--   01 belegen ohne Partner-/Produktions-Team 42501;
--   02 ein Stand ohne Tag gilt fuer beide Tage;
--   03 zwei Organisationen teilen sich denselben Stand an verschiedenen Tagen —
--      genau das verhinderte die alte Eindeutigkeit an `booth.org_edition_id`;
--   04 **zwei Belegungen desselben Standes am selben Tag werden abgewiesen** (23505):
--      ein Stand mit zwei Organisationen an einem Tag ist kein Datenfehler, den man
--      spaeter bemerkt, sondern ein Aufbau, der vor Ort scheitert;
--   05 zwei Zeilen „beide Tage" fuer denselben Stand ebenso — `nulls not distinct`;
--   06 ein Tag einer fremden Edition ⇒ 22023 `invalid_day`;
--   07 unbekannter Stand ⇒ P0002 `booth_not_found`;
--   08 `booth_day_plan` zeigt je Tag, wer dort steht, und markiert geteilte Staende;
--   09 eine Belegung fuer beide Tage erscheint an **beiden** Tagen im Plan;
--   10 `org_has_booth` erkennt die Teilnahme ueber die Zuordnung;
--   11 `upsert_booth` legt Stand **und** Belegung an, ein zweiter Aufruf aendert den
--      bestehenden Stand statt einen zweiten anzulegen;
--   12 `partner_admin_overview` liefert die Standnummer auch bei geteiltem Stand —
--      die Unterabfrage hatte vorher kein `limit` und waere abgebrochen;
--   13 Loesen entfernt die Belegung, nicht den Stand;
--   14 jede Belegung und jedes Loesen steht im Protokoll;
--   15 auf `booth` steht **genau eine** Lesepolitik, sie geht ueber `booth_assignment`
--      und nennt `booth.org_edition_id` nicht mehr — die alte Policy haette den `drop column`
--      scheitern lassen (2BP01), ein blosses Loeschen haette Partnern den Blick auf
--      ihren Stand genommen;
--   16 an der Spalte haengt nichts mehr: `pg_attribute` kennt sie nicht.
-- Der Test legt sich **eigene Veranstaltungstage** an: die Edition hat heute keine
-- (`event_day` ist leer, das Programm-Geruest ist noch nicht gefuellt). Ohne das
-- wuerden die Schritte 03 bis 09 nichts pruefen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_fremd_ed uuid;
        v_tag1 uuid; v_tag2 uuid; v_fremdtag uuid;
        v_org_a uuid; v_oe_a uuid; v_org_b uuid; v_oe_b uuid;
        v_booth uuid; v_zuordnung uuid; v_n integer; v_txt text;
begin
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  -- **Die Edition hat heute keine Veranstaltungstage** — das Programm-Geruest
  -- (0110) ist gebaut, aber noch nicht gefuellt. Der Test legt sich deshalb
  -- eigene an, statt auf gepflegte Daten zu warten; alles rollt zurueck.
  insert into event_day (event_id, day_date, label_de, sort_order)
  values (v_ed, date '2027-04-16', 'ZZTEST Tag 1', 901) returning id into v_tag1;
  insert into event_day (event_id, day_date, label_de, sort_order)
  values (v_ed, date '2027-04-17', 'ZZTEST Tag 2', 902) returning id into v_tag2;

  select e.id into v_fremd_ed from event e where e.is_edition and e.id <> v_ed limit 1;
  if v_fremd_ed is null then
    insert into event (name, slug, is_edition, start_date, end_date)
    values ('ZZTEST Fremdedition', 'zztest-fremd', true, date '2028-04-16', date '2028-04-17')
    returning id into v_fremd_ed;
  end if;
  insert into event_day (event_id, day_date, label_de, sort_order)
  values (v_fremd_ed, date '2028-04-16', 'ZZTEST Fremdtag', 903) returning id into v_fremdtag;

  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into organization (legal_name, type, slug) values ('ZZTEST Stand A', 'initiative', 'zztest-stand-a') returning id into v_org_a;
  insert into org_edition (org_id, edition_id) values (v_org_a, v_ed) returning id into v_oe_a;
  insert into organization (legal_name, type, slug) values ('ZZTEST Stand B', 'initiative', 'zztest-stand-b') returning id into v_org_b;
  insert into org_edition (org_id, edition_id) values (v_org_b, v_ed) returning id into v_oe_b;
  insert into booth (booth_number, booth_type) values ('ZZ-1', 'standard') returning id into v_booth;

  begin perform set_booth_assignment(v_booth, v_oe_a, null);
    insert into t_res values ('01_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid, 'area_lead_partner', 'global', now() - interval '1 hour');

  v_zuordnung := set_booth_assignment(v_booth, v_oe_a, null);
  select count(*)::integer into v_n from booth_assignment where booth_id = v_booth and event_day_id is null;
  insert into t_res values ('02_beide_tage', case when v_n = 1 then 'belegt (richtig)' else 'FEHLT (' || v_n || ')' end);

  -- Fuer die Tagesbelegung erst die Zeile fuer beide Tage loesen.
  perform remove_booth_assignment(v_zuordnung);
  perform set_booth_assignment(v_booth, v_oe_a, v_tag1);
  perform set_booth_assignment(v_booth, v_oe_b, v_tag2);
  select count(*)::integer into v_n from booth_assignment where booth_id = v_booth;
  insert into t_res values ('03_geteilt',
    case when v_n = 2 then 'zwei Organisationen, zwei Tage (richtig)' else 'unerwartet ' || v_n end);

  -- 04 zweite Organisation am selben Tag: die Eindeutigkeit haelt. `on conflict`
  -- der RPC **aendert** die Zeile — geprueft wird deshalb der direkte Insert.
  begin
    insert into booth_assignment (booth_id, org_edition_id, event_day_id) values (v_booth, v_oe_b, v_tag1);
    insert into t_res values ('04_zwei_am_selben_tag', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('04_zwei_am_selben_tag', 'abgewiesen ' || sqlstate); end;
  begin
    insert into booth_assignment (booth_id, org_edition_id, event_day_id) values (v_booth, v_oe_a, null);
    insert into booth_assignment (booth_id, org_edition_id, event_day_id) values (v_booth, v_oe_b, null);
    insert into t_res values ('05_zweimal_beide_tage', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('05_zweimal_beide_tage', 'abgewiesen ' || sqlstate); end;

  begin perform set_booth_assignment(v_booth, v_oe_a, v_fremdtag);
    insert into t_res values ('06_fremder_tag', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('06_fremder_tag', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin perform set_booth_assignment(gen_random_uuid(), v_oe_a, null);
    insert into t_res values ('07_unbekannter_stand', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('07_unbekannter_stand', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  select count(*)::integer into v_n from booth_day_plan(v_ed) p where p.booth_id = v_booth;
  insert into t_res values ('08_tagesplan',
    case when v_n = 2 then 'zwei Zeilen, ein Stand je Tag (richtig)' else 'unerwartet ' || v_n end);
  select bool_and(p.geteilt) into v_txt from booth_day_plan(v_ed) p where p.booth_id = v_booth;
  insert into t_res values ('08b_geteilt_markiert',
    case when v_txt = 'true' then 'als geteilt erkannt (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 09 eine Belegung fuer beide Tage erscheint an beiden.
  insert into booth (booth_number, booth_type) values ('ZZ-2', 'standard') returning id into v_booth;
  perform set_booth_assignment(v_booth, v_oe_a, null);
  select count(*)::integer into v_n from booth_day_plan(v_ed) p where p.booth_id = v_booth;
  insert into t_res values ('09_beide_tage_im_plan',
    case when v_n = 2 then 'an beiden Tagen (richtig)' else 'unerwartet ' || v_n end);

  insert into t_res values ('10_org_has_booth',
    case when org_has_booth(v_oe_a) then 'erkannt (richtig)' else 'FEHLT' end);

  -- 11 upsert_booth legt Stand und Belegung an und aendert beim zweiten Mal.
  perform upsert_booth(v_org_b, jsonb_build_object('booth_number', 'ZZ-3'), v_ed);
  perform upsert_booth(v_org_b, jsonb_build_object('booth_number', 'ZZ-3b'), v_ed);
  select count(*)::integer into v_n from booth_assignment ba
    join booth b on b.id = ba.booth_id where ba.org_edition_id = v_oe_b and b.booth_number = 'ZZ-3b';
  insert into t_res values ('11_upsert_booth',
    case when v_n = 1 then 'ein Stand, geaendert statt verdoppelt (richtig)' else 'unerwartet ' || v_n end);

  select p.booth_number into v_txt from partner_admin_overview(v_ed) p where p.org_id = v_org_a;
  insert into t_res values ('12_admin_uebersicht',
    case when v_txt is not null then 'Standnummer geliefert (richtig)' else 'FEHLT' end);

  select ba.id into v_zuordnung from booth_assignment ba where ba.booth_id = v_booth limit 1;
  perform remove_booth_assignment(v_zuordnung);
  select count(*)::integer into v_n from booth where id = v_booth;
  insert into t_res values ('13_loesen',
    case when v_n = 1 then 'Stand bleibt, Belegung weg (richtig)' else 'Stand mitgeloescht (BUG)' end);

  select count(*)::integer into v_n from audit_log
   where action in ('booth.assignment', 'booth.assignment_removed');
  insert into t_res values ('14_protokoll',
    case when v_n >= 2 then v_n || ' Eintraege (richtig)' else 'FEHLT (' || v_n || ')' end);

  -- 15 die Lesepolitik ist ersetzt, nicht nur entfernt --------------------------
  select count(*)::integer into v_n from pg_policies
   where schemaname = 'public' and tablename = 'booth' and cmd = 'SELECT';
  select string_agg(qual, ' | ') into v_txt from pg_policies
   where schemaname = 'public' and tablename = 'booth' and cmd = 'SELECT';
  -- Geprueft wird `booth.org_edition_id`, nicht `org_edition_id` schlechthin:
  -- die neue Policy nennt `ba.org_edition_id` im Join, und das muss sie auch.
  insert into t_res values ('15_lesepolitik',
    case when v_n = 1 and v_txt like '%booth_assignment%' and v_txt not like '%booth.org_edition_id%'
         then 'eine Policy ueber die Zuordnung (richtig)'
         else 'unerwartet: ' || v_n || ' Policy/Policies — ' || coalesce(left(v_txt, 160), 'keine') end);

  -- 16 an der alten Spalte haengt nichts mehr ------------------------------------
  select count(*)::integer into v_n from pg_attribute
   where attrelid = 'booth'::regclass and attname = 'org_edition_id' and not attisdropped;
  insert into t_res values ('16_spalte_weg',
    case when v_n = 0 then 'Spalte entfernt (richtig)' else 'steht noch (BUG)' end);
end $$;
select * from t_res order by step;
rollback;
