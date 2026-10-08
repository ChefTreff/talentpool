-- Smoke-Test v6_partner_slots (Vorschlag, K-84 / LEAD-064): Partner legen auf Standbühne und gebrandeter Bühne selbst Slots an, verschieben und
-- löschen sie — im Fenster der Bühne, nur Inhalts-Slots, ohne Regie. Jede Prüfung hat ein Gegenstück (fremde Organisation, Hauptbühne ohne Partner,
-- Interview Table, Team, Stage Lead); „0 Treffer“ allein beweist nichts. Die handelnde Person ist ein Konto aus dem Bestand, dessen Rollen in der
-- Transaktion je Schritt wechseln (Partner A, Partner B, Team, Stage Lead, ohne Rolle) — die Funktionen prüfen `current_person_id()`, also die echte
-- Entscheidung. Die Aufrufe unter `set local role authenticated` belegen die Rechte der Rolle. Erwartung je Schritt als Muster in `t_erw`;
-- `99_auswertung` am Ende. Wegwerfdaten (ZZ …), alles wird zurückgerollt.
--   01 Form: Rechte der neuen Funktionen, `can_edit_stage` und die Regie unverändert.
--   02 `slot_outside_window` in Zeitpunkten (Ränder, offene Grenzen, 24:00, über Mitternacht).
--   03 `can_edit_stage_slots` je Rolle.
--   04 Anlegen auf der gebrandeten Bühne: Länge frei (7 Minuten, 3 Stunden; Wechselzeit und Standarddauer binden nicht), Ränder, vor der Öffnung und
--      nach dem Schluss `outside_partner_window`, über Mitternacht abgewiesen.
--   05 ohne Öffnungszeiten gilt der Tagesrahmen der Veranstaltung.
--   06 fremde Organisation, Hauptbühne ohne Partner, Interview Table, ohne Rolle: 42501; die eigene Standbühne geht.
--   07 nur Inhalts-Slots für den Partner; das Team legt Rahmen und feste Blöcke an.
--   08 Länge null und Überlappung abgewiesen, lückenlos aneinander geht.
--   09 Sperrzeiten des Events und der Bühne hart (auch fürs Team), Rahmen frei; Gültigkeitstage.
--   10 Verschieben: im Fenster, außerhalb, Bühne einer fremden Organisation, eigene Standbühne, fester Block, veröffentlichte Session; der Stage Lead
--      bleibt am Tagesrahmen gebunden — auch über Mitternacht (R4).
--   14 die Änderungsmail LEAD-063 entsteht, wenn der Partner einen veröffentlichten Slot verschiebt (steht im Ablauf direkt nach 10).
--   11 Löschen: Rechte, Abweisungen mit Gegenstücken, Audit, Verlauf, Session zurück ins Backlog, vom Team angelegte Slots.
--   12 Regie unverändert: auf der gebrandeten Bühne keine, auf der Standbühne wie bisher.
--   13 Gäste-Regel unverändert: ein Gast geht auf die Standbühne, nicht auf die gebrandete Bühne.
--   15 die Rechte der Rolle `authenticated`: anlegen, verschieben, löschen laufen; `anon` darf nicht (siehe 01).
-- Probelauf der Build-Session am 08.10.2026 gegen die Live-Datenbank nach 0282 (`sh scripts/db.sh dry-run`, alles zurückgerollt): 30 von 30
-- Erwartungen erfüllt. Mutationsproben an der Migration (39, je Regel eine): 38 rot, die 39. ist gleichwertig — die Untergrenze `before_open` in
-- Uhrzeiten statt in Zeitpunkten, denn der Beginn bestimmt den Tag, ein Unterschied entsteht nur am Ende. Mitlaufende Tests mit und ohne die
-- Migration (`v6_standbuehne_oeffnungszeiten`, `v6_standbuehne_regeln`, `v6_lead_tagesrahmen`, `v6_buehnen_stammdaten`, `v6_mail_verzoegert`):
-- gleiche Ergebnisse; `lead016_buehnen_sichtregel`, `v2_roles_programme` und `v6_standbuehnen_gaeste` brechen schon ohne die Migration am Live-Stand
-- ab (gleiche Meldung). `fn-diff`: vier geänderte Funktionen (`partner_window_binds`, `partner_booth_window`, `create_slot`, `move_slot`) und drei neue.
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('01_form', '^ok delete_authenticated=true delete_anon=false helfer_intern=true definer=true can_edit_stage_unveraendert=true regie_unveraendert=true$'),
  ('02_fenster_zeitpunkte', '^ok innen=false vor=true nach=true raender=false ohne_grenzen=false nur_beginn=true ende_24=false ueber_24=true ueber_nacht=true$'),
  ('03_recht_helfer', '^ok stand_a=true bra_a=true brb=false haupt=false tisch_a=false can_edit_stage_bra=false can_edit_stage_stand=true team=true lead_haupt=true lead_bra=false$'),
  ('04_laenge_frei', '^ok ok ok drei_inhalts_slots=true$'),
  ('04_raender', '^ok ok$'),
  ('04_vor_nach', '^P0001 outside_partner_window \| 10:00–16:00 / P0001 outside_partner_window \| 10:00–16:00$'),
  ('04_standbuehne_fenster', '^ok P0001 outside_partner_window \| 10:00–16:00 / P0001 outside_partner_window \| 10:00–16:00$'),
  ('04_mitternacht', '^P0001 outside_partner_window \| –24:00 / ok$'),
  ('05_tagesrahmen', '^P0001 outside_partner_window \| 09:00–18:00 / ok / P0001 outside_partner_window \| 09:00–18:00$'),
  ('06_fremd_und_arten', '^brb=42501 not allowed on this stage haupt=42501 not allowed on this stage tisch=42501 not allowed on this stage stand=ok ohne_rolle=42501 not allowed on this stage partner_b_auf_a=42501 not allowed on this stage partner_b_auf_b=ok$'),
  ('07_slot_art', '^frame=P0001 slot_type_not_allowed \| frame fixed=P0001 slot_type_not_allowed \| fixed_block placeholder=P0001 slot_type_not_allowed \| placeholder partner_block=P0001 slot_type_not_allowed \| partner_block leer=P0001 slot_type_not_allowed \| null stand_frame=P0001 slot_type_not_allowed \| frame team_frame=ok team_block=ok$'),
  ('08_laenge_ueberlappung', '^null=22023 end must be after start umgekehrt=22023 end must be after start ueberlappung=23P01 anschluss=ok$'),
  ('09_sperren', '^ok event=P0001 slot_blocked \| ZZ Sperre Event · 10:40–10:50 stage=P0001 slot_blocked \| ZZ Sperre Bühne · 11:00–11:10 andere_buehne=ok team=P0001 slot_blocked \| ZZ Sperre Event · 10:40–10:50 team_frame=ok$'),
  ('09_gueltig', '^ok tag2=P0001 stage_not_valid_that_day \| 17\.04\.2027 tag1=ok$'),
  ('10_verschieben', '^ok innen=ok aussen=P0001 outside_partner_window \| 10:00–16:00 fremde_buehne=42501 not allowed on target stage eigene_standbuehne=ok eigene_gebrandete=ok fester_block=42501 fixed blocks can only be moved by the programme team$'),
  ('10_veroeffentlicht', '^ok ohne=P0001 confirmation_required mit=ok$'),
  ('10_stage_lead', '^ok davor=P0001 outside_stage_day \| 10:00–18:00 ueber_nacht=P0001 outside_stage_day \| 10:00–18:00 innen=ok schieb_ueber_nacht=P0001 outside_stage_day \| 10:00–18:00 schieb_innen=ok team_davor=ok$'),
  ('10_warnungen', '^ok davor=\["before_open"\] danach=\["after_close"\] ueber_nacht=\["after_close"\] innen=\[\]$'),
  ('10_stage_lead_gebrandet', '^ok vor_rahmen=P0001 outside_stage_day \| 10:00–16:00 fester_block=ok frame=ok loeschen=42501 not allowed$'),
  ('14_aenderungsmail', '^ok mails=1 wartet=true$'),
  ('11_loeschen', '^ok slot_weg=true audit=true audit_ohne_adresse=true verlauf_vorher=true verlauf_weg=true$'),
  ('11_mit_entwurf', '^ok slot_weg=true session_bleibt=true session_ohne_slot=true$'),
  ('11_veroeffentlicht', '^ok veroeffentlicht=P0001 unpublish_first danach=ok$'),
  ('11_zugesagt', '^ok zugesagt=P0001 slot_locked \| 1 slot_bleibt=true$'),
  ('11_fremd_und_arten', '^ok partner_b=42501 not allowed fester_block=42501 not allowed frame=42501 not allowed haupt=42501 not allowed lead_haupt=42501 not allowed$'),
  ('11_vom_team_angelegt', '^ok team_legt_an=ok partner_loescht=ok slot_weg=true team_loescht_frame=ok team_loescht_block=ok team_loescht_haupt=ok$'),
  ('11_ohne_anmeldung', '^ok ohne_anmeldung=28000 not authenticated unbekannt=P0002 slot not found$'),
  ('12_regie', '^ok bra=false stand=true$'),
  ('13_gaeste_regel', '^ok stand=ok gebrandet=42501 not allowed$'),
  ('15_rolle_authenticated', '^ok anlegen=ok verschieben=ok loeschen=ok slot_weg=true$');

