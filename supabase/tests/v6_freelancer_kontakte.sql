-- Smoke-Test 0114 (Freelancer als Ansprechpersonen · ADM-040). Belegt:
--   01 ohne Pflegerecht 42501;
--   02 Hausadresse ohne Einwilligungsdatum wird angenommen (unveraendert);
--   03 fremde Adresse ohne Datum ⇒ 22023 `contact_consent_required` (vorher `invalid_email`);
--   04 fremde Adresse mit Datum wird angenommen;
--   05 Namenskorrektur ohne erneutes Datum geht durch (Feld nicht mitgeschickt);
--   06 Datum ausdruecklich leeren ⇒ 22023 `contact_consent_required`;
--   07 der Buddy erscheint bei der betreuten Speakerin in `my_contacts()`;
--   08 Widerruf gibt den Bildpfad zurueck (die Serverroute raeumt das Foto weg);
--   09 der Grund steht mit Akteur im Protokoll (`contact.remove`, `consent_withdrawn`) —
--      und **ohne** Adresse und Telefonnummer, die die Löschung nicht überleben;
--   10 der Verweis am Speaker-Profil steht danach auf null (Rueckfall auf den Standard).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_sp uuid; v_sp_pid uuid; v_sp_uid uuid; v_sp_email text;
  v_id uuid; v_txt text; v_photo text; v_n integer;
begin
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  -- Verwaltende Person: eigener Login, Rollen werden erst gesetzt, wenn ein
  -- Schritt sie braucht (db-konventionen §6).
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 ohne Recht ------------------------------------------------------------
  begin
    perform upsert_edition_contact(jsonb_build_object('edition_id', v_ed, 'type', 'speaker_buddy',
      'display_name', 'ZZTEST Ohne Recht', 'email', 'zztest@chef-treff.de', 'phone', '+49 40 0'));
    insert into t_res values ('01_ohne_recht', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('01_ohne_recht', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from)
  values (v_pid, 'admin', 'global', null, null, now() - interval '1 hour');

  -- 02 Hausadresse ohne Datum ------------------------------------------------
  begin
    v_id := upsert_edition_contact(jsonb_build_object('edition_id', v_ed, 'type', 'speaker_lead',
      'display_name', 'ZZTEST Haus', 'email', 'zztest.haus@chef-treff.de', 'phone', '+49 40 1'));
    insert into t_res values ('02_hausadresse_ohne_datum', case when v_id is not null then 'angenommen (richtig)' else 'FEHLT' end);
  exception when others then insert into t_res values ('02_hausadresse_ohne_datum', 'ABGEWIESEN (BUG) ' || sqlstate || ' ' || sqlerrm); end;

  -- 03 fremde Adresse ohne Datum ---------------------------------------------
  begin
    perform upsert_edition_contact(jsonb_build_object('edition_id', v_ed, 'type', 'speaker_buddy',
      'display_name', 'ZZTEST Frei', 'email', 'zztest.frei@example.org', 'phone', '+49 40 2'));
    insert into t_res values ('03_fremd_ohne_datum', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('03_fremd_ohne_datum', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 04 fremde Adresse mit Datum ----------------------------------------------
  begin
    v_id := upsert_edition_contact(jsonb_build_object('edition_id', v_ed, 'type', 'speaker_buddy',
      'display_name', 'ZZTEST Frei', 'email', 'zztest.frei@example.org', 'phone', '+49 40 2',
      'photo_path', 'zztest-frei.jpg', 'contract_consent_at', '2026-09-01'));
    insert into t_res values ('04_fremd_mit_datum', case when v_id is not null then 'angenommen (richtig)' else 'FEHLT' end);
  exception when others then insert into t_res values ('04_fremd_mit_datum', 'ABGEWIESEN (BUG) ' || sqlstate || ' ' || sqlerrm); end;

  -- 05 Namenskorrektur ohne erneute Einwilligung ------------------------------
  begin
    perform upsert_edition_contact(jsonb_build_object('id', v_id::text, 'display_name', 'ZZTEST Freelancerin'));
    select display_name || '|' || coalesce(contract_consent_at::text, 'null') into v_txt
      from edition_contact where id = v_id;
    insert into t_res values ('05_namenskorrektur',
      case when v_txt = 'ZZTEST Freelancerin|2026-09-01' then 'Datum bleibt (richtig)' else 'unerwartet ' || v_txt end);
  exception when others then insert into t_res values ('05_namenskorrektur', 'ABGEWIESEN (BUG) ' || sqlstate || ' ' || sqlerrm); end;

  -- 06 Datum leeren ----------------------------------------------------------
  begin
    perform upsert_edition_contact(jsonb_build_object('id', v_id::text, 'contract_consent_at', ''));
    insert into t_res values ('06_datum_leeren', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('06_datum_leeren', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 07 Buddy erscheint bei der betreuten Speakerin ----------------------------
  select sp.id, p.id, p.auth_user_id, pe.email::text into v_sp, v_sp_pid, v_sp_uid, v_sp_email
    from speaker_profile sp
    join person p on p.id = sp.person_id and p.auth_user_id is not null
    join person_email pe on pe.person_id = p.id and pe.is_primary
   where sp.edition_id = v_ed limit 1;
  update speaker_profile set buddy_contact_id = v_id where id = v_sp;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_sp_uid, 'role', 'authenticated', 'email', v_sp_email)::text, true);
  select count(*)::integer into v_n from my_contacts(v_ed) c where c.id = v_id;
  insert into t_res values ('07_buddy_beim_speaker',
    case when v_n = 1 then 'sichtbar (richtig)' else 'FEHLT (' || v_n || ')' end);

  -- Zurueck in die Verwaltung.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 08 Widerruf gibt den Bildpfad zurueck -------------------------------------
  v_photo := delete_edition_contact(v_id, 'consent_withdrawn');
  insert into t_res values ('08_widerruf_bildpfad',
    case when v_photo = 'zztest-frei.jpg' then 'Pfad zurueck (richtig)' else 'unerwartet ' || coalesce(v_photo, 'null') end);

  -- 09 Grund im Protokoll -----------------------------------------------------
  select count(*)::integer into v_n from audit_log a
   where a.action = 'contact.remove' and a.object_id = v_id::text
     and a.after->>'reason' = 'consent_withdrawn'
     and a.before->>'display_name' = 'ZZTEST Freelancerin'
     and not (a.before ? 'email') and not (a.before ? 'phone')
     and a.actor_person_id = v_pid;
  insert into t_res values ('09_grund_im_protokoll',
    case when v_n = 1 then 'protokolliert ohne Kontaktdaten (richtig)' else 'FEHLT (' || v_n || ')' end);

  -- 10 Verweis am Speaker faellt auf null -------------------------------------
  select count(*)::integer into v_n from speaker_profile sp
   where sp.id = v_sp and sp.buddy_contact_id is null;
  insert into t_res values ('10_verweis_auf_null',
    case when v_n = 1 then 'null (richtig)' else 'FEHLT — Verweis steht noch' end);
end $$;
select * from t_res order by step;
rollback;
-- Lauf am 17.09. gegen die Datenbank (Migration + Test in einer Transaktion, rollback): 10/10 gruen.
-- Nachtrag 18.09. (Auflage Architektur-Session): Schritt 09 prueft jetzt auch, dass beim
-- Widerruf weder `email` noch `phone` im Protokoll stehen, waehrend das normale Loeschen einer
-- Dienstadresse unveraendert bleibt — beides einzeln nachgelaufen, gruen.
-- Nach dem Anwenden (20260918105038) am 18.09. live erneut gelaufen: 10/10 gruen.
