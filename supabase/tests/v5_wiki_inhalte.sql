-- Smoke-Test 0096 (Wiki-Inhalte aus Notion, F9.6). Belegt:
--   01 zehn Artikel sind da;
--   02 **keiner** ist veröffentlicht — die Texte tragen die Daten von 2026
--      und dürfen so nicht im Portal für 2027 stehen;
--   03 sie sind jahresunabhängig (edition_id null), damit ein Overlay je
--      Edition darüber passt;
--   04 deshalb sieht ein Partner heute **nichts** davon;
--   05 nach dem Freischalten sieht er den Artikel — und die Zielgruppe greift:
--      ein Speaker-Artikel taucht im Partner-Wiki nicht auf;
--   06 kein privater Kontakt: Konrads Mobilnummer aus dem Notion-FAQ ist
--      nicht mit eingezogen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_n integer; v_id uuid; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  select count(*)::integer into v_n from kb_article
   where slug in ('location-anfahrt','oeffnungszeiten-ablauf','tickets-akkreditierung','event-app',
                  'messestand-rueckwand','hallenplan-standuebersicht','anlieferung-aufbau',
                  'help-desk-kiosk','hotel-unterkunft','faq-speaking');
  insert into t_res values ('01_anzahl',
    case when v_n = 10 then '10 Artikel (richtig)' else 'unerwartet ' || v_n end);

  select count(*)::integer into v_n from kb_article
   where slug in ('location-anfahrt','faq-speaking','messestand-rueckwand') and status <> 'draft';
  insert into t_res values ('02_alle_entwurf',
    case when v_n = 0 then 'nichts veroeffentlicht (richtig)' else v_n || ' VEROEFFENTLICHT (BUG)' end);

  select count(*)::integer into v_n from kb_article
   where slug = 'location-anfahrt' and edition_id is null;
  insert into t_res values ('03_jahresunabhaengig',
    case when v_n = 1 then 'evergreen (richtig)' else 'unerwartet ' || v_n end);

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'partner_contact', 'global');
  select count(*)::integer into v_n from kb_articles('partner', 'de', v_ed) k
   where k.slug = 'messestand-rueckwand';
  insert into t_res values ('04_entwurf_unsichtbar',
    case when v_n = 0 then 'nicht im Portal (richtig)' else 'SICHTBAR (BUG)' end);

  -- Freischalten braucht die Bereichsleitung; danach ist er da.
  select id into v_id from kb_article where slug = 'messestand-rueckwand' and edition_id is null;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  perform publish_kb_article(v_id, true);
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  select count(*)::integer into v_n from kb_articles('partner', 'de', v_ed) k
   where k.slug = 'messestand-rueckwand';
  insert into t_res values ('05a_nach_freigabe',
    case when v_n = 1 then 'sichtbar (richtig)' else 'unerwartet ' || v_n end);

  begin
    perform count(*) from kb_articles('speaker', 'de', v_ed);
    insert into t_res values ('05b_fremde_zielgruppe', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('05b_fremde_zielgruppe', 'abgewiesen ' || sqlstate); end;

  select count(*)::integer into v_n from kb_article
   where body_md like '%151%614%' or body_md like '%+49151%';
  insert into t_res values ('06_keine_private_nummer',
    case when v_n = 0 then 'keine Mobilnummer (richtig)' else v_n || ' MIT NUMMER (BUG)' end);
end $$;
select * from t_res order by step;
rollback;
