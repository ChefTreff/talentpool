-- Test zu `v6_tour_zuordnung` (ADM-045). Belegt:
--   01 ohne Abschnitt tourAssignment 42501 auf alle fünf Funktionen (Teamrolle ohne Abschnitt);
--   02 Bestand: die Touren gleichen Namens tragen ihren Typ, „Marketing" keinen;
--   03 ensure_company_tours legt je fehlendem Typ eine Tour mit drei Stopps an,
--      ein zweiter Lauf legt nichts mehr an (idempotent);
--   04 assign_tour_stop setzt und nimmt einen Partner herunter, mit Audit; ein
--      Partner zweimal auf derselben Tour ⇒ partner_already_on_tour;
--   05 swap_tour_stops über zwei Touren: Positionen wandern, die Zeile (mit den
--      Angaben des Partners) bleibt beim Partner; Audit;
--   06 Tausch, der einen Partner doppelt auf eine Tour brächte ⇒ partner_already_on_tour,
--      nichts verändert;
--   07 set_company_tour_type: unbekannt ⇒ invalid_type, schon vergeben ⇒ invalid_type;
--   08 Übersicht: Stand je Tour (Stopps, besetzt) und gebuchte Partner mit ihren Touren.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_ed uuid; v_txt text; v_n integer; v_j jsonb;
  v_o1 uuid; v_o2 uuid; v_oe1 uuid; v_ta uuid; v_tb uuid; v_a1 uuid; v_a2 uuid; v_b1 uuid; v_b2 uuid; v_sku text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select id into v_ed from event where is_edition order by start_date desc limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'talent_team', 'global');

  -- 01
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_txt := '';
  begin perform tour_assignment_admin(); v_txt := v_txt || 'uebersicht ERLAUBT; '; exception when sqlstate '42501' then v_txt := v_txt || 'uebersicht 42501; '; end;
  begin perform ensure_company_tours(); v_txt := v_txt || 'ensure ERLAUBT; '; exception when sqlstate '42501' then v_txt := v_txt || 'ensure 42501; '; end;
  begin perform set_company_tour_type(gen_random_uuid(), 'sales'); v_txt := v_txt || 'typ ERLAUBT; '; exception when sqlstate '42501' then v_txt := v_txt || 'typ 42501; '; end;
  begin perform assign_tour_stop(gen_random_uuid(), null); v_txt := v_txt || 'assign ERLAUBT; '; exception when sqlstate '42501' then v_txt := v_txt || 'assign 42501; '; end;
  begin perform swap_tour_stops(gen_random_uuid(), gen_random_uuid()); v_txt := v_txt || 'swap ERLAUBT'; exception when sqlstate '42501' then v_txt := v_txt || 'swap 42501'; end;
  insert into t_res values ('01_ohne_abschnitt', v_txt || ' (erwartet alle 42501)');
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');

  -- 02
  select string_agg(name || '=' || coalesce(tour_type, '-'), ' ' order by name) into v_txt
    from company_tour where edition_id = v_ed and name in ('Consulting', 'Engineering', 'Finance', 'Logistik', 'Marketing', 'Sales');
  insert into t_res values ('02_bestand', coalesce(v_txt, '-')
    || ' (erwartet Consulting=consulting Engineering=engineering Finance=finance Logistik=logistik Marketing=- Sales=sales, sofern vorhanden)');

  -- 03 · eigene Edition, damit „fehlt" sicher fehlt
  insert into event (name, format_tag, slug, is_edition, start_date) values ('ZZTEST Edition Touren', 'edition', 'zztest-touren', true, now() - interval '10 years') returning id into v_ed;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_n := ensure_company_tours(v_ed);
  v_txt := 'erster=' || v_n || ' zweiter=' || ensure_company_tours(v_ed)
        || ' touren=' || (select count(*) from company_tour where edition_id = v_ed)
        || ' stopps=' || (select count(*) from company_tour_stop s join company_tour t on t.id = s.tour_id where t.edition_id = v_ed);
  insert into t_res values ('03_ensure', v_txt || ' (erwartet erster=5 zweiter=0 touren=5 stopps=15)');

  -- 04
  perform set_config('request.jwt.claims', '', true);
  insert into organization (legal_name) values ('ZZTEST Tour Eins GmbH') returning id into v_o1;
  insert into organization (legal_name) values ('ZZTEST Tour Zwei GmbH') returning id into v_o2;
  select id into v_ta from company_tour where edition_id = v_ed and tour_type = 'consulting';
  select id into v_tb from company_tour where edition_id = v_ed and tour_type = 'finance';
  select id into v_a1 from company_tour_stop where tour_id = v_ta and sort_order = 1;
  select id into v_a2 from company_tour_stop where tour_id = v_ta and sort_order = 2;
  select id into v_b1 from company_tour_stop where tour_id = v_tb and sort_order = 1;
  select id into v_b2 from company_tour_stop where tour_id = v_tb and sort_order = 2;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  perform assign_tour_stop(v_a1, v_o1);
  perform assign_tour_stop(v_b1, v_o2);
  begin perform assign_tour_stop(v_a2, v_o1); v_txt := 'DOPPELT ANGENOMMEN'; exception when sqlstate 'P0001' then v_txt := sqlerrm; end;
  perform assign_tour_stop(v_b2, v_o1);
  perform assign_tour_stop(v_b2, null);
  select count(*) into v_n from audit_log where action = 'tour.assign' and object_id in (v_a1::text, v_b1::text, v_b2::text);
  insert into t_res values ('04_assign', v_txt || ' audit=' || v_n
    || ' b2_frei=' || ((select host_org_id from company_tour_stop where id = v_b2) is null)::text
    || ' (erwartet partner_already_on_tour audit=4 b2_frei=true)');

  -- 05 · Partner 1 (Consulting, Platz 1) tauscht mit Partner 2 (Finance, Platz 1)
  update company_tour_stop set address = 'ZZTEST Strasse 1', filled_at = now() where id = v_a1;
  perform swap_tour_stops(v_a1, v_b1);
  select (select t.tour_type from company_tour t where t.id = s.tour_id) || '/' || s.sort_order || '/' || coalesce(s.address, '-') || '/' || (s.host_org_id = v_o1)::text
    into v_txt from company_tour_stop s where s.id = v_a1;
  v_txt := v_txt || ' | ' || (select (select t.tour_type from company_tour t where t.id = s.tour_id) || '/' || s.sort_order || '/' || (s.host_org_id = v_o2)::text
                                 from company_tour_stop s where s.id = v_b1);
  select count(*) into v_n from audit_log where action = 'tour.swap' and object_id = v_a1::text;
  insert into t_res values ('05_swap', v_txt || ' audit=' || v_n || ' (erwartet finance/1/ZZTEST Strasse 1/true | consulting/1/true audit=1)');

  -- 06 · Partner 2 steht nach dem Tausch auf Consulting Platz 1. Setzt man ihn zusätzlich auf
  --      Finance Platz 2 und tauscht diesen Platz mit Consulting Platz 2, stünde er zweimal auf Consulting.
  perform assign_tour_stop(v_b2, v_o2);
  begin perform swap_tour_stops(v_b2, v_a2); v_txt := 'GETAUSCHT'; exception when sqlstate 'P0001' then v_txt := sqlerrm; end;
  -- v_a2 (Consulting Platz 2, leer) ⇄ v_b2 (Finance Platz 2, Partner 2): Partner 2 käme auf Consulting, wo er auf Platz 1 steht.
  insert into t_res values ('06_swap_kollision', v_txt
    || ' b2_tour=' || (select t.tour_type from company_tour t join company_tour_stop s on s.tour_id = t.id where s.id = v_b2)
    || ' (erwartet partner_already_on_tour b2_tour=finance)');

  -- 07
  begin perform set_company_tour_type(v_ta, 'astrologie'); v_txt := 'ANGENOMMEN'; exception when sqlstate '22023' then v_txt := sqlerrm; end;
  begin perform set_company_tour_type(v_ta, 'finance'); v_txt := v_txt || ' ' || 'ANGENOMMEN'; exception when sqlstate '22023' then v_txt := v_txt || ' ' || sqlerrm; end;
  insert into t_res values ('07_typ', v_txt || ' (erwartet invalid_type invalid_type)');

  -- 08
  v_j := tour_assignment_admin(v_ed);
  select string_agg((t->>'tour_type') || ':' || (t->>'stops_total') || '/' || (t->>'stops_assigned'), ' ' order by t->>'tour_type') into v_txt
    from jsonb_array_elements(v_j->'tours') t where t->>'tour_type' in ('consulting', 'finance');
  insert into t_res values ('08a_stand', coalesce(v_txt, '-') || ' (erwartet consulting:3/1 finance:3/2)');
  -- Gebuchte Partner: Partner 1 bucht ein Company-Tour-Produkt in der Test-Edition.
  perform set_config('request.jwt.claims', '', true);
  insert into org_edition (org_id, edition_id) values (v_o1, v_ed) returning id into v_oe1;
  select sku into v_sku from product where format_key = 'company_tour' limit 1;
  insert into org_product (org_edition_id, product_sku, qty, status, source) values (v_oe1, v_sku, 1, 'booked', 'agreement');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_j := tour_assignment_admin(v_ed);
  select p->>'name' || ' touren=' || (p->'tours')::text into v_txt from jsonb_array_elements(v_j->'partners') p where (p->>'org_id')::uuid = v_o1;
  insert into t_res values ('08b_gebucht', coalesce(v_txt, '-') || ' (erwartet ZZTEST Tour Eins GmbH touren=["Finance"])');
end $$;
select * from t_res order by step;
rollback;