create function pg_temp.zz_ts(p_day date, p_zeit text) returns timestamptz language sql as $$
  select (p_day + p_zeit::time) at time zone 'Europe/Berlin'
$$;

-- Rollen der handelnden Person wechseln: alles weg, dann höchstens eine Rolle.
create function pg_temp.zz_rolle(p_person uuid, p_role text, p_scope text default 'global', p_scope_id uuid default null) returns void language plpgsql as $$
begin
  delete from role_assignment where person_id = p_person;
  if p_role is not null then
    insert into role_assignment (person_id, role, scope_type, scope_id) values (p_person, p_role, p_scope, p_scope_id);
  end if;
end $$;

-- Ergebnis eines Aufrufs als Text: `ok` oder `SQLSTATE meldung | detail`.
create function pg_temp.zz_neu(p_stage uuid, p_von timestamptz, p_bis timestamptz, p_art text default 'content') returns text language plpgsql as $$
declare v_d text;
begin
  perform create_slot(p_stage, p_von, p_bis, p_art);
  return 'ok';
exception when others then
  get stacked diagnostics v_d = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || coalesce(' | ' || nullif(v_d, ''), '');
end $$;

create function pg_temp.zz_schieb(p_slot uuid, p_stage uuid, p_von timestamptz, p_bis timestamptz, p_confirm boolean default false) returns text language plpgsql as $$
declare v_d text;
begin
  perform move_slot(p_slot, p_stage, p_von, p_bis, p_confirm);
  return 'ok';
exception when others then
  get stacked diagnostics v_d = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || coalesce(' | ' || nullif(v_d, ''), '');
end $$;

-- Die Warnungen eines Verschiebens als Text (`["before_open"]`); ein Fehler kommt als Text zurück.
create function pg_temp.zz_warn(p_slot uuid, p_stage uuid, p_von timestamptz, p_bis timestamptz) returns text language plpgsql as $$
declare v_j jsonb;
begin
  v_j := move_slot(p_slot, p_stage, p_von, p_bis, false);
  return (v_j->'warnings')::text;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

