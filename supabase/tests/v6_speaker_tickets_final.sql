-- Smoke-Test v6_speaker_tickets_final (Vorschlag, ADM-076, Plan-Auflagen 05.10.2026): Begleittickets beliebig (Kontingent je
-- Speaker), Lounge je Ticket, das Team legt an. Mit echtem Rollenwechsel; vor jedem Abschnitt steht, welche Rolle gilt.
--   01 Aufbau: ein bestätigter Speaker (die Testperson selbst), Eigenticket entsteht per Trigger, Kontingent 1 (Standard).
--   02 Speaker (keine Rolle): erste Begleitung ok; zweite ⇒ `quota_exceeded`; **dieselbe** Begleitung (auch in anderer Schreibweise)
--      ⇒ `companion_exists` (vor dem Kontingent); alle vier Team-Funktionen ⇒ 42501.
--   03 Team (area_lead_speaker): Kontingent erhöhen (Audit alt/neu mit person_id, ohne E-Mail), `team_add_companion_ticket` legt direkt
--      `approved` an (Lounge wie gesetzt, Mail an den Speaker **ohne** Adresse der Begleitung, Audit ohne Namen und Adresse; auch
--      `confirm_companion_ticket` gibt die Adresse nicht mehr in die Mail-Variablen — `mail_log.meta.vars` ist Klartext),
--      Dublette `companion_exists`, volles Kontingent `quota_exceeded`, Eingabeprüfung (E-Mail, Namen, Länge, Speaker selbst),
--      Gäste und nicht bestätigte Speaker ⇒ `not_eligible`; Kontingent nicht unter die aktiven (`quota_below_used`), 0..50 (22023).
--   04 Lounge: `set_ticket_lounge` nur Begleittickets (eigenes Ticket ⇒ `not_a_companion`, storniert ⇒ `ticket_cancelled`), Audit alt/neu,
--      unverändert ⇒ kein Audit; am **Eigenticket** folgt die Lounge dem Profil in jedem lebenden Stand, auch `valid` — die Begleitung nie.
--   05 Portal: `my_speaker_tickets` additiv (`companions[]`, `companion_quota`, `companion_used`; `companion` bleibt das jüngste aktive).
--   06 Kontingent 0: nach dem Stornieren Kontingent 0 ⇒ jede Anfrage `quota_exceeded`.
--   07 Form: alter Unique-Index weg, neuer Teilindex fängt Direktes (23505); Vorlage ohne Adresse; kein EXECUTE für anon.
--   08 Löschweg: `anonymize_person` des Speakers leert Name, Adresse, Firma, Teamnotiz an **allen** seinen Begleittickets (auch den
--      stornierten), lässt Status und Anzahl stehen; die Begleitung am Profil eines anderen Speakers bleibt unberührt.
begin;
create temp table t_res (step text, result text) on commit drop;
-- Erwartung je Schritt als Muster: `99_auswertung` am Ende sagt „ok“ oder nennt die Schritte, die abweichen. Negativfälle
-- schreiben außerdem selbst `ALLOWED (BUG)`, wenn etwas durchgeht, das nicht darf.
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('01_aufbau', '^eigenes Ticket=true kontingent=1 alle_profile_standard_1=true$'),
  ('02_erste_begleitung', '^requested lounge=false$'),
  ('02_zweite_bei_kontingent_1', '^rejected P0001 quota_exceeded detail=1$'),
  ('02_dublette_andere_schreibweise', '^rejected P0001 companion_exists$'),
  ('02_team_add_als_speaker', '^rejected 42501$'),
  ('02_quota_als_speaker', '^rejected 42501$'),
  ('02_lounge_als_speaker', '^rejected 42501$'),
  ('02_kontingente_lesen_als_speaker', '^rejected 42501$'),
  ('02_unveraendert', '^1 Begleitung, Kontingent 1$'),
  ('03_quota_audit', '^alt=1 neu=3 person_id_vorhanden=true ohne_email=true$'),
  ('03_kontingente_lesen', '^kontingent=3 aktiv=1 eigenes_ticket=requested name=ZZ Speakerin$'),
  ('03_team_add', '^approved lounge=true angelegt_von_mir=true angefragt_von_mir=true$'),
  ('03_team_add_audit', '^person_id=true lounge=true ohne_adresse_und_namen=true$'),
  ('03_team_add_mail', '^1 Mail\(s\) ohne companion_email=true companion_name=B Zwei$'),
  ('03_bestaetigen_mail', '^1 Mail\(s\) ohne companion_email=true companion_name=A Eins status=approved ohne_adresse_im_protokoll=true$'),
  ('03_dublette', '^rejected P0001 companion_exists$'),
  ('03_dublette_grossgeschrieben', '^rejected P0001 companion_exists$'),
  ('03_dritte_bei_kontingent_3', '^approved lounge=false$'),
  ('03_vierte_bei_kontingent_3', '^rejected P0001 quota_exceeded detail=3$'),
  ('03_ungueltige_email', '^rejected 22023 invalid_email$'),
  ('03_name_fehlt', '^rejected 22023 name_required$'),
  ('03_name_zu_lang', '^rejected 22023 too_long detail=name$'),
  ('03_begleitung_ist_speaker', '^rejected 22023 companion_is_speaker$'),
  ('03_stage_guest', '^rejected P0001 not_eligible detail=stage_guest$'),
  ('03_nicht_bestaetigt', '^rejected P0001 not_eligible detail=lead$'),
  ('03_quota_unter_aktive', '^rejected P0001 quota_below_used detail=3$'),
  ('03_quota_51', '^rejected 22023 invalid_quota$'),
  ('03_quota_minus_1', '^rejected 22023 invalid_quota$'),
  ('03_quota_null', '^rejected 22023 invalid_quota$'),
  ('03_quota_gleich_kein_audit', '^ok$'),
  ('03_quota_profil_fehlt', '^rejected P0002 speaker_not_found$'),
  ('04_lounge_begleitung', '^true audit alt=false neu=true person_id=true ohne_email_und_namen=true$'),
  ('04_lounge_unveraendert_kein_audit', '^ok$'),
  ('04_lounge_eigenes_ticket', '^rejected P0001 not_a_companion detail=speaker$'),
  ('04_lounge_null', '^rejected 22023$'),
  ('04_lounge_ticket_fehlt', '^rejected P0002 ticket_not_found$'),
  ('04_profil_flag_an', '^eigenes_ticket\(requested\)=true begleitung_a\(blieb aus\)=false begleitung_b=true begleitung_c=true$'),
  ('04_profil_flag_aus_bei_valid', '^eigenes_ticket\(valid\)=false begleitung_b=true begleitung_c=true$'),
  ('04_profil_flag_wieder_an_bei_valid', '^eigenes_ticket\(valid\)=true$'),
  ('05_portal_form', '^companions=3 quota=3 used=3 companion_ist_juengstes=true reihenfolge=A,B,C lounge_je_begleitung=false,true,true own=true history_vorhanden=true$'),
  ('06_nach_storno', '^0 aktiv, 3 storniert$'),
  ('06_kontingent_0', '^rejected P0001 quota_exceeded detail=0$'),
  ('06_storniert_darf_wieder', '^approved \(gleiche Adresse wie die stornierte\)$'),
  ('07_alter_index_weg', '^0 alter, 1 neuer$'),
  ('07_index_faengt_direktes', '^rejected 23505$'),
  ('07_vorlage_ohne_adresse', '^de=false en=false'),
  ('07_execute_rechte', '^set_companion_quota\(uuid,integer\)=false/true set_ticket_lounge\(uuid,boolean\)=false/true speaker_ticket_quotas\(uuid\)=false/true team_add_companion_ticket\(uuid,text,text,text,boolean\)=false/true \(anon/authenticated\)$'),
  ('08_begleitungen_geleert', '^4 von 4 leer \(vorher 4\) status_gleich=true lounge_gleich=true$'),
  ('08_fremde_begleitung_bleibt', '^email=kontrolle@example.com name=K Kontrolle notiz=bleibt$');
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_sp uuid; v_own uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_n integer; v_s text; v_detail text; v_j jsonb; v_a jsonb; v_x uuid;
  v_gast_person uuid; v_gast uuid; v_lead_person uuid; v_lead uuid; v_laenge text; v_org uuid; v_l integer;
