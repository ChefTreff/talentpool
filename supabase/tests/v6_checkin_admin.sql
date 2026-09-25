-- Smoke-Test ADM-051 (Check-in-Sicht im Admin). Belegt:
--   01 ohne Abschnittsrecht: 42501 auf beide Lesefunktionen;
--   02 `volunteers_team` darf, `checkin_operator` **nicht** — das Geraetekonto am
--      Eingang gehoert nicht in den Admin (EXTERNAL_ROLES, 24.09.);
--   03 die Tagesliste zaehlt je Ergebnis getrennt und nennt die Zahl der Geraete;
--   04 ein Veranstaltungstag **ohne** Scan steht mit Nullen da, statt zu fehlen —
--      „noch nichts gescannt" ist eine Antwort, eine leere Liste nicht;
--   05 die Suche findet ueber den Namen und ueber die genaue Adresse;
--   06 **der Barcode nur genau**: ein Teilstueck findet nichts. Sonst waere die
--      Suche ein Weg, gueltige Codes zu erraten;
--   07 unter drei Zeichen: `query_too_short` statt einer halben Edition;
--   08 die Suche zeigt Ticketstatus, Zahl der Scans und das letzte Ergebnis.
-- Der Test legt ein Ticket samt Scans an und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_person uuid; v_ticket uuid;
  v_tag date; v_n integer; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select id into v_ed from event where is_edition and slug = 'fls27';
  select min(d.day_date) into v_tag from event_day d join event e on e.id = d.event_id
   where coalesce(e.edition_id, e.id) = v_ed;

  perform set_config('request.jwt.claims', '', true);
  insert into person (first_name, last_name) values ('Zora', 'ZZTEST-Einlass') returning id into v_person;
  insert into person_email (person_id, email, is_primary) values (v_person, 'zztest-einlass@example.org', true);
  insert into ticket (event_id, person_id, pass_type, holder_email, holder_first_name, holder_last_name,
                      barcode, status, personalization_status, price_cents, source)
  values (v_ed, v_person, 'talent', 'zztest-einlass@example.org', 'Zora', 'ZZTEST-Einlass',
          'ZZTEST-BC-EINLASS', 'valid', 'complete', 0, 'vivenu')
  returning id into v_ticket;
  insert into checkin (ticket_id, edition_id, scan_day, result, device_id, scanned_at) values
    (v_ticket, v_ed, v_tag, 'ok', 'ZZTEST-Tablet-1', now()),
    (v_ticket, v_ed, v_tag, 'duplicate', 'ZZTEST-Tablet-2', now() + interval '1 minute');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 ohne Recht
  begin perform checkin_admin_days(v_ed); insert into t_res values ('01a_tage_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01a_tage_ohne_recht', 'abgewiesen ' || sqlstate); end;
  begin perform checkin_admin_search('Zora', v_ed); insert into t_res values ('01b_suche_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01b_suche_ohne_recht', 'abgewiesen ' || sqlstate); end;

  -- 02 das Geraetekonto bleibt draussen
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'checkin_operator', 'global');
  insert into t_res values ('02a_checkin_operator', has_admin_section('checkin')::text);
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'volunteers_team', 'global');
  insert into t_res values ('02b_volunteers_team', has_admin_section('checkin')::text);

  -- 03 Zahlen je Tag
  select x.ok::text || ' ok, ' || x.duplicate::text || ' doppelt, ' || x.invalid::text || ' ungueltig, '
         || x.geraete::text || ' Geraete'
    into v_txt from checkin_admin_days(v_ed) x where x.tag = v_tag;
  insert into t_res values ('03_tageszahlen', coalesce(v_txt, 'TAG FEHLT (BUG)'));

  -- 04 Tag ohne Scan
  select count(*) into v_n from checkin_admin_days(v_ed) x where x.tag <> v_tag and x.ok = 0;
  insert into t_res values ('04_tag_ohne_scan', v_n::text || ' Tag(e) mit Nullen');

  -- 05 Suche
  select count(*) into v_n from checkin_admin_search('ZZTEST-Einlass', v_ed);
  insert into t_res values ('05a_ueber_den_namen', v_n::text || ' Treffer');
  select count(*) into v_n from checkin_admin_search('zztest-einlass@example.org', v_ed);
  insert into t_res values ('05b_ueber_die_adresse', v_n::text || ' Treffer');

  -- 06 Barcode nur genau
  select count(*) into v_n from checkin_admin_search('ZZTEST-BC-EINLASS', v_ed);
  insert into t_res values ('06a_barcode_genau', v_n::text || ' Treffer');
  select count(*) into v_n from checkin_admin_search('ZZTEST-BC', v_ed);
  insert into t_res values ('06b_barcode_teilstueck', v_n::text || ' Treffer');

  -- 07 zu kurz
  begin
    perform checkin_admin_search('Zo', v_ed);
    insert into t_res values ('07_zu_kurz', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('07_zu_kurz', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 08 Status und Scans
  select s.status || ' · ' || s.scans::text || ' Scans · zuletzt ' || coalesce(s.letztes_ergebnis, '-')
    into v_txt from checkin_admin_search('ZZTEST-Einlass', v_ed) s;
  insert into t_res values ('08_ticketstand', coalesce(v_txt, 'KEIN TREFFER (BUG)'));
end $$;

select * from t_res order by step;
rollback;

-- Lauf 25.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 12/12 gruen.
--   01a/01b ohne Recht abgewiesen 42501;
--   02a checkin_operator = false (das Geraetekonto bleibt draussen), 02b volunteers_team = true;
--   03 '1 ok, 1 doppelt, 0 ungueltig, 2 Geraete';
--   04 5 Veranstaltungstage ohne Scan stehen mit Nullen da;
--   05a/05b Suche ueber Name und Adresse je 1 Treffer;
--   06a Barcode genau 1 Treffer, 06b Teilstueck 0 Treffer;
--   07 'Zo' abgewiesen 22023 query_too_short;
--   08 'valid · 2 Scans · zuletzt duplicate'.
