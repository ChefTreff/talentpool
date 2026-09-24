-- Smoke-Test SPK-068 (Speaker-Ticket ausstellen). Belegt:
--   01 `speaker_ticket_for_issue` ohne Speaker-Team 42501, im Servicekontext offen;
--   02 unbekanntes Ticket P0002, ein gekauftes Ticket P0001 `not_a_free_ticket`;
--   03 die Lesefunktion liefert Inhaberin, vivenu-Event und den Tickettyp aus
--      `ticket_type_map`; bei **zwei** aktiven Zuordnungen zum selben Pass-Typ
--      bleibt es bei **einer** Zeile (ein gewoehnlicher Join gab zwei zurueck),
--      und ohne Zuordnung bleibt der Typ leer, damit die Action abbricht statt
--      vivenu einen leeren Typ zu schicken;
--   04 **der Wettlauf mit dem Webhook**: `ticket.created` trifft ein, **bevor**
--      `set_ticket_issued` gelaufen ist. Der Ingest erkennt unser Ticket an
--      `batch` und **aktualisiert** die vorhandene Zeile, statt eine zweite
--      anzulegen — danach gibt es genau **eine** Zeile fuer das Profil;
--   05 danach laeuft `set_ticket_issued` **durch**, obwohl der Webhook das Ticket
--      schon auf `valid` gesetzt hat: dieselbe vivenu-Kennung heisst „nichts mehr
--      zu tun". Ohne das meldete die Oberflaeche einen Fehlschlag, obwohl das
--      Ticket bei vivenu existiert — und der naechste Klick legte ein zweites an;
--   06 ein `batch`, der zu keinem offenen Freiticket gehoert, legt wie bisher
--      eine eigene Zeile an — der neue Weg darf keine fremden Tickets kapern;
--   07 ein Ticket, das **schon** eine vivenu-Kennung hat, wird ueber diese
--      gefunden und nicht ueber `batch` (Reihenfolge der Suche);
--   08 `set_ticket_secret` bleibt dem Server vorbehalten (42501 mit Anmeldung).
-- Der Test legt sich ein Speaker-Profil samt Ticket an und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_vivenu text;
  v_person uuid; v_prof uuid; v_ticket uuid; v_map uuid; v_typ text;
  v_n integer; v_txt text;