begin
  -- Eine Testperson mit Konto, die in der Edition noch **kein** Speaker-Profil hat (sonst hinge der Test am Bestand).
  select e.id into v_ed from event e where e.is_edition order by e.start_date desc limit 1;
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null
     and not exists (select 1 from speaker_profile sp where sp.person_id = p.id and sp.edition_id = v_ed)
   limit 1;
  if v_pid is null then raise exception 'Testvoraussetzung: eine Person mit Konto ohne Speaker-Profil in der jüngsten Edition fehlt'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  delete from role_assignment where person_id = v_pid;
  update person set first_name = 'ZZ', last_name = 'Speakerin' where id = v_pid;

  -- === 01 · Aufbau (als Owner) ===================================================================================
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, created_by)
    values (v_pid, v_ed, 'panelist', 'confirmed', now(), v_pid) returning id into v_sp;
  select t.id into v_own from ticket t where t.speaker_profile_id = v_sp and t.source = 'speaker' and t.status <> 'cancelled';
  insert into t_res values ('01_aufbau', 'eigenes Ticket=' || (v_own is not null)::text
    || ' kontingent=' || (select companion_quota::text from speaker_profile where id = v_sp)
    || ' alle_profile_standard_1=' || (select (min(companion_quota) = 1 and max(companion_quota) = 1)::text from speaker_profile));

  -- === 02 · Rolle: keine (die Speakerin selbst) =================================================================
  v_c1 := request_companion_ticket(v_sp, 'a@example.com', 'A', 'Eins');
  insert into t_res values ('02_erste_begleitung', (select status || ' lounge=' || lounge_access::text from ticket where id = v_c1));
  begin perform request_companion_ticket(v_sp, 'b@example.com', 'B', 'Zwei'); insert into t_res values ('02_zweite_bei_kontingent_1', 'ALLOWED (BUG)');
  exception when others then get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('02_zweite_bei_kontingent_1', 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_detail, '-')); end;
  begin perform request_companion_ticket(v_sp, 'A@Example.COM', 'A', 'Eins'); insert into t_res values ('02_dublette_andere_schreibweise', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('02_dublette_andere_schreibweise', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  begin perform team_add_companion_ticket(v_sp, 'x@example.com', 'X', 'Team', false); insert into t_res values ('02_team_add_als_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('02_team_add_als_speaker', 'rejected ' || sqlstate); end;
  begin perform set_companion_quota(v_sp, 5); insert into t_res values ('02_quota_als_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('02_quota_als_speaker', 'rejected ' || sqlstate); end;
  begin perform set_ticket_lounge(v_c1, true); insert into t_res values ('02_lounge_als_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('02_lounge_als_speaker', 'rejected ' || sqlstate); end;
  begin perform * from speaker_ticket_quotas(v_ed); insert into t_res values ('02_kontingente_lesen_als_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('02_kontingente_lesen_als_speaker', 'rejected ' || sqlstate); end;
  insert into t_res values ('02_unveraendert', (select count(*)::text || ' Begleitung, Kontingent ' || (select companion_quota::text from speaker_profile where id = v_sp)
                                                  from ticket where speaker_profile_id = v_sp and source = 'speaker_companion' and status <> 'cancelled'));

  -- === 03 · Rolle: area_lead_speaker (das Team) ==================================================================
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  perform set_companion_quota(v_sp, 3);
  select a.before, a.after into v_j, v_a from audit_log a where a.action = 'ticket.companion_quota_set' and a.object_id = v_sp::text order by a.id desc limit 1;
  insert into t_res values ('03_quota_audit', 'alt=' || coalesce(v_j ->> 'quota', '-') || ' neu=' || coalesce(v_a ->> 'quota', '-') || ' person_id_vorhanden=' || ((v_a ->> 'person_id') = v_pid::text)::text
    || ' ohne_email=' || (not (v_j::text || v_a::text) ~* '@')::text);
  insert into t_res values ('03_kontingente_lesen', (select 'kontingent=' || q.companion_quota::text || ' aktiv=' || q.companions_active::text || ' eigenes_ticket=' || coalesce(q.own_status, '-') || ' name=' || q.speaker_name
                                                       from speaker_ticket_quotas(v_ed) q where q.profile_id = v_sp));
  v_c2 := team_add_companion_ticket(v_sp, 'b@example.com', 'B', 'Zwei', true);
  insert into t_res values ('03_team_add', (select status || ' lounge=' || lounge_access::text || ' angelegt_von_mir=' || (approved_by = v_pid)::text || ' angefragt_von_mir=' || (requested_by = v_pid)::text
                                              from ticket where id = v_c2));
  select a.after into v_a from audit_log a where a.action = 'ticket.companion_added_by_team' and a.object_id = v_c2::text;
  insert into t_res values ('03_team_add_audit', 'person_id=' || ((v_a ->> 'person_id') = v_pid::text)::text || ' lounge=' || (v_a ->> 'lounge')
    || ' ohne_adresse_und_namen=' || (not (v_a::text ~* '(@|Zwei|example)'))::text);
  insert into t_res values ('03_team_add_mail', (select count(*)::text || ' Mail(s) ohne companion_email=' || bool_and(not (meta -> 'vars' ? 'companion_email'))::text
                                                   || ' companion_name=' || max(meta -> 'vars' ->> 'companion_name')
                                                   from mail_log where template_key = 'companion_ticket_confirmed' and related_type = 'ticket' and related_id = v_c2));
  -- Der andere Weg zur Bestätigung: die Speakerin hat A angefragt, das Team bestätigt — auch diese Mail trägt die Adresse nicht.
  perform confirm_companion_ticket(v_c1, 'Gerne');
  insert into t_res values ('03_bestaetigen_mail', (select count(*)::text || ' Mail(s) ohne companion_email=' || bool_and(not (meta -> 'vars' ? 'companion_email'))::text
                                                      || ' companion_name=' || max(meta -> 'vars' ->> 'companion_name') || ' status=' || (select status from ticket where id = v_c1)
                                                      || ' ohne_adresse_im_protokoll=' || bool_and(not (meta::text ~* '@'))::text
                                                      from mail_log where template_key = 'companion_ticket_confirmed' and related_type = 'ticket' and related_id = v_c1));
  begin perform team_add_companion_ticket(v_sp, 'b@example.com', 'B', 'Zwei', false); insert into t_res values ('03_dublette', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_dublette', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  begin perform team_add_companion_ticket(v_sp, 'B@EXAMPLE.com', 'B', 'Zwei', false); insert into t_res values ('03_dublette_grossgeschrieben', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_dublette_grossgeschrieben', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  v_c3 := team_add_companion_ticket(v_sp, 'c@example.com', 'C', 'Drei', false);
  insert into t_res values ('03_dritte_bei_kontingent_3', (select status || ' lounge=' || lounge_access::text from ticket where id = v_c3));
  begin perform team_add_companion_ticket(v_sp, 'd@example.com', 'D', 'Vier', false); insert into t_res values ('03_vierte_bei_kontingent_3', 'ALLOWED (BUG)');
  exception when others then get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_vierte_bei_kontingent_3', 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_detail, '-')); end;
  -- Eingabeprüfung
  begin perform team_add_companion_ticket(v_sp, 'kein-mail', 'E', 'Fuenf', false); insert into t_res values ('03_ungueltige_email', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_ungueltige_email', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  begin perform team_add_companion_ticket(v_sp, 'e@example.com', ' ', 'Fuenf', false); insert into t_res values ('03_name_fehlt', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_name_fehlt', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  v_laenge := repeat('x', 101);
  begin perform team_add_companion_ticket(v_sp, 'e@example.com', v_laenge, 'Fuenf', false); insert into t_res values ('03_name_zu_lang', 'ALLOWED (BUG)');
  exception when others then get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_name_zu_lang', 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_detail, '-')); end;
  begin perform team_add_companion_ticket(v_sp, v_email, 'E', 'Fuenf', false); insert into t_res values ('03_begleitung_ist_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_begleitung_ist_speaker', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  -- Gäste der Standbühne und nicht bestätigte Speaker haben keine Begleittickets
  insert into person (first_name, last_name) values ('ZZ', 'Gast') returning id into v_gast_person;
  insert into person_email (person_id, email, is_primary) values (v_gast_person, 'zz-gast-' || v_gast_person::text || '@example.com', true);
  insert into organization (legal_name) values ('ZZ Gast GmbH') returning id into v_org;
  -- Die Regel `speaker_profile_stage_guest_chk`: ein Gast hat weder Lounge noch Reception noch Reisekosten noch Hospitality,
  -- kommt von einer Partner-Organisation und hat seine Einwilligung gegeben.
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, stage_guest, lounge_access,
                               reception_eligible, travel_costs_covered, hospitality_status, created_by_org_id, stage_guest_consent_at, created_by)
    values (v_gast_person, v_ed, 'panelist', 'confirmed', now(), true, false, false, false, 'none', v_org, now(), v_pid) returning id into v_gast;
  begin perform team_add_companion_ticket(v_gast, 'g@example.com', 'G', 'Gast', false); insert into t_res values ('03_stage_guest', 'ALLOWED (BUG)');
  exception when others then get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_stage_guest', 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_detail, '-')); end;
  insert into person (first_name, last_name) values ('ZZ', 'Lead') returning id into v_lead_person;
  insert into person_email (person_id, email, is_primary) values (v_lead_person, 'zz-lead-' || v_lead_person::text || '@example.com', true);
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, created_by)
    values (v_lead_person, v_ed, 'panelist', 'lead', v_pid) returning id into v_lead;
  begin perform team_add_companion_ticket(v_lead, 'l@example.com', 'L', 'Lead', false); insert into t_res values ('03_nicht_bestaetigt', 'ALLOWED (BUG)');
  exception when others then get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_nicht_bestaetigt', 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_detail, '-')); end;
  -- Kontingent nicht unter die aktiven, nur 0..50
  begin perform set_companion_quota(v_sp, 2); insert into t_res values ('03_quota_unter_aktive', 'ALLOWED (BUG)');
  exception when others then get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_quota_unter_aktive', 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_detail, '-')); end;
  begin perform set_companion_quota(v_sp, 51); insert into t_res values ('03_quota_51', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_quota_51', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  begin perform set_companion_quota(v_sp, -1); insert into t_res values ('03_quota_minus_1', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_quota_minus_1', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  begin perform set_companion_quota(v_sp, null); insert into t_res values ('03_quota_null', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_quota_null', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  select count(*) into v_n from audit_log where action = 'ticket.companion_quota_set' and object_id = v_sp::text;
  perform set_companion_quota(v_sp, 3);   -- derselbe Wert: kein Audit
  insert into t_res values ('03_quota_gleich_kein_audit', case when (select count(*) from audit_log where action = 'ticket.companion_quota_set' and object_id = v_sp::text) = v_n then 'ok' else 'FEHLER' end);
  begin perform set_companion_quota(gen_random_uuid(), 2); insert into t_res values ('03_quota_profil_fehlt', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_quota_profil_fehlt', 'rejected ' || sqlstate || ' ' || sqlerrm); end;

  -- === 04 · Lounge ================================================================================================
  perform set_ticket_lounge(v_c3, true);
  select a.before, a.after into v_j, v_a from audit_log a where a.action = 'ticket.lounge_set' and a.object_id = v_c3::text order by a.id desc limit 1;
  insert into t_res values ('04_lounge_begleitung', (select lounge_access::text from ticket where id = v_c3) || ' audit alt=' || coalesce(v_j ->> 'lounge', '-') || ' neu=' || coalesce(v_a ->> 'lounge', '-')
    || ' person_id=' || ((v_a ->> 'person_id') = v_pid::text)::text || ' ohne_email_und_namen=' || (not ((v_j::text || v_a::text) ~* '(@|Drei|example)'))::text);
  select count(*) into v_n from audit_log where action = 'ticket.lounge_set' and object_id = v_c3::text;
  perform set_ticket_lounge(v_c3, true);   -- unverändert: kein Audit
  insert into t_res values ('04_lounge_unveraendert_kein_audit', case when (select count(*) from audit_log where action = 'ticket.lounge_set' and object_id = v_c3::text) = v_n then 'ok' else 'FEHLER' end);
  begin perform set_ticket_lounge(v_own, true); insert into t_res values ('04_lounge_eigenes_ticket', 'ALLOWED (BUG)');
  exception when others then get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('04_lounge_eigenes_ticket', 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_detail, '-')); end;
  begin perform set_ticket_lounge(v_c3, null); insert into t_res values ('04_lounge_null', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_lounge_null', 'rejected ' || sqlstate); end;
  begin perform set_ticket_lounge(gen_random_uuid(), true); insert into t_res values ('04_lounge_ticket_fehlt', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_lounge_ticket_fehlt', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  -- Eine Quelle je Ticketart: das Profil-Flag zieht am Eigenticket nach — in jedem lebenden Stand, auch ausgestellt; die Begleitung bleibt
  update speaker_profile set lounge_access = true where id = v_sp;
  insert into t_res values ('04_profil_flag_an', 'eigenes_ticket(requested)=' || (select lounge_access::text from ticket where id = v_own)
    || ' begleitung_a(blieb aus)=' || (select lounge_access::text from ticket where id = v_c1)
    || ' begleitung_b=' || (select lounge_access::text from ticket where id = v_c2) || ' begleitung_c=' || (select lounge_access::text from ticket where id = v_c3));
  update ticket set status = 'valid', barcode = 'ZZTEST-' || substr(v_own::text, 1, 8), purchased_at = now() where id = v_own;   -- als wäre es ausgestellt
  update speaker_profile set lounge_access = false where id = v_sp;
  insert into t_res values ('04_profil_flag_aus_bei_valid', 'eigenes_ticket(valid)=' || (select lounge_access::text from ticket where id = v_own)
    || ' begleitung_b=' || (select lounge_access::text from ticket where id = v_c2) || ' begleitung_c=' || (select lounge_access::text from ticket where id = v_c3));
  update speaker_profile set lounge_access = true where id = v_sp;
  insert into t_res values ('04_profil_flag_wieder_an_bei_valid', 'eigenes_ticket(valid)=' || (select lounge_access::text from ticket where id = v_own));

  -- === 05 · Portal (wieder die Speakerin selbst) ===================================================================
  -- In einer Transaktion tragen alle drei denselben Zeitstempel; im Betrieb liegen Minuten dazwischen.
  update ticket set created_at = now() - interval '3 minutes' where id = v_c1;
  update ticket set created_at = now() - interval '2 minutes' where id = v_c2;
  update ticket set created_at = now() - interval '1 minute' where id = v_c3;
  delete from role_assignment where person_id = v_pid;
  v_j := my_speaker_tickets(v_ed);
  insert into t_res values ('05_portal_form', 'companions=' || jsonb_array_length(v_j -> 'companions')::text || ' quota=' || (v_j ->> 'companion_quota') || ' used=' || (v_j ->> 'companion_used')
    || ' companion_ist_juengstes=' || ((v_j -> 'companion' ->> 'id') = v_c3::text)::text
    || ' reihenfolge=' || (select string_agg(left(x ->> 'first_name', 1), ',' order by ord) from jsonb_array_elements(v_j -> 'companions') with ordinality as t(x, ord))
    || ' lounge_je_begleitung=' || (select string_agg((x ->> 'lounge_access'), ',' order by ord) from jsonb_array_elements(v_j -> 'companions') with ordinality as t(x, ord))
    || ' own=' || ((v_j -> 'own' ->> 'id') = v_own::text)::text || ' history_vorhanden=' || (v_j ? 'companion_history')::text);

  -- === 06 · Stornieren und Kontingent 0 =============================================================================
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  perform cancel_companion_ticket(v_c1);
  perform cancel_companion_ticket(v_c2);
  perform cancel_companion_ticket(v_c3);
  insert into t_res values ('06_nach_storno', (select count(*)::text || ' aktiv, ' || (select count(*)::text from ticket where speaker_profile_id = v_sp and source = 'speaker_companion' and status = 'cancelled') || ' storniert'
                                                 from ticket where speaker_profile_id = v_sp and source = 'speaker_companion' and status <> 'cancelled'));
  perform set_companion_quota(v_sp, 0);
  delete from role_assignment where person_id = v_pid;
  begin perform request_companion_ticket(v_sp, 'a@example.com', 'A', 'Eins'); insert into t_res values ('06_kontingent_0', 'ALLOWED (BUG)');
  exception when others then get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('06_kontingent_0', 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_detail, '-')); end;
  -- eine stornierte Begleitung darf wieder angelegt werden, sobald Platz ist
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  perform set_companion_quota(v_sp, 1);
  v_x := team_add_companion_ticket(v_sp, 'a@example.com', 'A', 'Eins', false);
  insert into t_res values ('06_storniert_darf_wieder', (select status from ticket where id = v_x) || ' (gleiche Adresse wie die stornierte)');
  delete from role_assignment where person_id = v_pid;

  -- === 07 · Form ==================================================================================================
  insert into t_res values ('07_alter_index_weg', (select count(*)::text from pg_indexes where indexname = 'ticket_speaker_companion_uidx') || ' alter, '
    || (select count(*)::text from pg_indexes where indexname = 'ticket_speaker_companion_email_uidx') || ' neuer');
  begin
    insert into ticket (event_id, speaker_profile_id, pass_type, lounge_access, holder_email, holder_first_name, holder_last_name, status, personalization_status, price_cents, source)
      values (v_ed, v_sp, null, false, 'A@EXAMPLE.com', 'A', 'Eins', 'requested', 'partial', 0, 'speaker_companion');
    insert into t_res values ('07_index_faengt_direktes', 'ALLOWED (BUG)');
  exception when unique_violation then insert into t_res values ('07_index_faengt_direktes', 'rejected 23505'); end;
  insert into t_res values ('07_vorlage_ohne_adresse', 'de=' || (select (body_md like '%{{companion_email}}%')::text from mail_template where key = 'companion_ticket_confirmed' and locale = 'de')
    || ' en=' || (select (body_md like '%{{companion_email}}%')::text from mail_template where key = 'companion_ticket_confirmed' and locale = 'en')
    || ' (false = Platzhalter ersetzt)');
  insert into t_res values ('07_execute_rechte', (select string_agg(f || '=' || has_function_privilege('anon', f, 'execute')::text || '/' || has_function_privilege('authenticated', f, 'execute')::text, ' ' order by f)
    from unnest(array['team_add_companion_ticket(uuid,text,text,text,boolean)', 'set_companion_quota(uuid,integer)', 'set_ticket_lounge(uuid,boolean)', 'speaker_ticket_quotas(uuid)']) f)
    || ' (anon/authenticated)');

  -- === 08 · Löschweg: „Profil löschen“ des Speakers leert die Begleitungen (Name, Adresse), nicht die eines anderen ==========
  -- Gegenstück: eine Begleitung am Profil eines **anderen** Speakers (hier die Gast-Fixture von oben) muss stehen bleiben.
  insert into ticket (event_id, speaker_profile_id, pass_type, lounge_access, holder_email, holder_first_name, holder_last_name, team_note,
                      status, personalization_status, price_cents, source)
    values (v_ed, v_gast, null, true, 'kontrolle@example.com', 'K', 'Kontrolle', 'bleibt', 'approved', 'partial', 0, 'speaker_companion');
  update ticket set team_note = 'Rückfrage zur Begleitung', holder_company = 'Beispiel GmbH', extra_fields = '{"k":"v"}'::jsonb where id = v_x;
  select count(*), count(*) filter (where lounge_access), string_agg(status, ',' order by id) into v_n, v_l, v_s
    from ticket where speaker_profile_id = v_sp and source = 'speaker_companion';
  perform anonymize_person(v_pid);
  insert into t_res values ('08_begleitungen_geleert',
    (select count(*) filter (where holder_email is null and holder_first_name is null and holder_last_name is null and holder_company is null
                               and holder_position is null and buyer_email is null and team_note is null and extra_fields = '{}'::jsonb)::text
            || ' von ' || count(*)::text || ' leer (vorher ' || v_n::text || ') status_gleich=' || (string_agg(status, ',' order by id) = v_s)::text
            || ' lounge_gleich=' || (count(*) filter (where lounge_access) = v_l)::text
       from ticket where speaker_profile_id = v_sp and source = 'speaker_companion'));
  insert into t_res values ('08_fremde_begleitung_bleibt',
    (select 'email=' || coalesce(holder_email::text, 'NULL') || ' name=' || coalesce(holder_first_name, 'NULL') || ' ' || coalesce(holder_last_name, 'NULL')
            || ' notiz=' || coalesce(team_note, 'NULL')
       from ticket where speaker_profile_id = v_gast and source = 'speaker_companion'));
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;
