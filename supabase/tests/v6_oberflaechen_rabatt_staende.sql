-- Smoke-Test 0137 (Oberflaechen zu 0123 und 0124). Belegt:
--   01 alle vier Listen ohne Recht zu (42501);
--   02 `ticket_allocations_admin` nennt Rabattsatz **und** Teilnahme — ohne beides
--      standen die 100er- und die 50er-Zeile derselben Org ununterscheidbar
--      nebeneinander, und das Formular konnte die 50er gar nicht anlegen;
--   03 die alten Ausgabespalten sind alle noch da (Lehre aus 0099);
--   04 **die Menge einer 100er-Zeile ist gesperrt** (P0001 `derived_allocation`):
--      der naechste Abgleich haette die Handarbeit stillschweigend ueberschrieben;
--   05 dieselbe Menge noch einmal zu schicken ist keine Aenderung und geht durch
--      (sonst scheiterte jedes Speichern der Zeile an einem unveraenderten Feld);
--   06 Status, Coupon und Notiz bleiben an der 100er aenderbar — der
--      Reparaturweg fuer den vivenu-Abgleich bleibt offen;
--   07 an der 50er-Zeile ist die Menge frei;
--   08 `booth_day_plan` liefert die `assignment_id`, mit der die Oberflaeche loest;
--   09 die Kennung passt: `remove_booth_assignment` nimmt genau diese Belegung weg;
--   10 `booths_free` zeigt einen unbelegten Stand und **verschweigt** den, der
--      fuer beide Tage vergeben ist; eine reine Tagesbelegung laesst ihn stehen
--      und zaehlt sie mit;
--   11 `org_editions_picker` nennt die Teilnahmen der Edition mit Name und Art —
--      und **keine** Kontaktdaten;
--   12 eine inaktive Organisation steht nicht in der Auswahl.
-- Der Test nimmt die vorhandenen Veranstaltungstage der Edition (seit 21.09.
-- gepflegt) und legt nur an, was fehlt; Staende und Organisationen legt er sich
-- selbst an und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_tag1 uuid; v_tag2 uuid;
  v_org_a uuid; v_oe_a uuid; v_org_b uuid; v_oe_b uuid; v_org_x uuid; v_oe_x uuid;
  v_b_frei uuid; v_b_voll uuid; v_b_tag uuid;
  v_alloc100 uuid; v_alloc50 uuid; v_assign uuid;
  v_n integer; v_txt text;