begin
  select e.id, e.vivenu_event_id into v_ed, v_vivenu from event e where e.is_edition and e.slug = 'fls27';
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into person (first_name, last_name) values ('Zora', 'ZZTEST-Speaker') returning id into v_person;
  insert into person_email (person_id, email, is_primary) values (v_person, 'zztest-speaker@example.org', true);
  insert into speaker_profile (person_id, edition_id, confirmed_at, pipeline_status, speaker_type)
  values (v_person, v_ed, now(), 'confirmed', 'keynote') returning id into v_prof;
  -- Das Speaker-Ticket entsteht mit der Zusage von allein (Trigger aus
  -- `speaker_profile_tickets_sync`) — es anzulegen scheiterte am eindeutigen
  -- Index `ticket_speaker_own_uidx`. Wir lesen es.
  select t.id into v_ticket from ticket t
   where t.speaker_profile_id = v_prof and t.source = 'speaker';
  if v_ticket is null then
    raise exception 'Erwartet: der Trigger legt das Speaker-Ticket an';
  end if;
  update ticket set holder_first_name = 'Zora', holder_last_name = 'ZZTEST-Speaker',
                    holder_email = 'zztest-speaker@example.org'
   where id = v_ticket;

  -- 01a ohne Recht --------------------------------------------------------------
  begin
    perform speaker_ticket_for_issue(v_ticket);
    insert into t_res values ('01a_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01a_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid, 'area_lead_speaker', 'global', now() - interval '1 hour');

  -- 02 falsche Eingaben -----------------------------------------------------------
  begin
    perform speaker_ticket_for_issue(gen_random_uuid());
    insert into t_res values ('02a_unbekannt', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('02a_unbekannt', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  update ticket set source = 'vivenu' where id = v_ticket;
  begin
    perform speaker_ticket_for_issue(v_ticket);
    insert into t_res values ('02b_gekauft', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('02b_gekauft', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  update ticket set source = 'speaker' where id = v_ticket;

  -- 03 die Angaben ---------------------------------------------------------------------
  select x.holder_email || ' · ' || coalesce(x.vivenu_event_id, '(kein Event)')
         || ' · typ=' || coalesce(x.vivenu_ticket_type_id, '(keiner)')
    into v_txt from speaker_ticket_for_issue(v_ticket) x;
  insert into t_res values ('03a_angaben', v_txt);

  -- Eine **zweite** aktive Zuordnung zum selben Pass-Typ: ein gewoehnlicher Join
  -- gaebe hier zwei Zeilen zurueck und die Action nähme willkuerlich eine.
  insert into ticket_type_map (event_id, vivenu_ticket_type_id, vivenu_ticket_name, pass_type, active)
  values (v_ed, 'ZZTEST-TYP-1', 'ZZTEST Speaker Pass', 'speaker', true) returning id into v_map;
  select count(*) into v_n from speaker_ticket_for_issue(v_ticket);
  insert into t_res values ('03b_genau_eine_zeile', v_n::text);
  -- Ohne jede Zuordnung bleibt der Typ leer — die Action bricht dann mit einem
  -- eigenen Schluessel ab, statt vivenu einen leeren Typ zu schicken.
  update ticket_type_map set active = false where event_id = v_ed and pass_type = 'speaker';
  select coalesce(x.vivenu_ticket_type_id, '(keiner)') into v_txt from speaker_ticket_for_issue(v_ticket) x;
  insert into t_res values ('03c_ohne_zuordnung', v_txt);
  update ticket_type_map set active = true where id = v_map;
end $$;

-- 04..07 Der Wettlauf — im Servicekontext, wie der Webhook ------------------------------
do $$
declare v_prof uuid; v_ticket uuid; v_ed uuid; v_vivenu text; v_n integer; v_txt text; v_fremd uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  select e.id, e.vivenu_event_id into v_ed, v_vivenu from event e where e.is_edition and e.slug = 'fls27';
  select sp.id into v_prof from speaker_profile sp
    join person p on p.id = sp.person_id where p.last_name = 'ZZTEST-Speaker';
  select t.id into v_ticket from ticket t where t.speaker_profile_id = v_prof and t.source = 'speaker';

  -- 04 Webhook zuerst: erkennt uns ueber `batch` und aktualisiert
  perform ingest_vivenu_ticket(jsonb_build_object(
    '_id', 'ZZTEST-VIVENU-1', 'eventId', v_vivenu, 'ticketTypeId', 'ZZTEST-TYP-1',
    'transactionId', 'ZZTEST-TXN-1', 'barcode', 'ZZTEST-BARCODE-1', 'secret', 'ZZTEST-SECRET-1',
    'batch', v_ticket::text, 'status', 'VALID',
    'firstname', 'Zora', 'lastname', 'ZZTEST-Speaker', 'createdAt', now()::text));
  select count(*) into v_n from ticket t where t.speaker_profile_id = v_prof;
  insert into t_res values ('04a_eine_zeile', v_n::text || ' Zeile(n) fuer das Profil');
  select t.source || ' / ' || coalesce(t.vivenu_ticket_id, '-') || ' / ' || coalesce(t.barcode, '-')
    into v_txt from ticket t where t.id = v_ticket;
  insert into t_res values ('04b_unsere_zeile', v_txt);
  select count(*) into v_n from ticket_secret s where s.ticket_id = v_ticket;
  insert into t_res values ('04c_secret', v_n::text);

  -- 05 danach stellt die Action aus
  begin
    perform set_ticket_issued(v_ticket, 'ZZTEST-VIVENU-1', 'ZZTEST-BARCODE-1', 'ZZTEST-TXN-1', null);
    select t.status into v_txt from ticket t where t.id = v_ticket;
    insert into t_res values ('05_ausgestellt', v_txt);
  exception when others then
    insert into t_res values ('05_ausgestellt', 'FEHLER ' || sqlstate || ' ' || sqlerrm); end;

  -- 06 ein fremder `batch` kapert nichts
  perform ingest_vivenu_ticket(jsonb_build_object(
    '_id', 'ZZTEST-VIVENU-2', 'eventId', v_vivenu, 'ticketTypeId', 'ZZTEST-TYP-1',
    'barcode', 'ZZTEST-BARCODE-2', 'batch', gen_random_uuid()::text, 'status', 'VALID',
    'firstname', 'Fremd', 'lastname', 'ZZTEST-Fremd', 'createdAt', now()::text));
  select count(*) into v_n from ticket t where t.vivenu_ticket_id = 'ZZTEST-VIVENU-2';
  insert into t_res values ('06_fremder_batch', v_n::text || ' eigene Zeile');
  select count(*) into v_n from ticket t where t.speaker_profile_id = v_prof;
  insert into t_res values ('06b_profil_unberuehrt', v_n::text || ' Zeile(n)');

  -- 07 vorhandene vivenu-Kennung gewinnt vor `batch`
  perform ingest_vivenu_ticket(jsonb_build_object(
    '_id', 'ZZTEST-VIVENU-1', 'eventId', v_vivenu, 'ticketTypeId', 'ZZTEST-TYP-1',
    'batch', v_ticket::text, 'status', 'VALID', 'company', 'ZZTEST AG',
    'updatedAt', (now() + interval '1 minute')::text));
  select count(*) into v_n from ticket t where t.vivenu_ticket_id = 'ZZTEST-VIVENU-1';
  insert into t_res values ('07_keine_verdopplung', v_n::text || ' Zeile');
end $$;

-- 01b/08 --------------------------------------------------------------------------------
do $$
declare v_ticket uuid; v_n integer;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  select t.id into v_ticket from ticket t join speaker_profile sp on sp.id = t.speaker_profile_id
    join person p on p.id = sp.person_id where p.last_name = 'ZZTEST-Speaker' and t.source = 'speaker';
  select count(*) into v_n from speaker_ticket_for_issue(v_ticket);
  insert into t_res values ('01b_servicekontext', v_n::text || ' Zeile');
end $$;

do $$
declare v_ticket uuid; v_pid uuid; v_uid uuid; v_email text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  select t.id into v_ticket from ticket t join speaker_profile sp on sp.id = t.speaker_profile_id
    join person p on p.id = sp.person_id where p.last_name = 'ZZTEST-Speaker' and t.source = 'speaker';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform set_ticket_secret(v_ticket, 'ZZTEST-NEU');
    insert into t_res values ('08_secret_angemeldet', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('08_secret_angemeldet', 'abgewiesen ' || sqlstate); end;
end $$;

select * from t_res order by step;
rollback;

-- Lauf 25.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 15/15 gruen.
--   01a abgewiesen 42501, 01b 1 Zeile im Servicekontext;
--   02a P0002 ticket_not_found, 02b P0001 not_a_free_ticket;
--   03a Inhaberin + Event + Typ, 03b genau 1 Zeile bei zwei Zuordnungen,
--   03c '(keiner)' ohne aktive Zuordnung;
--   04a 1 Zeile fuer das Profil, 04b 'speaker / ZZTEST-VIVENU-1 / ZZTEST-BARCODE-1',
--   04c Secret gesetzt; 05 'valid' (der Webhook war schneller, die Action laeuft durch);
--   06 fremder batch legt eigene Zeile an, Profil unberuehrt;
--   07 1 Zeile (keine Verdopplung); 08 abgewiesen 42501.
-- Vor der Korrektur waren 03b (zwei Zeilen), 04b (ohne vivenu-Kennung), 05
-- (P0001 not_pending) und 07 (0 Zeilen) rot — der Test hat drei echte Fehler
-- der ersten Fassung gefunden.