create function pg_temp.zz_weg(p_slot uuid) returns text language plpgsql as $$
declare v_d text;
begin
  perform delete_slot(p_slot);
  return 'ok';
exception when others then
  get stacked diagnostics v_d = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || coalesce(' | ' || nullif(v_d, ''), '');
end $$;

create function pg_temp.zz_gast(p_session uuid, p_profil uuid) returns text language plpgsql as $$
begin
  perform partner_assign_stage_guest(p_session, p_profil, true);
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

create function pg_temp.zz_person(p_nachname text) returns uuid language plpgsql as $$
declare v_p uuid;
begin
  insert into person (first_name, last_name) values ('ZZ', p_nachname) returning id into v_p;
  insert into person_email (person_id, email, is_primary) values (v_p, 'zz-ps-' || lower(p_nachname) || '-' || v_p::text || '@example.com', true);
  return v_p;
end $$;

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_claims text;
  v_ed uuid; v_vorlage uuid; v_ev uuid;
  d1 date := date '2027-04-16'; d2 date := date '2027-04-17'; d3 date := date '2027-04-18';
  o_a uuid; o_b uuid;
  s_bra uuid; s_stand uuid; s_brb uuid; s_haupt uuid; s_tisch uuid; s_valid uuid;
  sl_a uuid; sl_b uuid; sl_blk uuid; sl_frame uuid; sl_pub uuid; sl_x uuid; sl_y uuid; sl_z uuid; sl_h uuid; sl_t uuid; sl_s uuid;
  se_pub uuid; se_dr uuid; se_app uuid; se_stand uuid; se_bra uuid;
  p_spk uuid; p_app uuid; v_gast uuid; v_res jsonb;
  t1 timestamptz; t2 timestamptz; t3 timestamptz;
  v_r text; v_r2 text; v_n integer; v_b boolean;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null order by p.created_at limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  v_claims := json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text;
  perform set_config('request.jwt.claims', v_claims, true);
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_vorlage from event e where e.edition_id = v_ed and not e.is_edition limit 1;
  if v_ed is null or v_vorlage is null then raise exception 'VORBEDINGUNG: Edition fls27 oder Veranstaltung fehlt'; end if;

  -- Veranstaltung mit drei Tagen: Tag 1 und 3 mit Programm 09:00–18:00, Tag 2 ganz ohne Programmzeiten.
  insert into event (name, format_tag, edition_id, timezone, slug, start_date, end_date)
    select 'ZZ Partner-Slots', e.format_tag, v_ed, 'Europe/Berlin', 'zz-partner-slots-test', d1, d3 from event e where e.id = v_vorlage
    returning id into v_ev;
  insert into event_day (event_id, day_date, programme_start, programme_end, sort_order) values (v_ev, d1, time '09:00', time '18:00', 1);
  insert into event_day (event_id, day_date, sort_order) values (v_ev, d2, 2);
  insert into event_day (event_id, day_date, programme_start, programme_end, sort_order) values (v_ev, d3, time '09:00', time '18:00', 3);

  insert into organization (legal_name) values ('ZZ Partner A GmbH') returning id into o_a;
  insert into organization (legal_name) values ('ZZ Partner B GmbH') returning id into o_b;
  insert into org_edition (org_id, edition_id, onboarding_status) values (o_a, v_ed, 'invited');
  insert into org_edition (org_id, edition_id, onboarding_status) values (o_b, v_ed, 'invited');
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Eure Bühne A', 'main', o_a, true) returning id into s_bra;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Standbühne A', 'partner_booth', o_a, true) returning id into s_stand;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Eure Bühne B', 'main', o_b, true) returning id into s_brb;
  insert into stage (event_id, name, type, active) values (v_ev, 'ZZ Hauptbühne', 'main', true) returning id into s_haupt;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Tisch A', 'interview_table', o_a, true) returning id into s_tisch;
  insert into stage (event_id, name, type, partner_org_id, active, valid_days) values (v_ev, 'ZZ Eure Bühne nur Tag 1', 'main', o_a, true, array[d1]) returning id into s_valid;
  -- Öffnungszeiten 10:00–16:00 (Tag 1) für die Partnerbühnen, 10:00–18:00 für die Hauptbühne; Tag 2 und 3 ohne Zeile.
  insert into stage_day (stage_id, event_day_id, open_from, open_to)
    select x.id, ed.id, time '10:00', time '16:00' from (values (s_bra), (s_stand), (s_brb), (s_valid)) x(id)
      join event_day ed on ed.event_id = v_ev and ed.day_date = d1;
  insert into stage_day (stage_id, event_day_id, open_from, open_to)
    select s_haupt, ed.id, time '10:00', time '18:00' from event_day ed where ed.event_id = v_ev and ed.day_date = d1;

  -- === 01 Form ====================================================================================================
  insert into t_res values ('01_form',
    'ok delete_authenticated=' || has_function_privilege('authenticated', 'delete_slot(uuid)', 'execute')::text
    || ' delete_anon=' || has_function_privilege('anon', 'delete_slot(uuid)', 'execute')::text
    || ' helfer_intern=' || (not exists (
         select 1 from unnest(array['can_edit_stage_slots(uuid)', 'slot_outside_window(timestamptz, timestamptz, date, time, time, text)']) f
          where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')))::text
    || ' definer=' || (select bool_and(p.prosecdef and p.proconfig::text like '%search_path=public, extensions%') from pg_proc p
                        where p.oid in ('delete_slot(uuid)'::regprocedure, 'can_edit_stage_slots(uuid)'::regprocedure,
                                        'create_slot(uuid, timestamptz, timestamptz, text, uuid, text)'::regprocedure,
                                        'move_slot(uuid, uuid, timestamptz, timestamptz, boolean)'::regprocedure,
                                        'partner_window_binds(uuid)'::regprocedure, 'partner_booth_window(uuid, uuid)'::regprocedure))::text
    || ' can_edit_stage_unveraendert=' || (pg_get_functiondef('can_edit_stage(uuid)'::regprocedure) !~ 'branded')::text
    || ' regie_unveraendert=' || (pg_get_functiondef('can_edit_regie(uuid)'::regprocedure) ~ 'can_edit_stage\(p_stage_id\)'
                                  and pg_get_functiondef('can_edit_regie(uuid)'::regprocedure) !~ 'can_edit_stage_slots')::text);

  -- === 02 slot_outside_window =====================================================================================
  insert into t_res values ('02_fenster_zeitpunkte',
    'ok innen=' || slot_outside_window(pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '12:00'), d1, time '10:00', time '16:00', 'Europe/Berlin')::text
    || ' vor=' || slot_outside_window(pg_temp.zz_ts(d1, '09:45'), pg_temp.zz_ts(d1, '10:15'), d1, time '10:00', time '16:00', 'Europe/Berlin')::text
    || ' nach=' || slot_outside_window(pg_temp.zz_ts(d1, '15:45'), pg_temp.zz_ts(d1, '16:15'), d1, time '10:00', time '16:00', 'Europe/Berlin')::text
    || ' raender=' || slot_outside_window(pg_temp.zz_ts(d1, '10:00'), pg_temp.zz_ts(d1, '16:00'), d1, time '10:00', time '16:00', 'Europe/Berlin')::text
    || ' ohne_grenzen=' || slot_outside_window(pg_temp.zz_ts(d1, '03:00'), pg_temp.zz_ts(d1, '23:00'), d1, null::time, null::time, 'Europe/Berlin')::text
    || ' nur_beginn=' || slot_outside_window(pg_temp.zz_ts(d1, '09:00'), pg_temp.zz_ts(d1, '10:00'), d1, time '10:00', null::time, 'Europe/Berlin')::text
    || ' ende_24=' || slot_outside_window(pg_temp.zz_ts(d1, '22:00'), pg_temp.zz_ts(d1 + 1, '00:00'), d1, null::time, time '24:00', 'Europe/Berlin')::text
    || ' ueber_24=' || slot_outside_window(pg_temp.zz_ts(d1, '22:00'), pg_temp.zz_ts(d1 + 1, '00:30'), d1, null::time, time '24:00', 'Europe/Berlin')::text
    || ' ueber_nacht=' || slot_outside_window(pg_temp.zz_ts(d1, '18:30'), pg_temp.zz_ts(d1 + 1, '01:00'), d1, time '10:00', time '19:00', 'Europe/Berlin')::text);

  -- === 03 can_edit_stage_slots ====================================================================================
  perform pg_temp.zz_rolle(v_pid, 'standbuehne_editor', 'org', o_a);
  v_r := 'ok stand_a=' || can_edit_stage_slots(s_stand)::text || ' bra_a=' || can_edit_stage_slots(s_bra)::text
      || ' brb=' || can_edit_stage_slots(s_brb)::text || ' haupt=' || can_edit_stage_slots(s_haupt)::text
      || ' tisch_a=' || can_edit_stage_slots(s_tisch)::text
      || ' can_edit_stage_bra=' || can_edit_stage(s_bra)::text || ' can_edit_stage_stand=' || can_edit_stage(s_stand)::text;
  perform pg_temp.zz_rolle(v_pid, 'programme_team');
  v_r := v_r || ' team=' || can_edit_stage_slots(s_bra)::text;
  perform pg_temp.zz_rolle(v_pid, 'speaker_manager', 'stage', s_haupt);
  v_r := v_r || ' lead_haupt=' || can_edit_stage_slots(s_haupt)::text || ' lead_bra=' || can_edit_stage_slots(s_bra)::text;
  insert into t_res values ('03_recht_helfer', v_r);

  -- === 04 Anlegen auf der gebrandeten Bühne (Partner A, Fenster 10:00–16:00 an Tag 1) =============================
  perform pg_temp.zz_rolle(v_pid, 'standbuehne_editor', 'org', o_a);
  -- Vorgabe der Bühne: Wechselzeit 10 Minuten, Standarddauer 30 — beides bindet den Partner nicht.
  update stage set changeover_min = 10, default_duration_min = 30 where id = s_bra;
  v_r := pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '12:00'), pg_temp.zz_ts(d1, '12:07'));
  v_r := v_r || ' ' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '12:07'), pg_temp.zz_ts(d1, '12:30'));
  v_r := v_r || ' ' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '12:30'), pg_temp.zz_ts(d1, '15:30'));
  select count(*) = 3 into v_b from slot where stage_id = s_bra and slot_type = 'content';
  insert into t_res values ('04_laenge_frei', v_r || ' drei_inhalts_slots=' || v_b::text);
  insert into t_res values ('04_raender',
    pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '10:00'), pg_temp.zz_ts(d1, '10:30')) || ' '
    || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '15:30'), pg_temp.zz_ts(d1, '16:00')));
  insert into t_res values ('04_vor_nach',
    pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '09:45'), pg_temp.zz_ts(d1, '10:15')) || ' / '
    || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '15:50'), pg_temp.zz_ts(d1, '16:10')));
  -- Die Standbühne hält dasselbe Fenster (Gegenstück: die Regel gilt nicht nur für die gebrandete Bühne).
  insert into t_res values ('04_standbuehne_fenster',
    'ok ' || pg_temp.zz_neu(s_stand, pg_temp.zz_ts(d1, '09:30'), pg_temp.zz_ts(d1, '10:30')) || ' / '
    || pg_temp.zz_neu(s_stand, pg_temp.zz_ts(d1, '15:30'), pg_temp.zz_ts(d1, '16:30')));
  -- Tag 2 hat weder Öffnungszeiten noch Programmzeiten: Fenster –24:00. Über Mitternacht hinaus geht nicht, bis 00:00 des Folgetags schon.
  insert into t_res values ('04_mitternacht',
    pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d2, '22:00'), pg_temp.zz_ts(d2 + 1, '01:00')) || ' / '
    || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d2, '22:00'), pg_temp.zz_ts(d2 + 1, '00:00')));

  -- === 05 Tagesrahmen statt Öffnungszeiten (Tag 3: Programm 09:00–18:00, keine Zeile) ==========================
  insert into t_res values ('05_tagesrahmen',
    pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d3, '08:30'), pg_temp.zz_ts(d3, '09:30')) || ' / '
    || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d3, '17:00'), pg_temp.zz_ts(d3, '18:00')) || ' / '
    || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d3, '17:30'), pg_temp.zz_ts(d3, '18:30')));

  -- === 06 Fremde Bühnen, andere Arten, ohne Rolle ==================================================================
  v_r := 'brb=' || pg_temp.zz_neu(s_brb, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '11:30'))
      || ' haupt=' || pg_temp.zz_neu(s_haupt, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '11:30'))
      || ' tisch=' || pg_temp.zz_neu(s_tisch, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '11:30'))
      || ' stand=' || pg_temp.zz_neu(s_stand, pg_temp.zz_ts(d1, '14:00'), pg_temp.zz_ts(d1, '14:30'));
  perform pg_temp.zz_rolle(v_pid, null);
  v_r := v_r || ' ohne_rolle=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '11:30'));
  perform pg_temp.zz_rolle(v_pid, 'standbuehne_editor', 'org', o_b);
  v_r := v_r || ' partner_b_auf_a=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '11:30'))
      || ' partner_b_auf_b=' || pg_temp.zz_neu(s_brb, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '11:30'));
  insert into t_res values ('06_fremd_und_arten', v_r);

  -- === 07 Nur Inhalts-Slots für den Partner =======================================================================
  perform pg_temp.zz_rolle(v_pid, 'standbuehne_editor', 'org', o_a);
  v_r := 'frame=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '11:30'), 'frame')
      || ' fixed=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '11:30'), 'fixed_block')
      || ' placeholder=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '11:30'), 'placeholder')
      || ' partner_block=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '11:30'), 'partner_block')
      || ' leer=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '11:30'), null)
      || ' stand_frame=' || pg_temp.zz_neu(s_stand, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '11:30'), 'frame');
  perform pg_temp.zz_rolle(v_pid, 'programme_team');
  v_r := v_r || ' team_frame=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '16:30'), pg_temp.zz_ts(d1, '17:00'), 'frame')
      || ' team_block=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '17:00'), pg_temp.zz_ts(d1, '17:30'), 'fixed_block');
  insert into t_res values ('07_slot_art', v_r);
  select id into sl_frame from slot where stage_id = s_bra and slot_type = 'frame';
  select id into sl_blk from slot where stage_id = s_bra and slot_type = 'fixed_block';

  -- === 08 Länge und Überlappung ===================================================================================
  perform pg_temp.zz_rolle(v_pid, 'standbuehne_editor', 'org', o_a);
  v_r := 'null=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '11:00'))
      || ' umgekehrt=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '11:30'), pg_temp.zz_ts(d1, '11:00'));
  v_r2 := pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '12:03'), pg_temp.zz_ts(d1, '12:20'));
  v_r := v_r || ' ueberlappung=' || split_part(v_r2, ' ', 1)
      || ' anschluss=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '10:30'), pg_temp.zz_ts(d1, '10:31'));
  insert into t_res values ('08_laenge_ueberlappung', v_r);

  -- === 09 Sperrzeiten und Gültigkeitstage ==========================================================================
  insert into stage_blocked_time (event_id, stage_id, starts_at, ends_at, reason, created_by)
    values (v_ev, null, pg_temp.zz_ts(d1, '10:40'), pg_temp.zz_ts(d1, '10:50'), 'ZZ Sperre Event', v_pid);
  insert into stage_blocked_time (event_id, stage_id, starts_at, ends_at, reason, created_by)
    values (v_ev, s_bra, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '11:10'), 'ZZ Sperre Bühne', v_pid);
  v_r := 'ok event=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '10:35'), pg_temp.zz_ts(d1, '10:55'))
      || ' stage=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '10:55'), pg_temp.zz_ts(d1, '11:05'))
      || ' andere_buehne=' || pg_temp.zz_neu(s_stand, pg_temp.zz_ts(d1, '11:02'), pg_temp.zz_ts(d1, '11:08'));
  perform pg_temp.zz_rolle(v_pid, 'programme_team');
  v_r := v_r || ' team=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '10:35'), pg_temp.zz_ts(d1, '10:55'))
      || ' team_frame=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '10:35'), pg_temp.zz_ts(d1, '10:55'), 'frame');
  insert into t_res values ('09_sperren', v_r);
  perform pg_temp.zz_rolle(v_pid, 'standbuehne_editor', 'org', o_a);
  insert into t_res values ('09_gueltig',
    'ok tag2=' || pg_temp.zz_neu(s_valid, pg_temp.zz_ts(d2, '11:00'), pg_temp.zz_ts(d2, '11:30'))
    || ' tag1=' || pg_temp.zz_neu(s_valid, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '11:30')));

  -- === 10 Verschieben ==============================================================================================
  select id into sl_a from slot where stage_id = s_bra and start_at = pg_temp.zz_ts(d1, '12:00');
  -- Je Schritt eine eigene Anweisung: der Slot wandert von Schritt zu Schritt, die Reihenfolge darf nicht vom Ausdruck abhängen.
  v_r := 'ok innen=' || pg_temp.zz_schieb(sl_a, s_bra, pg_temp.zz_ts(d1, '11:30'), pg_temp.zz_ts(d1, '11:37'));
  v_r := v_r || ' aussen=' || pg_temp.zz_schieb(sl_a, s_bra, pg_temp.zz_ts(d1, '15:55'), pg_temp.zz_ts(d1, '16:20'));
  v_r := v_r || ' fremde_buehne=' || pg_temp.zz_schieb(sl_a, s_brb, pg_temp.zz_ts(d1, '12:00'), pg_temp.zz_ts(d1, '12:07'));
  v_r := v_r || ' eigene_standbuehne=' || pg_temp.zz_schieb(sl_a, s_stand, pg_temp.zz_ts(d1, '12:00'), pg_temp.zz_ts(d1, '12:07'));
  -- und zurück auf die eigene gebrandete Bühne: nur der neue Helfer lässt die Zielbühne zu (can_edit_stage allein sagte nein)
  v_r := v_r || ' eigene_gebrandete=' || pg_temp.zz_schieb(sl_a, s_bra, pg_temp.zz_ts(d1, '12:00'), pg_temp.zz_ts(d1, '12:07'));
  v_r := v_r || ' fester_block=' || pg_temp.zz_schieb(sl_blk, s_bra, pg_temp.zz_ts(d1, '17:30'), pg_temp.zz_ts(d1, '18:00'));
  insert into t_res values ('10_verschieben', v_r);

  -- Eine veröffentlichte Session auf einem Slot des Partners: Verschieben nur mit Bestätigung.
  p_spk := pg_temp.zz_person('Sprecher');
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at) values (p_spk, v_ed, 'panelist', 'confirmed', now());
  select id into sl_pub from slot where stage_id = s_bra and start_at = pg_temp.zz_ts(d1, '10:30');  -- der Anschluss-Slot aus 08
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status, partner_org_id)
    values (v_ev, sl_pub, 'talk', 'ZZ Talk', 'ZZ talk', 'Beschreibung', 'published', o_a) returning id into se_pub;
  insert into session_speaker (session_id, person_id, role) values (se_pub, p_spk, 'speaker');
  insert into t_res values ('10_veroeffentlicht',
    'ok ohne=' || pg_temp.zz_schieb(sl_pub, s_bra, pg_temp.zz_ts(d1, '11:20'), pg_temp.zz_ts(d1, '11:25'))
    || ' mit=' || pg_temp.zz_schieb(sl_pub, s_bra, pg_temp.zz_ts(d1, '11:20'), pg_temp.zz_ts(d1, '11:25'), true));

  -- === 14 Die Änderungsmail (LEAD-063) entsteht auch, wenn der Partner den veröffentlichten Slot verschiebt =========
  select count(*)::integer, bool_and(m.send_after is not null) into v_n, v_b
    from mail_log m where m.template_key = 'session_changed' and m.related_id = se_pub and m.status = 'queued';
  insert into t_res values ('14_aenderungsmail', 'ok mails=' || v_n::text || ' wartet=' || coalesce(v_b, false)::text);

  -- Der Stage Lead bleibt am Tagesrahmen gebunden, auch über Mitternacht (R4); das Team nicht.
  perform pg_temp.zz_rolle(v_pid, 'speaker_manager', 'stage', s_haupt);
  v_r := 'ok davor=' || pg_temp.zz_neu(s_haupt, pg_temp.zz_ts(d1, '09:30'), pg_temp.zz_ts(d1, '10:30'))
      || ' ueber_nacht=' || pg_temp.zz_neu(s_haupt, pg_temp.zz_ts(d1, '17:30'), pg_temp.zz_ts(d2, '01:00'))
      || ' innen=' || pg_temp.zz_neu(s_haupt, pg_temp.zz_ts(d1, '11:00'), pg_temp.zz_ts(d1, '12:00'));
  -- Dasselbe beim Verschieben: der Slot des Stage Leads darf nicht über Mitternacht hinaus, im Rahmen schon.
  select id into sl_h from slot where stage_id = s_haupt and start_at = pg_temp.zz_ts(d1, '11:00');
  v_r := v_r || ' schieb_ueber_nacht=' || pg_temp.zz_schieb(sl_h, s_haupt, pg_temp.zz_ts(d1, '17:30'), pg_temp.zz_ts(d2, '01:00'));
  v_r := v_r || ' schieb_innen=' || pg_temp.zz_schieb(sl_h, s_haupt, pg_temp.zz_ts(d1, '12:00'), pg_temp.zz_ts(d1, '13:00'));
  perform pg_temp.zz_rolle(v_pid, 'programme_team');
  v_r := v_r || ' team_davor=' || pg_temp.zz_neu(s_haupt, pg_temp.zz_ts(d1, '09:30'), pg_temp.zz_ts(d1, '10:30'));
  insert into t_res values ('10_stage_lead', v_r);
  -- Das Team ist nicht gebunden — die Warnungen `before_open` und `after_close` rechnen ebenfalls in Zeitpunkten (über Mitternacht: after_close).
  v_r := 'ok davor=' || pg_temp.zz_warn(sl_h, s_haupt, pg_temp.zz_ts(d1, '08:00'), pg_temp.zz_ts(d1, '08:30'));
  v_r := v_r || ' danach=' || pg_temp.zz_warn(sl_h, s_haupt, pg_temp.zz_ts(d1, '18:30'), pg_temp.zz_ts(d1, '19:00'));
  v_r := v_r || ' ueber_nacht=' || pg_temp.zz_warn(sl_h, s_haupt, pg_temp.zz_ts(d1, '17:30'), pg_temp.zz_ts(d2, '00:30'));
  v_r := v_r || ' innen=' || pg_temp.zz_warn(sl_h, s_haupt, pg_temp.zz_ts(d1, '12:00'), pg_temp.zz_ts(d1, '13:00'));
  insert into t_res values ('10_warnungen', v_r);

  -- Die Bühnenleitung einer gebrandeten Bühne ist nicht „der Partner“: sie bleibt am Tagesrahmen (`outside_stage_day`, nicht
  -- `outside_partner_window`), legt weiter jede Slot-Art an und löscht nicht.
  perform pg_temp.zz_rolle(v_pid, 'speaker_manager', 'stage', s_bra);
  select id into sl_y from slot where stage_id = s_bra and start_at = pg_temp.zz_ts(d1, '15:30');
  v_r := 'ok vor_rahmen=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '09:30'), pg_temp.zz_ts(d1, '09:50'));
  v_r := v_r || ' fester_block=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '10:31'), pg_temp.zz_ts(d1, '10:35'), 'fixed_block');
  v_r := v_r || ' frame=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '10:40'), pg_temp.zz_ts(d1, '10:45'), 'frame');
  v_r := v_r || ' loeschen=' || pg_temp.zz_weg(sl_y);
  insert into t_res values ('10_stage_lead_gebrandet', v_r);

  -- === 11 Löschen ==================================================================================================
  perform pg_temp.zz_rolle(v_pid, 'standbuehne_editor', 'org', o_a);
  select id into sl_x from slot where stage_id = s_bra and start_at = pg_temp.zz_ts(d1, '10:00');
  select count(*) > 0 into v_b from slot_history where slot_id = sl_x;
  v_r := pg_temp.zz_weg(sl_x);
  insert into t_res values ('11_loeschen',
    v_r || ' slot_weg=' || (not exists (select 1 from slot where id = sl_x))::text
    || ' audit=' || exists (select 1 from audit_log where action = 'slot.delete' and object_id = sl_x::text and actor_person_id = v_pid
                             and "before"->>'start_at' is not null and "before"->>'slot_type' = 'content' and "after" is null)::text
    || ' audit_ohne_adresse=' || (not exists (select 1 from audit_log where action = 'slot.delete' and object_id = sl_x::text
                                               and coalesce("before"::text, '') ~ '@'))::text
    || ' verlauf_vorher=' || v_b::text
    || ' verlauf_weg=' || (not exists (select 1 from slot_history where slot_id = sl_x))::text);

  -- Mit Entwurfs-Session: der Slot geht, die Session bleibt und liegt wieder im Backlog.
  select id into sl_y from slot where stage_id = s_bra and start_at = pg_temp.zz_ts(d1, '15:30');
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status, partner_org_id)
    values (v_ev, sl_y, 'talk', 'ZZ Entwurf', 'ZZ draft', 'Beschreibung', 'draft', o_a) returning id into se_dr;
  v_r := pg_temp.zz_weg(sl_y);
  insert into t_res values ('11_mit_entwurf',
    v_r || ' slot_weg=' || (not exists (select 1 from slot where id = sl_y))::text
    || ' session_bleibt=' || exists (select 1 from session where id = se_dr)::text
    || ' session_ohne_slot=' || exists (select 1 from session where id = se_dr and slot_id is null)::text);

  -- Veröffentlicht: erst zurückziehen. Danach geht es (Gegenstück).
  v_r2 := pg_temp.zz_weg(sl_pub);
  update session set publish_status = 'draft' where id = se_pub;
  insert into t_res values ('11_veroeffentlicht', 'ok veroeffentlicht=' || v_r2 || ' danach=' || pg_temp.zz_weg(sl_pub));

  -- Zugesagte Bewerbung: gesperrt, der Slot bleibt.
  p_app := pg_temp.zz_person('Bewerberin');
  select id into sl_z from slot where stage_id = s_bra and start_at = pg_temp.zz_ts(d1, '12:30');
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status, partner_org_id, access_mode)
    values (v_ev, sl_z, 'talk', 'ZZ Bewerbung', 'ZZ application', 'Beschreibung', 'draft', o_a, 'application') returning id into se_app;
  insert into application (session_id, person_id, status) values (se_app, p_app, 'accepted');
  v_r := pg_temp.zz_weg(sl_z);
  insert into t_res values ('11_zugesagt',
    'ok zugesagt=' || v_r || ' slot_bleibt=' || exists (select 1 from slot where id = sl_z)::text);

  -- Fremde Organisation, feste Blöcke, Rahmen, Hauptbühne, Stage Lead: alles 42501 (Gegenstück: der Partner A löscht seine eigenen Slots oben).
  select id into sl_h from slot where stage_id = s_stand limit 1;
  perform pg_temp.zz_rolle(v_pid, 'programme_team');
  v_r2 := pg_temp.zz_neu(s_haupt, pg_temp.zz_ts(d1, '14:00'), pg_temp.zz_ts(d1, '14:30'));
  if v_r2 <> 'ok' then raise exception 'VORBEDINGUNG: Slot auf der Hauptbühne: %', v_r2; end if;
  select id into sl_x from slot where stage_id = s_haupt and start_at = pg_temp.zz_ts(d1, '14:00');
  perform pg_temp.zz_rolle(v_pid, 'standbuehne_editor', 'org', o_b);
  v_r := 'ok partner_b=' || pg_temp.zz_weg(sl_h);
  perform pg_temp.zz_rolle(v_pid, 'standbuehne_editor', 'org', o_a);
  v_r := v_r || ' fester_block=' || pg_temp.zz_weg(sl_blk) || ' frame=' || pg_temp.zz_weg(sl_frame) || ' haupt=' || pg_temp.zz_weg(sl_x);
  perform pg_temp.zz_rolle(v_pid, 'speaker_manager', 'stage', s_haupt);
  v_r := v_r || ' lead_haupt=' || pg_temp.zz_weg(sl_x);
  insert into t_res values ('11_fremd_und_arten', v_r);

  -- Vom Team angelegte Inhalts-Slots darf der Partner löschen (R2); das Team löscht jede Art.
  perform pg_temp.zz_rolle(v_pid, 'programme_team');
  v_r := 'ok team_legt_an=' || pg_temp.zz_neu(s_bra, pg_temp.zz_ts(d1, '11:30'), pg_temp.zz_ts(d1, '11:45'));
  select id into sl_t from slot where stage_id = s_bra and start_at = pg_temp.zz_ts(d1, '11:30');
  perform pg_temp.zz_rolle(v_pid, 'standbuehne_editor', 'org', o_a);
  v_r2 := pg_temp.zz_weg(sl_t);  -- eigene Anweisung: der Löschaufruf und die Prüfung darunter dürfen nicht in einem Ausdruck stehen (Reihenfolge offen)
  v_r := v_r || ' partner_loescht=' || v_r2 || ' slot_weg=' || (not exists (select 1 from slot where id = sl_t))::text;
  perform pg_temp.zz_rolle(v_pid, 'programme_team');
  v_r := v_r || ' team_loescht_frame=' || pg_temp.zz_weg(sl_frame) || ' team_loescht_block=' || pg_temp.zz_weg(sl_blk)
      || ' team_loescht_haupt=' || pg_temp.zz_weg(sl_x);
  insert into t_res values ('11_vom_team_angelegt', v_r);

  -- Ohne Anmeldung (leere Ansprüche) und ein Slot, den es nicht gibt.
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.zz_weg(sl_blk);
  perform set_config('request.jwt.claims', v_claims, true);
  insert into t_res values ('11_ohne_anmeldung', 'ok ohne_anmeldung=' || v_r || ' unbekannt=' || pg_temp.zz_weg(gen_random_uuid()));

  -- === 12 Regie ====================================================================================================
  perform pg_temp.zz_rolle(v_pid, 'standbuehne_editor', 'org', o_a);
  insert into t_res values ('12_regie', 'ok bra=' || can_edit_regie(s_bra)::text || ' stand=' || can_edit_regie(s_stand)::text);

  -- === 13 Gäste-Regel ==============================================================================================
  -- Der Partner ist Hauptkontakt und Standbühnen-Editor seiner Organisation (wie im Test der Standbühnen-Gäste).
  insert into org_membership (org_id, person_id, roles) values (o_a, v_pid, array['primary_ops']);
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', o_a);
  v_res := partner_add_stage_guest(o_a, 'ZZ', 'Gast', 'Leitung Einkauf', 'ZZ Firma',
                                   'zz.gast.' || replace(gen_random_uuid()::text, '-', '') || '@example.org', true);
  v_gast := (v_res->>'profile_id')::uuid;
  select id into sl_b from slot where stage_id = s_bra and start_at = pg_temp.zz_ts(d1, '12:07');
  select id into sl_s from slot where stage_id = s_stand and start_at = pg_temp.zz_ts(d1, '14:00');
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, host_org_id, publish_status, tags)
    values (v_ev, sl_s, 'talk', 'ZZ Standtalk', 'ZZ stand talk', 'Beschreibung', o_a, 'draft', '{}') returning id into se_stand;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, host_org_id, publish_status, tags)
    values (v_ev, sl_b, 'talk', 'ZZ Bühnentalk', 'ZZ stage talk', 'Beschreibung', o_a, 'draft', '{}') returning id into se_bra;
  insert into t_res values ('13_gaeste_regel',
    'ok stand=' || pg_temp.zz_gast(se_stand, v_gast) || ' gebrandet=' || pg_temp.zz_gast(se_bra, v_gast));

  -- === 15 Die Rechte der Rolle `authenticated` =====================================================================
  perform pg_temp.zz_rolle(v_pid, 'standbuehne_editor', 'org', o_a);
  t1 := pg_temp.zz_ts(d1, '11:30'); t2 := pg_temp.zz_ts(d1, '11:45'); t3 := pg_temp.zz_ts(d1, '12:00');
  sl_x := null;
  execute 'set local role authenticated';
  begin
    sl_x := create_slot(s_bra, t1, t2);
    v_r := 'ok anlegen=ok';
  exception when others then v_r := 'ok anlegen=' || sqlstate || ' ' || sqlerrm; end;
  begin
    perform move_slot(sl_x, s_bra, t2, t3);
    v_r := v_r || ' verschieben=ok';
  exception when others then v_r := v_r || ' verschieben=' || sqlstate || ' ' || sqlerrm; end;
  begin
    perform delete_slot(sl_x);
    v_r := v_r || ' loeschen=ok';
  exception when others then v_r := v_r || ' loeschen=' || sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  insert into t_res values ('15_rolle_authenticated', v_r || ' slot_weg=' || (sl_x is not null and not exists (select 1 from slot where id = sl_x))::text);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;