begin
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 ohne Recht ---------------------------------------------------------------
  begin perform ticket_allocations_admin(v_ed);
    insert into t_res values ('01a_kontingente', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01a_kontingente', 'abgewiesen ' || sqlstate); end;
  begin perform booth_day_plan(v_ed);
    insert into t_res values ('01b_standplan', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01b_standplan', 'abgewiesen ' || sqlstate); end;
  begin perform booths_free(v_ed);
    insert into t_res values ('01c_freie_staende', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01c_freie_staende', 'abgewiesen ' || sqlstate); end;
  begin perform org_editions_picker(v_ed);
    insert into t_res values ('01d_auswahl', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01d_auswahl', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid, 'area_lead_partner', 'global', now() - interval '1 hour');

  -- Testdaten -------------------------------------------------------------------
  -- Die Edition hat seit dem 21.09. echte Veranstaltungstage. Wir nehmen sie,
  -- und legen nur an, was fehlt — sonst scheitert der Test an der Eindeutigkeit
  -- (event_id, day_date), und auf einer frisch aufgesetzten Datenbank haette er
  -- ohne Tage nichts zu pruefen.
  select d.id into v_tag1 from event_day d where d.event_id = v_ed order by d.day_date limit 1;
  if v_tag1 is null then
    insert into event_day (event_id, day_date, label_de)
    values (v_ed, date '2099-01-01', 'ZZTEST Tag 1') returning id into v_tag1;
  end if;
  select d.id into v_tag2 from event_day d
   where d.event_id = v_ed and d.id <> v_tag1 order by d.day_date limit 1;
  if v_tag2 is null then
    insert into event_day (event_id, day_date, label_de)
    values (v_ed, date '2099-01-02', 'ZZTEST Tag 2') returning id into v_tag2;
  end if;

  insert into organization (legal_name, communication_name, type, slug)
  values ('ZZTEST Flaeche A GmbH', 'ZZTEST Flaeche A', 'corporate', 'zztest-flaeche-a') returning id into v_org_a;
  insert into org_edition (org_id, edition_id) values (v_org_a, v_ed) returning id into v_oe_a;
  insert into organization (legal_name, type, slug)
  values ('ZZTEST Flaeche B GmbH', 'corporate', 'zztest-flaeche-b') returning id into v_org_b;
  insert into org_edition (org_id, edition_id) values (v_org_b, v_ed) returning id into v_oe_b;
  insert into organization (legal_name, type, slug, active)
  values ('ZZTEST Inaktiv GmbH', 'corporate', 'zztest-inaktiv', false) returning id into v_org_x;
  insert into org_edition (org_id, edition_id) values (v_org_x, v_ed) returning id into v_oe_x;

  insert into booth (booth_number) values ('ZZ-FREI') returning id into v_b_frei;
  insert into booth (booth_number) values ('ZZ-VOLL') returning id into v_b_voll;
  insert into booth (booth_number) values ('ZZ-TAG')  returning id into v_b_tag;

  -- Kontingente: eine abgeleitete 100er und eine 50er von Hand -------------------
  insert into org_ticket_allocation (event_id, org_id, org_edition_id, pass_type, quantity, discount_percent, status)
  values (v_ed, v_org_a, v_oe_a, 'partner', 10, 100, 'pending_vivenu') returning id into v_alloc100;
  v_alloc50 := set_ticket_allocation_discount(v_oe_a, 'partner', 50, 4);

  -- 02 Rabattsatz und Teilnahme in der Liste --------------------------------------
  select string_agg(x.discount_percent::text || '%/' || x.quantity::text, ' + ' order by x.discount_percent desc)
    into v_txt from ticket_allocations_admin(v_ed) x where x.org_id = v_org_a;
  insert into t_res values ('02a_saetze', v_txt);
  select count(*) into v_n from ticket_allocations_admin(v_ed) x
   where x.org_id = v_org_a and x.org_edition_id = v_oe_a;
  insert into t_res values ('02b_teilnahme', v_n::text || ' Zeilen mit org_edition_id');

  -- 03 alte Spalten noch da --------------------------------------------------------
  select string_agg(a.attname, ',' order by a.attnum) into v_txt
    from pg_proc p, unnest(p.proallargtypes) with ordinality as t(typ, ord)
    join lateral (select p.proargnames[t.ord] as attname, t.ord as attnum) a on true
   where p.proname = 'ticket_allocations_admin' and p.pronargs = 1
     and a.attname in ('id','org_id','org_name','edition_id','pass_type','quantity','used_count','coupon_code',
                       'undershop_url','status','last_error','synced_at','notes','vivenu_coupon_id','vivenu_undershop_id','updated_at');
  insert into t_res values ('03_alte_spalten', v_txt);

  -- 04 Menge der 100er gesperrt -------------------------------------------------
  begin
    perform set_ticket_allocation(v_alloc100, 99, null, null, null, null);
    insert into t_res values ('04_menge_100er', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('04_menge_100er', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 05 unveraenderte Menge ist keine Aenderung -----------------------------------
  begin
    perform set_ticket_allocation(v_alloc100, 10, null, null, null, null);
    insert into t_res values ('05_gleiche_menge', 'durchgelassen');
  exception when others then
    insert into t_res values ('05_gleiche_menge', 'ABGEWIESEN (BUG) ' || sqlstate); end;

  -- 06 Status und Coupon bleiben offen -------------------------------------------
  begin
    perform set_ticket_allocation(v_alloc100, null, 'ZZTEST-CODE', null, 'active', 'Notiz');
    select a.status || '/' || coalesce(a.coupon_code, '-') into v_txt
      from org_ticket_allocation a where a.id = v_alloc100;
    insert into t_res values ('06_status_offen', v_txt);
  exception when others then
    insert into t_res values ('06_status_offen', 'ABGEWIESEN (BUG) ' || sqlstate || ' ' || sqlerrm); end;

  -- 07 Menge der 50er frei ---------------------------------------------------------
  begin
    perform set_ticket_allocation(v_alloc50, 7, null, null, null, null);
    select a.quantity::text into v_txt from org_ticket_allocation a where a.id = v_alloc50;
    insert into t_res values ('07_menge_50er', v_txt);
  exception when others then
    insert into t_res values ('07_menge_50er', 'ABGEWIESEN (BUG) ' || sqlstate || ' ' || sqlerrm); end;

  -- Standbelegungen ------------------------------------------------------------------
  v_assign := set_booth_assignment(v_b_voll, v_oe_a, null, 'beide Tage');
  perform set_booth_assignment(v_b_tag, v_oe_b, v_tag1, 'nur Tag 1');

  -- 08 assignment_id im Plan ----------------------------------------------------------
  select count(*) into v_n from booth_day_plan(v_ed) x where x.assignment_id is null;
  insert into t_res values ('08a_ohne_kennung', v_n::text || ' Zeilen ohne assignment_id');
  select count(*) into v_n from booth_day_plan(v_ed) x where x.assignment_id = v_assign;
  insert into t_res values ('08b_beide_tage', v_n::text || ' Tage fuer die Belegung „beide Tage"');

  -- 09 loesen ueber die Kennung ---------------------------------------------------------
  perform remove_booth_assignment(v_assign);
  select count(*) into v_n from booth_day_plan(v_ed) x where x.booth_id = v_b_voll;
  insert into t_res values ('09_geloest', v_n::text || ' Zeilen fuer ZZ-VOLL');
  v_assign := set_booth_assignment(v_b_voll, v_oe_a, null, 'beide Tage');

  -- 10 freie Staende --------------------------------------------------------------------
  select string_agg(x.booth_number || '/' || x.belegte_tage::text, ', ' order by x.booth_number)
    into v_txt from booths_free(v_ed) x where x.booth_number like 'ZZ-%';
  insert into t_res values ('10_freie_staende', coalesce(v_txt, '(keine)'));

  -- 11/12 Auswahlliste --------------------------------------------------------------------
  select string_agg(x.org_name || '/' || coalesce(x.org_type, '-'), ', ' order by x.org_name)
    into v_txt from org_editions_picker(v_ed) x where x.org_name like 'ZZTEST%';
  insert into t_res values ('11_auswahl', coalesce(v_txt, '(leer)'));
  select count(*) into v_n from org_editions_picker(v_ed) x where x.org_edition_id = v_oe_x;
  insert into t_res values ('12_inaktive_org', v_n::text || ' Zeilen');
  select count(*) into v_n
    from pg_proc p where p.proname = 'org_editions_picker'
     and array_to_string(p.proargnames, ',') ~ '(email|phone|telefon)';
  insert into t_res values ('11b_keine_kontaktdaten', v_n::text || ' Kontaktspalten');
end $$;

select * from t_res order by step;
rollback;

-- Lauf 21.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 18/18 gruen.
--   01a-d je abgewiesen 42501; 02a '100%/10 + 50%/4', 02b 2 Zeilen mit org_edition_id;
--   03 alle sechzehn alten Spalten da; 04 abgewiesen P0001 derived_allocation;
--   05 durchgelassen; 06 'active/ZZTEST-CODE'; 07 Menge 7;
--   08a 0 Zeilen ohne assignment_id, 08b 2 Tage fuer „beide Tage"; 09 0 Zeilen nach dem Loesen;
--   10 'ZZ-FREI/0, ZZ-TAG/1' — der fuer beide Tage vergebene ZZ-VOLL fehlt zu Recht;
--   11 beide aktiven Testorganisationen, 11b 0 Kontaktspalten, 12 0 Zeilen fuer die inaktive.
