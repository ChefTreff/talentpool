-- Test zu `v6_mail_vorlagen_kategorie` (ADM-102). Belegt:
--   01 jede Vorlage im Bestand hat eine Zuordnung (keine Lücke), Zähler je Kategorie 14/11/7/6/5, Platzhalter aus den Texten;
--   02 Rechte je Kategorie (Rollen-Probe): admin sieht alles, partner_team nur Partner, talent_team nur Teilnehmer,
--      production_team ⇒ 42501; eine Kategorie, die die Person nicht bearbeiten darf, liefert 0 Zeilen;
--   03 Schreiben je Schlüssel: partner_team ändert eine Partner-Vorlage (Version +1), eine Speaker-Vorlage ⇒ 42501;
--      Verlauf und Wiederherstellen ebenso;
--   04 Paar: beide Sprachen zusammen (zwei Versionen, zwei Protokolleinträge); ein Fehler in einer Sprache schreibt keine;
--   05 Meta: Bereich ändert den Anzeigenamen, nicht die Kategorie (42501); admin verschiebt eine Vorlage — danach sieht
--      der Bereich sie nicht mehr; ungültige Kategorie ⇒ 22023; Platzhalter nur admin, ungültiges Zeichen ⇒ fields_required;
--   06 Vorlage ohne Zeile gilt als System (Bereich nicht, admin ja), set_mail_template_meta legt die Zeile an; Protokoll
--      `mail_template.meta`.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_txt text; v_n integer; v_m integer; v_v1 integer; v_v2 integer;
  v_de_alt integer; v_en_alt integer; v_aud integer;
  procedure_dummy text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;

  -- 01 · Bestand
  select count(*) into v_n from (select distinct key from mail_template) t where not exists (select 1 from mail_template_key k where k.key = t.key);
  select string_agg(category || '=' || c, ' ' order by category) into v_txt
    from (select category, count(*) c from mail_template_key group by category) x;
  select count(*) into v_m from mail_template_key where key = 'application_accepted' and 'first_name' = any (variables);
  insert into t_res values ('01_bestand', 'ohne_zeile=' || v_n || ' ' || v_txt || ' platzhalter_in_zusage=' || v_m
    || ' (erwartet ohne_zeile=0 participant=7 partner=11 speaker=14 system=5 volunteer=6 platzhalter_in_zusage=1)');

  -- Rolle setzen
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select count(*), count(*) filter (where de is not null and en is not null) into v_n, v_m from mail_templates_admin();
  v_txt := 'admin=' || v_n || '/' || v_m;

  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select count(*), count(*) filter (where category = 'partner') into v_n, v_m from mail_templates_admin();
  v_txt := v_txt || ' partner_team=' || v_n || '/' || v_m;
  select count(*) into v_n from mail_templates_admin('speaker');
  v_txt := v_txt || ' partner_team_speaker=' || v_n;

  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'talent_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select count(*), count(*) filter (where category = 'participant') into v_n, v_m from mail_templates_admin();
  v_txt := v_txt || ' talent_team=' || v_n || '/' || v_m;

  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'production_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform * from mail_templates_admin(); v_txt := v_txt || ' production_team=ERLAUBT'; exception when sqlstate '42501' then v_txt := v_txt || ' production_team=42501'; end;
  insert into t_res values ('02_rechte_je_kategorie', v_txt
    || ' (erwartet admin=43/N mit N≥1 partner_team=11/11 partner_team_speaker=0 talent_team=7/7 production_team=42501)');

  -- 03 · Schreiben je Schlüssel
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select version into v_v1 from mail_template where key = 'partner_deliverable_received' and locale = 'de';
  v_v2 := upsert_mail_template(jsonb_build_object('key', 'partner_deliverable_received', 'locale', 'de',
            'subject', 'ZZTEST Betreff', 'body_md', 'ZZTEST Text {{first_name}}'));
  v_txt := 'partner_version=' || v_v1 || '→' || v_v2;
  begin perform upsert_mail_template(jsonb_build_object('key', 'speaker_invite', 'locale', 'de', 'subject', 'x', 'body_md', 'y')); v_txt := v_txt || ' speaker=ERLAUBT';
  exception when sqlstate '42501' then v_txt := v_txt || ' speaker=42501'; end;
  select count(*) into v_n from mail_template_history('partner_deliverable_received', 'de');
  v_txt := v_txt || ' verlauf_partner=' || (v_n >= 1)::text;
  begin perform * from mail_template_history('speaker_invite', 'de'); v_txt := v_txt || ' verlauf_speaker=ERLAUBT'; exception when sqlstate '42501' then v_txt := v_txt || ' verlauf_speaker=42501'; end;
  begin perform restore_mail_template('speaker_invite', 'de', 'x', 'y'); v_txt := v_txt || ' restore_speaker=ERLAUBT'; exception when sqlstate '42501' then v_txt := v_txt || ' restore_speaker=42501'; end;
  insert into t_res values ('03_schreiben_je_schluessel', v_txt
    || ' (erwartet partner_version=n→n+1 speaker=42501 verlauf_partner=true verlauf_speaker=42501 restore_speaker=42501)');

  -- 04 · Paar
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select version into v_de_alt from mail_template where key = 'welcome' and locale = 'de';
  select version into v_en_alt from mail_template where key = 'welcome' and locale = 'en';
  select count(*) into v_aud from audit_log where action = 'mail_template.upsert' and object_id in ('welcome/de', 'welcome/en');
  perform upsert_mail_template_pair('welcome', jsonb_build_object('subject', 'ZZTEST DE', 'body_md', 'Hallo {{first_name}}'),
                                               jsonb_build_object('subject', 'ZZTEST EN', 'body_md', 'Hello {{first_name}}'));
  select count(*) into v_n from audit_log where action = 'mail_template.upsert' and object_id in ('welcome/de', 'welcome/en');
  insert into t_res values ('04a_paar', 'de=' || v_de_alt || '→' || (select version from mail_template where key = 'welcome' and locale = 'de')
    || ' en=' || v_en_alt || '→' || (select version from mail_template where key = 'welcome' and locale = 'en')
    || ' neue_protokolleintraege=' || (v_n - v_aud) || ' (erwartet beide +1, neue_protokolleintraege=2)');

  v_txt := '';
  begin
    -- Deutsch gültig, Englisch ungültig: die erste Sprache wird schon geschrieben, bevor die zweite scheitert —
    -- die Transaktion der Funktion nimmt sie wieder zurück.
    perform upsert_mail_template_pair('welcome', jsonb_build_object('subject', 'ZZTEST DE 2', 'body_md', 'x'), jsonb_build_object('subject', '', 'body_md', 'x'));
    v_txt := 'ANGENOMMEN';
  exception when sqlstate '22023' then v_txt := sqlerrm; end;
  insert into t_res values ('04b_paar_atomar', v_txt || ' de_blieb=' || ((select subject from mail_template where key = 'welcome' and locale = 'de') = 'ZZTEST DE')::text
    || ' version_de=' || (select version from mail_template where key = 'welcome' and locale = 'de')
    || ' (erwartet fields_required de_blieb=true version_de=2: weder Text noch Version der ersten Sprache bleiben stehen)');

  -- 05 · Meta
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  perform set_mail_template_meta('partner_deliverable_received', p_name_de => 'ZZTEST Name', p_name_en => 'ZZTEST Name EN');
  v_txt := 'name=' || (select name_de from mail_template_key where key = 'partner_deliverable_received');
  begin perform set_mail_template_meta('partner_deliverable_received', p_category => 'system'); v_txt := v_txt || ' kategorie=ERLAUBT'; exception when sqlstate '42501' then v_txt := v_txt || ' kategorie=42501'; end;
  begin perform set_mail_template_meta('partner_deliverable_received', p_variables => array['x']); v_txt := v_txt || ' variablen=ERLAUBT'; exception when sqlstate '42501' then v_txt := v_txt || ' variablen=42501'; end;
  insert into t_res values ('05a_meta_bereich', v_txt || ' (erwartet name=ZZTEST Name kategorie=42501 variablen=42501)');

  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform set_mail_template_meta('partner_deliverable_received', p_category => 'bunt'); v_txt := 'ANGENOMMEN'; exception when sqlstate '22023' then v_txt := sqlerrm; end;
  begin perform set_mail_template_meta('partner_deliverable_received', p_variables => array['ok', 'nicht ok']); v_txt := v_txt || ' / ANGENOMMEN'; exception when sqlstate '22023' then v_txt := v_txt || ' / ' || sqlerrm; end;
  perform set_mail_template_meta('partner_deliverable_received', p_variables => array['First_Name', 'portal_url', 'first_name']);
  v_txt := v_txt || ' variablen=' || (select array_to_string(variables, ',') from mail_template_key where key = 'partner_deliverable_received');
  perform set_mail_template_meta('partner_deliverable_received', p_category => 'speaker');
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select count(*) into v_n from mail_templates_admin() where key = 'partner_deliverable_received';
  begin perform upsert_mail_template(jsonb_build_object('key', 'partner_deliverable_received', 'locale', 'de', 'subject', 'a', 'body_md', 'b')); v_txt := v_txt || ' nach_verschieben=ERLAUBT';
  exception when sqlstate '42501' then v_txt := v_txt || ' nach_verschieben=42501'; end;
  insert into t_res values ('05b_meta_admin', v_txt || ' sichtbar_fuer_partner=' || v_n
    || ' (erwartet invalid_category / fields_required variablen=first_name,portal_url sichtbar_fuer_partner=0 nach_verschieben=42501)');

  -- 06 · ohne Zeile = System
  perform set_config('request.jwt.claims', '', true);
  insert into mail_template (key, locale, subject, body_md) values ('zztest_ohne_zeile', 'de', 'ZZTEST', 'ZZTEST');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_txt := 'abschnitt=' || mail_template_section('zztest_ohne_zeile') || ' bereich_darf=' || can_edit_mail_template('zztest_ohne_zeile')::text;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_txt := v_txt || ' admin_darf=' || can_edit_mail_template('zztest_ohne_zeile')::text;
  perform set_mail_template_meta('zztest_ohne_zeile', p_category => 'volunteer', p_name_de => 'ZZTEST', p_name_en => 'ZZTEST');
  v_txt := v_txt || ' angelegt=' || (select category from mail_template_key where key = 'zztest_ohne_zeile');
  select count(*) into v_n from audit_log where action = 'mail_template.meta' and object_id in ('zztest_ohne_zeile', 'partner_deliverable_received');
  begin perform set_mail_template_meta('gibt_es_nicht', p_name_de => 'x'); v_txt := v_txt || ' unbekannt=ANGENOMMEN'; exception when sqlstate 'P0002' then v_txt := v_txt || ' unbekannt=' || sqlerrm; end;
  insert into t_res values ('06_ohne_zeile', v_txt || ' meta_protokoll=' || v_n
    || ' (erwartet abschnitt=mail bereich_darf=false admin_darf=true angelegt=volunteer unbekannt=template_not_found meta_protokoll>=4)');
end $$;
select * from t_res order by step;
rollback;
