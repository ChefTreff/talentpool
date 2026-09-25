-- Smoke-Test QS-049 (eine Wahrheit fuer „bestaetigt"). Belegt:
--   01 **die Vorbedingung, um die es geht**: ein Profil mit
--      `pipeline_status = 'confirmed'` und **leerem** `confirmed_at` erscheint im
--      Swapcard-Export. Vorher fiel genau dieses Profil heraus — es hatte ein
--      Freiticket und fehlte in der Event-App;
--   02 ein **abgesagtes** Profil erscheint nicht (`declined_at`), auch wenn der
--      Status noch bestaetigt lautet;
--   03 ein Profil im Status `lead` erscheint nicht;
--   04 der Trigger setzt `confirmed_at` beim **Anlegen** mit bestaetigtem Status;
--   05 der Trigger setzt ihn beim **Statuswechsel** von `lead` auf `confirmed`;
--   06 ein bereits gesetzter Zeitstempel bleibt stehen (der erste gewinnt);
--   07 der Trigger greift auch, wenn jemand **nur** `confirmed_at` auf NULL setzt,
--      ohne den Status anzufassen — dafuer hoert er auf jedes Update;
--   08 eine Rueckstufung loescht den Zeitstempel **nicht** (er beantwortet „wann
--      zum ersten Mal zugesagt"), die Person faellt aber aus dem Export;
--   09 Rechte unveraendert: angemeldet ohne Speaker-/Partner-Team 42501.
-- Der Test legt Profile an und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_p1 uuid; v_p2 uuid; v_p3 uuid; v_s1 uuid; v_s2 uuid; v_s3 uuid;
  v_n integer; v_ts timestamptz; v_ts2 timestamptz;
begin
  perform set_config('request.jwt.claims', '', true);  -- Servicekontext
  select id into v_ed from event where is_edition and slug = 'fls27';

  insert into person (first_name, last_name) values ('Zoe', 'ZZTEST-Bestaetigt') returning id into v_p1;
  insert into person (first_name, last_name) values ('Zack', 'ZZTEST-Abgesagt') returning id into v_p2;
  insert into person (first_name, last_name) values ('Zilla', 'ZZTEST-Lead') returning id into v_p3;
  insert into person_email (person_id, email, is_primary) values
    (v_p1, 'zztest-bestaetigt@example.org', true),
    (v_p2, 'zztest-abgesagt@example.org', true),
    (v_p3, 'zztest-lead@example.org', true);

  -- 01 Vorbedingung: bestaetigt, aber ohne Zeitstempel. Der Trigger setzt ihn
  -- jetzt selbst — fuer den Export darf das keine Rolle spielen, deshalb wird er
  -- hier **nach** dem Anlegen wieder geleert (wie ein Altdaten-Import es taete).
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status)
  values (v_p1, v_ed, 'keynote', 'confirmed') returning id into v_s1;
  select confirmed_at into v_ts from speaker_profile where id = v_s1;
  insert into t_res values ('04_trigger_insert', case when v_ts is null then 'LEER (BUG)' else 'gesetzt' end);

  update speaker_profile set confirmed_at = null where id = v_s1;
  select confirmed_at into v_ts from speaker_profile where id = v_s1;
  insert into t_res values ('07_trigger_bei_leeren', case when v_ts is null then 'LEER (BUG)' else 'wieder gesetzt' end);

  -- Fuer 01 den Zeitstempel hart am Trigger vorbei leeren.
  alter table speaker_profile disable trigger trg_speaker_profile_confirmed_at;
  update speaker_profile set confirmed_at = null where id = v_s1;
  alter table speaker_profile enable trigger trg_speaker_profile_confirmed_at;
  select count(*) into v_n from event_app_speakers(v_ed) x where x.profile_id = v_s1;
  insert into t_res values ('01_ohne_zeitstempel_im_export', v_n::text || ' Zeile');

  -- 02 abgesagt
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, declined_at)
  values (v_p2, v_ed, 'keynote', 'confirmed', now()) returning id into v_s2;
  select count(*) into v_n from event_app_speakers(v_ed) x where x.profile_id = v_s2;
  insert into t_res values ('02_abgesagt_nicht_im_export', v_n::text || ' Zeile');

  -- 03 lead
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status)
  values (v_p3, v_ed, 'keynote', 'lead') returning id into v_s3;
  select count(*) into v_n from event_app_speakers(v_ed) x where x.profile_id = v_s3;
  insert into t_res values ('03_lead_nicht_im_export', v_n::text || ' Zeile');
  select confirmed_at into v_ts from speaker_profile where id = v_s3;
  insert into t_res values ('03b_lead_ohne_zeitstempel', case when v_ts is null then 'leer (richtig)' else 'GESETZT (BUG)' end);

  -- 05 Statuswechsel setzt den Zeitstempel
  update speaker_profile set pipeline_status = 'confirmed' where id = v_s3;
  select confirmed_at into v_ts from speaker_profile where id = v_s3;
  insert into t_res values ('05_trigger_statuswechsel', case when v_ts is null then 'LEER (BUG)' else 'gesetzt' end);

  -- 06 der erste Zeitpunkt gewinnt
  update speaker_profile set pipeline_status = 'onboarded' where id = v_s3;
  select confirmed_at into v_ts2 from speaker_profile where id = v_s3;
  insert into t_res values ('06_erster_gewinnt', case when v_ts2 = v_ts then 'unveraendert' else 'UEBERSCHRIEBEN (BUG)' end);

  -- 08 Rueckstufung: Zeitstempel bleibt, Export nicht
  update speaker_profile set pipeline_status = 'lead' where id = v_s3;
  select confirmed_at into v_ts2 from speaker_profile where id = v_s3;
  select count(*) into v_n from event_app_speakers(v_ed) x where x.profile_id = v_s3;
  insert into t_res values ('08_rueckstufung',
    (case when v_ts2 is null then 'Zeitstempel WEG (BUG)' else 'Zeitstempel bleibt' end) || ', Export ' || v_n::text || ' Zeile');
end $$;

-- 09 Rechte
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
begin
  select id into v_ed from event where is_edition and slug = 'fls27';
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform count(*) from event_app_speakers(v_ed);
    insert into t_res values ('09_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('09_ohne_recht', 'abgewiesen ' || sqlstate); end;
end $$;

select * from t_res order by step;
rollback;

-- Lauf 25.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 10/10 gruen.
--   01 bestaetigt ohne Zeitstempel → 1 Zeile im Export (vorher 0 — der Befund);
--   02 abgesagt 0, 03 lead 0, 03b lead ohne Zeitstempel;
--   04 Trigger beim Anlegen, 05 beim Statuswechsel, 06 erster Zeitpunkt gewinnt,
--   07 auch wenn nur confirmed_at geleert wird;
--   08 Rueckstufung: Zeitstempel bleibt, Export 0 Zeile;
--   09 angemeldet ohne Team: abgewiesen 42501.
-- Bestand zum Zeitpunkt des Laufs: 5 Profile, 2 bestaetigt, davon 1 ohne
-- Zeitstempel — das ist die Zeile, die Teil 3 der Migration nachtraegt.
