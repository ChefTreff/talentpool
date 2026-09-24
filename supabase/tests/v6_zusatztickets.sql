-- Smoke-Test (Zusatztickets, PART-070). Nummer offen. Belegt:
--   01 eine Ticketanfrage traegt Anzahl und Tickettyp **strukturiert**, nicht nur im Freitext;
--   02 die Mail nutzt die eigene Vorlage `ticket_request_received` — nicht mehr
--      `shop_request_received`, die als „Messeshop-Anfrage" ankam — und erreicht jemanden
--      (Vorbedingung: es gibt einen Empfaenger, sonst waere „keine Messeshop-Mail" gruen, ohne
--      dass ueberhaupt eine Mail entstand);
--   03 die Vorlage gibt es auf Deutsch und Englisch, mit Anzahl, Tickettyp und dem Link zu
--      den Kontingenten;
--   04 der Partner sieht seine Anfrage in `my_ticket_requests` mit Anzahl, Typ und Stand;
--   05 hat das Team geantwortet, sieht er Stand und Antwort;
--   06 eine gewoehnliche Messeshop-Anfrage taucht dort **nicht** auf;
--   07 der CHECK laesst Typ ohne Anzahl nicht zu (23514);
--   08 `ticket_requests_admin` nur fuers Partner-Team (42501 sonst), offene zuerst;
--   09 eine fremde Organisation sieht nichts (42501); `anon` darf keine der Funktionen.
-- Probelauf Bau-Chat 24.09.2026 (`sh scripts/db.sh dry-run`, fn-diff gegen live ohne
-- unerklaerte Zeile): **13/13 gruen**. Erster Lauf 11/13 — der CHECK liess einen Typ ohne
-- Anzahl durch (NULL > 0 ist NULL, und ein CHECK nimmt NULL an).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_fremd uuid; v_oe uuid;
  v_req uuid; v_req2 uuid; v_n integer; v_txt text; v_r record;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into organization (legal_name) values ('ZZ Tickets GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremde Tickets GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited')
    returning id into v_oe;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- Ein Empfaenger fuer die Mail, damit Schritt 02 etwas belegt: die Testperson bekommt die
  -- Rolle, an die `notify_partner_leads` zuerst schreibt.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');

  -- 01 Strukturiert
  v_req := request_ticket_increase(v_org, 'partner', 5, 'ZZ fuers Recruiting', v_ed);
  select pass_type, quantity into v_txt, v_n from shop_request where id = v_req;
  insert into t_res values ('01_strukturiert',
    case when v_txt = 'partner' and v_n = 5 then 'Typ und Anzahl in Spalten (richtig)'
         else 'unerwartet ' || coalesce(v_txt,'null') || '/' || coalesce(v_n::text,'null') end);

  -- 02 Die richtige Vorlage, und es gibt ueberhaupt eine Mail
  select count(*)::integer into v_n from mail_log
   where related_type = 'shop_request' and related_id = v_req;
  insert into t_res values ('02_vorbedingung_mail',
    case when v_n >= 1 then v_n || ' Mail(s) entstanden (richtig)'
         else 'KEINE MAIL — die folgenden Schritte waeren aussagelos' end);
  select count(*)::integer into v_n from mail_log
   where related_type = 'shop_request' and related_id = v_req and template_key = 'ticket_request_received';
  insert into t_res values ('02b_eigene_vorlage',
    case when v_n >= 1 then 'ticket_request_received (richtig)'
         else 'ALLOWED (BUG): falsche Vorlage' end);
  select count(*)::integer into v_n from mail_log
   where related_type = 'shop_request' and related_id = v_req and template_key = 'shop_request_received';
  insert into t_res values ('02c_nicht_mehr_messeshop',
    case when v_n = 0 then 'keine Messeshop-Mail mehr (richtig)'
         else 'ALLOWED (BUG): kommt noch als Messeshop-Anfrage' end);

  -- 03 Vorlage zweisprachig, mit dem, was zum Freigeben gebraucht wird
  select count(*)::integer into v_n from mail_template
   where key = 'ticket_request_received' and active
     and body_md like '%{{quantity}}%' and body_md like '%/admin/partner/kontingente%'
     and (body_md like '%{{pass_type_de}}%' or body_md like '%{{pass_type_en}}%');
  insert into t_res values ('03_vorlage_de_en',
    case when v_n = 2 then 'DE und EN mit Anzahl, Typ und Link (richtig)'
         else 'unerwartet: ' || v_n || ' passende Fassungen' end);

  -- 04 Der Partner sieht die Anfrage
  select * into v_r from my_ticket_requests(v_org, v_ed) q where q.id = v_req;
  insert into t_res values ('04_partner_sieht_anfrage',
    case when v_r.quantity = 5 and v_r.pass_type = 'partner' and v_r.status = 'open'
         then 'Anzahl, Typ, Stand offen (richtig)'
         else 'unerwartet ' || coalesce(v_r.status,'null') end);

  -- 05 Antwort des Teams kommt beim Partner an
  perform shop_request_answer(v_req, 'ZZ Kontingent um 5 erhoeht', 'answered');
  select * into v_r from my_ticket_requests(v_org, v_ed) q where q.id = v_req;
  insert into t_res values ('05_antwort_sichtbar',
    case when v_r.status = 'answered' and v_r.answer = 'ZZ Kontingent um 5 erhoeht' and v_r.answered_at is not null
         then 'Stand und Antwort (richtig)'
         else 'unerwartet ' || coalesce(v_r.status,'null') end);

  -- 06 Eine gewoehnliche Anfrage gehoert nicht in die Ticketsektion
  insert into shop_request (org_edition_id, text, created_by) values (v_oe, 'ZZ Frage zu einem Stehtisch', v_pid)
    returning id into v_req2;
  select count(*)::integer into v_n from my_ticket_requests(v_org, v_ed) q where q.id = v_req2;
  insert into t_res values ('06_messeshop_nicht_dabei',
    case when v_n = 0 then 'nicht in der Ticketsektion (richtig)'
         else 'ALLOWED (BUG): Shop-Frage als Ticketanfrage' end);

  -- 07 CHECK: Typ ohne Anzahl
  begin
    insert into shop_request (org_edition_id, text, created_by, pass_type) values (v_oe, 'ZZ halb', v_pid, 'partner');
    insert into t_res values ('07_check_halb', 'ALLOWED (BUG): Typ ohne Anzahl');
  exception
    when sqlstate '23514' then insert into t_res values ('07_check_halb', '23514 (richtig)');
    when others then insert into t_res values ('07_check_halb', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 08 Admin-Lesen: mit Rolle offen zuerst, ohne Rolle 42501
  perform request_ticket_increase(v_org, 'talent', 2, null, v_ed);   -- eine zweite, offene
  select q.status into v_txt from ticket_requests_admin(v_ed) q
   where q.org_id = v_org order by (q.status = 'open') desc, q.created_at desc limit 1;
  select count(*)::integer into v_n from ticket_requests_admin(v_ed) q where q.org_id = v_org;
  insert into t_res values ('08_admin_sieht_offene_zuerst',
    case when v_txt = 'open' and v_n = 2 then 'beide, offene vorn (richtig)'
         else 'unerwartet ' || coalesce(v_txt,'null') || '/' || v_n end);
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  begin
    perform ticket_requests_admin(v_ed);
    insert into t_res values ('08b_admin_ohne_rolle', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('08b_admin_ohne_rolle', '42501 (richtig)');
    when others then insert into t_res values ('08b_admin_ohne_rolle', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 09 Fremde Organisation
  begin
    perform my_ticket_requests(v_fremd, v_ed);
    insert into t_res values ('09_fremde_org', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('09_fremde_org', '42501 (richtig)');
    when others then insert into t_res values ('09_fremde_org', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;

insert into t_res
select '09b_anon_gesperrt',
       case when has_function_privilege('anon', 'my_ticket_requests(uuid, uuid)', 'execute')
              or has_function_privilege('anon', 'ticket_requests_admin(uuid)', 'execute')
            then 'ALLOWED (BUG)' else 'beide gesperrt (richtig)' end;

select * from t_res order by step;
rollback;
