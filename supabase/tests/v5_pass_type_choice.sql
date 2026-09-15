-- Smoke-Test 0105 (Pass-Typ vorbelegen und übersteuern). Belegt:
--   01 eine neue Org-Edition einer Startup-Organisation bekommt `startup`;
--   02 jede andere Kategorie bekommt `talent`;
--   03 ein beim Anlegen ausdrücklich gesetzter Wert bleibt stehen;
--   04 ein Update auf NULL bleibt NULL — die Vorbelegung greift nur beim
--      Anlegen, sonst könnte das Team den Rückfall nie wieder einstellen;
--   05 ohne Partner-Team kein Setzen ⇒ 42501;
--   06 das Team setzt den Wert und erfährt, wie viele Kontingente betroffen sind;
--   07 ein erfundener Wert ⇒ 22023 `invalid_pass_type_choice`;
--   08 `null` stellt den Rückfall wieder her;
--   09 das Kontingent zieht nach: der Pass-Typ der Talente-Tickets folgt der Wahl;
--   10 jede Änderung steht mit Vorher und Nachher im Protokoll.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_org_s uuid; v_org_t uuid; v_oe_s uuid; v_oe_t uuid; v_txt text; v_txt2 text; v_res jsonb; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into organization (legal_name, communication_name, type, partner_category, active)
    values ('Startup Test GmbH', 'Startup Test', 'startup', 'startup', true) returning id into v_org_s;
  insert into organization (legal_name, communication_name, type, partner_category, active)
    values ('Konzern Test AG', 'Konzern Test', 'corporate', 'talent', true) returning id into v_org_t;

  -- 01/02 · Vorbelegung beim Anlegen.
  insert into org_edition (org_id, edition_id, onboarding_status)
    values (v_org_s, v_ed, 'invited') returning id, pass_type_choice into v_oe_s, v_txt;
  insert into t_res values ('01_startup',
    case when v_txt = 'startup' then 'startup vorbelegt (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);
  insert into org_edition (org_id, edition_id, onboarding_status)
    values (v_org_t, v_ed, 'invited') returning id, pass_type_choice into v_oe_t, v_txt;
  insert into t_res values ('02_talent',
    case when v_txt = 'talent' then 'talent vorbelegt (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 03 · Ausdrücklich gesetzt schlägt die Vorbelegung.
  insert into organization (legal_name, type, partner_category, active)
    values ('Dritte Test GmbH', 'startup', 'startup', true) returning id into v_org_t;
  insert into org_edition (org_id, edition_id, onboarding_status, pass_type_choice)
    values (v_org_t, v_ed, 'invited', 'talent') returning pass_type_choice into v_txt;
  insert into t_res values ('03_ausdruecklich',
    case when v_txt = 'talent' then 'Eingabe bleibt stehen (richtig)' else 'ueberschrieben (BUG) ' || coalesce(v_txt, 'null') end);

  -- 04 · Der Rückfall lässt sich einstellen.
  update org_edition set pass_type_choice = null where id = v_oe_s;
  select pass_type_choice into v_txt from org_edition where id = v_oe_s;
  insert into t_res values ('04_rueckfall',
    case when v_txt is null then 'NULL bleibt NULL (richtig)' else 'wieder gefuellt (BUG) ' || v_txt end);

  -- 05 · Ohne Partner-Team.
  begin
    perform set_pass_type_choice(v_org_s, 'startup', v_ed);
    insert into t_res values ('05_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('05_ohne_recht', 'abgewiesen ' || sqlstate); end;

  -- 06 · Mit Team.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  v_res := set_pass_type_choice(v_org_s, 'startup', v_ed);
  select pass_type_choice into v_txt from org_edition where id = v_oe_s;
  insert into t_res values ('06_gesetzt',
    case when v_txt = 'startup' and v_res ? 'allocations'
         then 'gesetzt, Kontingente benannt (richtig)' else 'unerwartet ' || coalesce(v_res::text, 'null') end);

  -- 07 · Erfundener Wert.
  begin
    perform set_pass_type_choice(v_org_s, 'vip', v_ed);
    insert into t_res values ('07_erfunden', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('07_erfunden', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 09 · Das Kontingent zieht nach. Erst ein gebuchtes Talente-Ticket.
  insert into org_product (org_edition_id, product_sku, qty, status)
    select v_oe_s, pr.sku, 5, 'booked' from product pr where pr.pass_type = 'talent' limit 1;
  select a.pass_type into v_txt from org_ticket_allocation a
   where a.org_id = v_org_s and a.event_id = v_ed limit 1;
  perform set_pass_type_choice(v_org_s, 'talent', v_ed);
  select a.pass_type into v_txt2 from org_ticket_allocation a
   where a.org_id = v_org_s and a.event_id = v_ed limit 1;
  insert into t_res values ('09_kontingent',
    case when v_txt = 'startup' and v_txt2 = 'talent' then 'startup -> talent (richtig)'
         when v_txt is null then 'kein Talente-Ticket im Katalog (uebersprungen)'
         else 'unerwartet ' || coalesce(v_txt, 'null') || ' -> ' || coalesce(v_txt2, 'null') end);

  -- 08 · Zurück auf den Rückfall.
  v_res := set_pass_type_choice(v_org_s, null, v_ed);
  select pass_type_choice into v_txt from org_edition where id = v_oe_s;
  insert into t_res values ('08_zurueck',
    case when v_txt is null then 'Rueckfall wiederhergestellt (richtig)' else 'unerwartet ' || v_txt end);

  -- 10 · Protokoll.
  select count(*)::integer into v_n from audit_log
   where action = 'partner.pass_type_choice' and object_id = v_oe_s::text
     and before ? 'pass_type_choice' and after ? 'pass_type_choice';
  insert into t_res values ('10_protokoll',
    case when v_n >= 3 then v_n || ' Eintraege mit Vorher/Nachher (richtig)' else 'nur ' || v_n || ' (BUG)' end);
end $$;
select * from t_res order by step;
rollback;
