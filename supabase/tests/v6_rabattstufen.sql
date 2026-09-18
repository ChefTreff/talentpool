-- Smoke-Test 0123 (Rabattstufen je Kontingent · A3.3, ADM-022). Belegt:
--   01 von Hand setzen ohne Partner-Team 42501;
--   02 die Ableitung schreibt die **100-%**-Zeile aus den gebuchten Produkten;
--   03 von Hand 100 setzen ⇒ P0001 `derived_allocation` — diese Zeile gehoert der
--      Ableitung, eine Aenderung daran waere beim naechsten Lauf wieder weg;
--   04 ein erfundener Satz ⇒ 22023 `invalid_discount`;
--   05 zwei Kontingente desselben Pass-Typs mit verschiedenem Satz stehen nebeneinander
--      (genau das verhinderte die alte Eindeutigkeit);
--   06 **der naechste Abgleich laesst die 50er unberuehrt** — der eigentliche Punkt
--      dieser Migration: ohne die drei `discount_percent = 100` in
--      `sync_ticket_allocations` haette er die Handarbeit ueberschrieben;
--   07 faellt das Produkt weg, raeumt der Abgleich die 100er ab, 08 die 50er bleibt;
--   09 Menge 0 **deaktiviert** statt zu loeschen — drueben haengt ein Coupon, den die
--      Route abschaltet;
--   10 jede Handaenderung steht mit Vorher/Nachher im Protokoll;
--   11 der CHECK haelt auch gegen einen direkten Insert.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid;
        v_n integer; v_txt text; v_id uuid;
begin
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into organization (legal_name, type, slug)
  values ('ZZTEST Satz GmbH', 'corporate', 'zztest-satz') returning id into v_org;
  insert into org_edition (org_id, edition_id) values (v_org, v_ed) returning id into v_oe;
  -- `I-32776` ist das Partner-Ticketprodukt; daraus leitet sich das Kontingent ab.
  insert into org_product (org_edition_id, product_sku, qty, unit_price_cents, status)
  values (v_oe, 'I-32776', 10, 0, 'booked');

  begin perform set_ticket_allocation_discount(v_oe, 'partner', 50, 5);
    insert into t_res values ('01_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid, 'area_lead_partner', 'global', now() - interval '1 hour');

  perform sync_ticket_allocations(v_oe);
  select quantity || '/' || discount_percent into v_txt from org_ticket_allocation
   where org_edition_id = v_oe and pass_type = 'partner' and discount_percent = 100;
  insert into t_res values ('02_ableitung',
    case when v_txt = '10/100' then '10 Tickets zu 100 (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  begin perform set_ticket_allocation_discount(v_oe, 'partner', 100, 3);
    insert into t_res values ('03_hundert_verboten', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('03_hundert_verboten', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin perform set_ticket_allocation_discount(v_oe, 'partner', 25, 3);
    insert into t_res values ('04_erfundener_satz', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('04_erfundener_satz', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  v_id := set_ticket_allocation_discount(v_oe, 'partner', 50, 4);
  select count(*)::integer into v_n from org_ticket_allocation where org_edition_id = v_oe and pass_type = 'partner';
  insert into t_res values ('05_zwei_saetze',
    case when v_n = 2 then 'zwei Kontingente nebeneinander (richtig)' else 'unerwartet ' || v_n end);

  perform sync_ticket_allocations(v_oe);
  select quantity || '/' || status into v_txt from org_ticket_allocation
   where org_edition_id = v_oe and pass_type = 'partner' and discount_percent = 50;
  insert into t_res values ('06_abgleich_laesst_50_stehen',
    case when v_txt = '4/pending_vivenu' then 'unberuehrt (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  delete from org_product where org_edition_id = v_oe;
  perform sync_ticket_allocations(v_oe);
  select count(*)::integer into v_n from org_ticket_allocation where org_edition_id = v_oe and discount_percent = 100;
  insert into t_res values ('07_hundert_geraeumt',
    case when v_n = 0 then 'weg (richtig)' else 'steht noch (' || v_n || ')' end);
  select count(*)::integer into v_n from org_ticket_allocation where org_edition_id = v_oe and discount_percent = 50;
  insert into t_res values ('08_fuenfzig_bleibt',
    case when v_n = 1 then 'bleibt (richtig)' else 'FEHLT (' || v_n || ')' end);

  perform set_ticket_allocation_discount(v_oe, 'partner', 50, 0);
  select quantity || '/' || status into v_txt from org_ticket_allocation
   where org_edition_id = v_oe and pass_type = 'partner' and discount_percent = 50;
  insert into t_res values ('09_null_deaktiviert',
    case when v_txt = '0/disabled' then 'deaktiviert, nicht geloescht (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  select count(*)::integer into v_n from audit_log where action = 'allocation.discount' and object_id = v_oe::text;
  insert into t_res values ('10_protokoll',
    case when v_n >= 2 then v_n || ' Eintraege (richtig)' else 'FEHLT (' || v_n || ')' end);

  begin
    insert into org_ticket_allocation (event_id, org_id, org_edition_id, pass_type, quantity, discount_percent)
    values (v_ed, v_org, v_oe, 'partner', 1, 25);
    insert into t_res values ('11_check_haelt', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('11_check_haelt', 'abgewiesen ' || sqlstate); end;
end $$;
select * from t_res order by step;
rollback;
-- Lauf am 18.09. gegen die Datenbank (Migration + Test in einer Transaktion, rollback): 11/11 gruen.
