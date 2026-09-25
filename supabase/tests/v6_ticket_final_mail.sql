-- Smoke-Test SPK-068 Teil 2 (Ticket-Mail `ticket_final`). Belegt:
--   01 die Vorlage steht in DE und EN und ist aktiv;
--   02 Ausstellen legt **genau eine** Mail in die Warteschlange, an die Speakerin,
--      mit `related_id` = Ticket und dem Namen der Inhaberin in den Variablen;
--   03 ein zweiter Aufruf legt **keine** zweite an — auch wenn die erste schon
--      verschickt ist (`queue_mail` allein schuetzt nur gegen eine zweite wartende);
--   04 **der Wettlauf**: war der Webhook schneller, kehrt `set_ticket_issued` still
--      zurueck — die Mail geht trotzdem raus, und zwar auch nur einmal;
--   05 beim **Begleitticket** geht die Mail an die Speakerin, nicht an die
--      Begleitadresse: zu der gibt es keine Person, keine Sprache, keine
--      Unterdrueckungsliste und keine Einwilligung. `holder_name` nennt trotzdem
--      die Begleitung, damit die Mail sagt, um welches Ticket es geht;
--   06 an keine dritte Adresse: alle Empfaenger gehoeren zur Speakerin.
-- Der Test legt ein Speaker-Profil samt Tickets an und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_vivenu text; v_person uuid; v_prof uuid; v_ticket uuid; v_begleit uuid;
  v_email text; v_n integer; v_txt text; v_typ text;
begin
  perform set_config('request.jwt.claims', '', true);  -- Servicekontext
  select e.id, e.vivenu_event_id into v_ed, v_vivenu from event e where e.is_edition and e.slug = 'fls27';

  insert into t_res values ('01_vorlage',
    (select string_agg(locale || (case when active then '' else ' (inaktiv!)' end), '+' order by locale)
       from mail_template where key = 'ticket_final'));

  insert into person (first_name, last_name) values ('Zora', 'ZZTEST-Mail') returning id into v_person;
  insert into person_email (person_id, email, is_primary) values (v_person, 'zztest-mail@example.org', true);
  v_email := 'zztest-mail@example.org';
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, pass_type)
  values (v_person, v_ed, 'keynote', 'confirmed', 'speaker') returning id into v_prof;
  -- Das Speaker-Ticket entsteht mit der Zusage von allein (Trigger).
  select t.id into v_ticket from ticket t where t.speaker_profile_id = v_prof and t.source = 'speaker';

  -- 02 Ausstellen
  perform set_ticket_issued(v_ticket, 'ZZTEST-VV-1', 'ZZTEST-BC-1', null, null);
  select count(*) into v_n from mail_log m where m.template_key = 'ticket_final' and m.related_id = v_ticket;
  select m.person_id::text = v_person::text, coalesce(m.meta->'vars'->>'holder_name', '-')
    into v_txt, v_typ from mail_log m where m.template_key = 'ticket_final' and m.related_id = v_ticket limit 1;
  insert into t_res values ('02_mail', v_n::text || ' Mail, an die Speakerin: ' || coalesce(v_txt, '?') || ', holder_name: ' || v_typ);

  -- 03 kein zweites Mal, auch nicht nach dem Versand
  update mail_log set status = 'sent' where template_key = 'ticket_final' and related_id = v_ticket;
  perform set_ticket_issued(v_ticket, 'ZZTEST-VV-1', 'ZZTEST-BC-1', null, null);
  select count(*) into v_n from mail_log m where m.template_key = 'ticket_final' and m.related_id = v_ticket;
  insert into t_res values ('03_kein_zweites', v_n::text || ' Mail');

  -- 04 Wettlauf: Webhook zuerst, dann die Action
  insert into person (first_name, last_name) values ('Zack', 'ZZTEST-Wettlauf') returning id into v_person;
  insert into person_email (person_id, email, is_primary) values (v_person, 'zztest-wettlauf@example.org', true);
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, pass_type)
  values (v_person, v_ed, 'keynote', 'confirmed', 'speaker') returning id into v_prof;
  select t.id into v_ticket from ticket t where t.speaker_profile_id = v_prof and t.source = 'speaker';
  perform ingest_vivenu_ticket(jsonb_build_object(
    '_id', 'ZZTEST-VV-2', 'eventId', v_vivenu, 'barcode', 'ZZTEST-BC-2',
    'batch', v_ticket::text, 'status', 'VALID', 'createdAt', now()::text));
  perform set_ticket_issued(v_ticket, 'ZZTEST-VV-2', 'ZZTEST-BC-2', null, null);
  select count(*) into v_n from mail_log m where m.template_key = 'ticket_final' and m.related_id = v_ticket;
  insert into t_res values ('04_wettlauf', v_n::text || ' Mail trotz stillem Rueckweg');
  perform set_ticket_issued(v_ticket, 'ZZTEST-VV-2', 'ZZTEST-BC-2', null, null);
  select count(*) into v_n from mail_log m where m.template_key = 'ticket_final' and m.related_id = v_ticket;
  insert into t_res values ('04b_wettlauf_nur_einmal', v_n::text || ' Mail');

  -- 05 Begleitticket: Mail an die Speakerin, Name der Begleitung im Text
  insert into ticket (event_id, speaker_profile_id, pass_type, holder_email, holder_first_name, holder_last_name,
                      status, personalization_status, price_cents, source)
  values (v_ed, v_prof, 'speaker', 'zztest-begleitung@example.org', 'Bea', 'ZZTEST-Begleitung',
          'approved', 'partial', 0, 'speaker_companion')
  returning id into v_begleit;
  perform set_ticket_issued(v_begleit, 'ZZTEST-VV-3', 'ZZTEST-BC-3', null, null);
  select coalesce(m.meta->'vars'->>'holder_name', '-') || ' → ' || coalesce(m.to_email, '-')
    into v_txt from mail_log m where m.template_key = 'ticket_final' and m.related_id = v_begleit;
  insert into t_res values ('05_begleitung', coalesce(v_txt, 'KEINE MAIL (BUG)'));

  -- 06 keine Mail an eine dritte Adresse
  select count(*) into v_n from mail_log m
   where m.template_key = 'ticket_final' and m.to_email ilike '%begleitung%';
  insert into t_res values ('06_keine_dritte_adresse', v_n::text || ' Mail an die Begleitadresse');
end $$;

select * from t_res order by step;
rollback;

-- Lauf 25.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 7/7 gruen.
--   01 'de+en' (beide aktiv);
--   02 '1 Mail, an die Speakerin: true, holder_name: Zora ZZTEST-Mail';
--   03 nach 'sent' kein zweites Mal: 1 Mail;
--   04 Wettlauf: 1 Mail trotz stillem Rueckweg, 04b auch beim zweiten Aufruf 1;
--   05 'Bea ZZTEST-Begleitung → zztest-wettlauf@example.org' (Name der Begleitung
--      im Text, Adresse der Speakerin als Empfaenger);
--   06 0 Mail an die Begleitadresse.
