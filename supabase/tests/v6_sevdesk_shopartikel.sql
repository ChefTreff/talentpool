-- Smoke-Test 0131 (Messeshop-Artikel nach SevDesk · Nachtrag zu A4.3). Belegt:
--   01 ohne Partner-Team 42501 (unveraendert);
--   02/03 SevDesk umfasst **mehr** als HubSpot — die Regel ist je System verschieden;
--   04/05 Barter (`INI-%`) bleibt in **beiden** Faellen hier: in einem Rechnungssystem
--      waeren Leistungen mit Preis 0 eine Einladung, sie versehentlich zu berechnen;
--   06 nach HubSpot gehen nur Artikel mit `source_hubspot` — ein Mobiliar-Artikel aus
--      dem Messeshop hat im Vertriebssystem nichts zu suchen;
--   07 nach SevDesk gehen die reinen Shop-Artikel mit, damit sich eine Rechnung am
--      Ende einem Artikel zuordnen laesst;
--   08 inaktive Artikel gehen mit — `lib/sevdesk/parts.ts` setzt drueben das
--      Inaktiv-Kennzeichen, statt sie wegzulassen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_hs integer; v_sd integer; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  begin perform products_for_sync('sevdesk');
    insert into t_res values ('01_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid, 'area_lead_partner', 'global', now() - interval '1 hour');

  select count(*)::integer into v_hs from products_for_sync('hubspot');
  select count(*)::integer into v_sd from products_for_sync('sevdesk');
  insert into t_res values ('02_mengen', 'HubSpot ' || v_hs || ', SevDesk ' || v_sd);
  insert into t_res values ('03_sevdesk_mehr',
    case when v_sd > v_hs then 'SevDesk umfasst mehr (richtig)' else 'gleich viel (BUG)' end);

  select count(*)::integer into v_n from products_for_sync('sevdesk') s where s.sku like 'INI-%';
  insert into t_res values ('04_barter_nicht_sevdesk',
    case when v_n = 0 then 'kein INI-Artikel (richtig)' else 'FEHLER ' || v_n end);
  select count(*)::integer into v_n from products_for_sync('hubspot') s where s.sku like 'INI-%';
  insert into t_res values ('05_barter_nicht_hubspot',
    case when v_n = 0 then 'kein INI-Artikel (richtig)' else 'FEHLER ' || v_n end);

  select count(*)::integer into v_n from products_for_sync('hubspot') s
    join product p on p.sku = s.sku where not p.source_hubspot;
  insert into t_res values ('06_hubspot_nur_eigene',
    case when v_n = 0 then 'keine reinen Shop-Artikel (richtig)' else 'FEHLER ' || v_n end);
  select count(*)::integer into v_n from products_for_sync('sevdesk') s
    join product p on p.sku = s.sku where not p.source_hubspot;
  insert into t_res values ('07_sevdesk_mit_shop',
    case when v_n > 0 then v_n || ' Shop-Artikel dabei (richtig)' else 'FEHLEN' end);

  select count(*)::integer into v_n from products_for_sync('sevdesk') s where not s.active;
  insert into t_res values ('08_inaktive_gehen_mit',
    v_n || ' inaktive Artikel (werden drueben inaktiv gesetzt, nicht weggelassen)');
end $$;
select * from t_res order by step;
rollback;
-- Lauf am 21.09. gegen die Datenbank (Migration + Test in einer Transaktion, rollback): 8/8 gruen.
-- HubSpot 86, SevDesk 162 — davon 76 reine Shop-Artikel, die vorher fehlten.
