-- Smoke-Test v6_org_hiring (Vorschlag, K-94 Stufe 2a, PART-107): „Wen sucht ihr?“ je Organisation — Tabelle `org_hiring` mit RLS ohne Tabellenrecht, gelesen und geschrieben nur über
-- `partner_org_hiring`, `set_org_hiring`, `delete_org_hiring`. Echte Partnerrolle des angemeldeten Kontos (schreiben in Organisation A, nur lesen in Organisation L, keine Beziehung zu B),
-- danach die Teamrolle; Wegwerf-Organisationen, alles wird zurückgerollt. Jede Abweisung hat ihr Gegenstück (abgewiesen neben erlaubt); „0 Treffer“ allein beweist nichts, **NULL zählt als
-- Abweichung**. Erwartung je Schritt als Muster in `t_erw`, `99_auswertung` am Ende. Werte aus dem Bestand (`vocab_term`).
--   01 Anlegen: Werte getrimmt, Skills und Studienfelder sortiert und ohne Dubletten, `published` Voreinstellung aus, `created_by` die handelnde Person; Lesen liefert genau das.
--   02 Ändern: Felder und `updated_at`, Anzahl bleibt; ein Eintrag einer fremden Organisation 42501 (ändern **und** löschen), unbekannte Kennung P0002.
--   03 Werte: Pflichtfelder (`invalid_hiring` mit Feld), 120 Zeichen gehen, 121 nicht; unbekannter Wert je Gruppe `invalid_vocab`; **`nicht-interessiert` gesperrt, obwohl im Vokabular**
--      (Vorbedingung geprüft); leere Listen gehen.
--   04 Grenze: zehn Einträge gehen, der elfte `too_many_hiring`; Ändern am Limit geht; nach dem Löschen geht ein neuer.
--   05 Rechte: Leserin (Rolle ohne Bearbeitungsrecht) liest, schreibt aber nicht (42501 anlegen, ändern, löschen); Organisation ohne Beziehung 42501 beim Lesen; das Team liest und schreibt überall.
--   06 Tabelle: für `anon` und `authenticated` kein Zugriff (42501), RLS an; Funktionen für `authenticated` ja, `anon` nein; ohne Anmeldung 28000.
--   07 Audit: jeder Schreibweg steht drin, keiner mit Freitext oder Adresse. Kaskade: mit der Org-Edition gehen die Einträge.
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('01a_anlegen', '^ok rolle=true skills=true felder=true published=false created_by=true$'),
  ('01b_lesen', '^ok zeilen=1 gleich=true$'),
  ('01c_freigabe', '^ok published=true$'),
  ('01d_reihenfolge', '^ok nach_anlage=true$'),
  ('02a_aendern', '^ok geaendert=true anzahl=2 aktualisiert=true$'),
  ('02b_fremd_aendern', '^rejected 42501 not allowed$'),
  ('02c_fremd_loeschen', '^rejected 42501 not allowed$'),
  ('02d_unbekannt', '^rejected P0002 hiring_not_found$'),
  ('03a_ohne_kategorie', '^rejected 22023 invalid_hiring \[career_opportunity\]$'),
  ('03b_ohne_fachbereich', '^rejected 22023 invalid_hiring \[function_area\]$'),
  ('03c_rolle_121', '^rejected 22023 invalid_hiring \[role_text\]$'),
  ('03d_rolle_120', '^ok$'),
  ('03e_unbekannte_kategorie', '^rejected 22023 invalid_vocab \[career_opportunities:zz_unbekannt\]$'),
  ('03f_nicht_interessiert', '^rejected 22023 invalid_vocab \[career_opportunities:nicht-interessiert\]$'),
  ('03f_vorbedingung', '^ok im_vokabular=true$'),
  ('03g_unbekannter_fachbereich', '^rejected 22023 invalid_vocab \[function_area:zz_unbekannt\]$'),
  ('03h_unbekannter_skill', '^rejected 22023 invalid_vocab \[skill:zz_unbekannt\]$'),
  ('03i_unbekanntes_fach', '^rejected 22023 invalid_vocab \[study_field:zz_unbekannt\]$'),
  ('03j_leere_listen', '^ok skills=0 fach=0$'),
  ('04a_zehnter', '^ok anzahl=10$'),
  ('04b_elfter', '^rejected P0001 too_many_hiring \[10\]$'),
  ('04c_aendern_am_limit', '^ok$'),
  ('04d_nach_loeschen', '^ok anzahl=10$'),
  ('05a_leser_liest', '^ok zeilen=1$'),
  ('05b_leser_anlegen', '^rejected 42501 not allowed$'),
  ('05c_leser_aendern', '^rejected 42501 not allowed$'),
  ('05d_leser_loeschen', '^rejected 42501 not allowed$'),
  ('05e_ohne_beziehung_lesen', '^rejected 42501 not allowed$'),
  ('05f_team', '^ok liest=1 anlegen=true aendern=true loeschen=true$'),
  ('06a_tabelle_anon', '^rejected 42501 permission denied for table org_hiring$'),
  ('06b_tabelle_authenticated', '^rejected 42501 permission denied for table org_hiring$'),
  ('06c_form', '^ok rls=true policies=0 definer=3 pfad=3 auth_exec=3 anon_exec=0$'),
  ('06d_ohne_anmeldung', '^rejected 28000 not authenticated$'),
  ('06f_tabelle_pruefung', '^ok n=3$'),
  ('06e_ohne_org_edition', '^rejected P0002 org_edition_not_found \[[0-9a-f-]{36}\]$'),
  ('07a_audit', '^ok anlegen=[1-9][0-9]* aendern=[1-9][0-9]* entfernen=[1-9][0-9]* ohne_freitext=true$'),
  ('07b_kaskade', '^ok vorher=1 nachher=0$');

-- Ausführen und das Ergebnis als Zeile ablegen: „ok“ oder „rejected <SQLSTATE> <Meldung> [<detail>]“.
create function pg_temp.zz_r(p_step text, p_sql text, p_role text default null) returns void language plpgsql as $$
declare v_r text; v_d text;
begin
  begin
    if p_role is not null then execute 'set local role ' || quote_ident(p_role); end if;
    execute p_sql;
    v_r := 'ok';
  exception when others then
    get stacked diagnostics v_d = pg_exception_detail;
    v_r := 'rejected ' || sqlstate || ' ' || sqlerrm || case when coalesce(v_d, '') <> '' then ' [' || v_d || ']' else '' end;
  end;
  execute 'reset role';
  insert into t_res values (p_step, v_r);
end $$;

-- `set_org_hiring` als Aufruf-Text: Organisation, Eintrag (oder null), Kategorie, Fachbereich, Rolle, Skills, Studienfelder, Freigabe.
create function pg_temp.zz_set(p_org uuid, p_id uuid, p_k text, p_f text, p_rolle text, p_skills text, p_fach text, p_pub boolean default false) returns text language sql as $$
  select format('select set_org_hiring(%L, %L, %L, %L, %L, %L::text[], %L::text[], %L)', p_org, p_id, p_k, p_f, p_rolle, p_skills, p_fach, p_pub)
$$;

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_claims text;
  v_a uuid; v_l uuid; v_b uuid; v_oe_a uuid; v_oe_l uuid; v_oe_b uuid; v_oe_x uuid; v_x uuid;
  k1 text; k2 text; f1 text; f2 text; s1 text; s2 text; sf1 text; sf2 text;
  h1 uuid; h2 uuid; h_b uuid; h_l uuid; h_n uuid; v_n integer; v_r record; v_txt text; v_b1 boolean; v_b2 boolean; v_b3 boolean; v_t0 timestamptz;
  i integer; v_neu_n integer; v_chg_n integer; v_ent_n integer; v_arr uuid[];
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  if v_ed is null then raise exception 'VORBEDINGUNG: Edition fls27 fehlt'; end if;
  v_claims := json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text;

  -- Werte aus dem Bestand (je Gruppe die ersten aktiven Einträge, die Kategorie ohne „nicht-interessiert“).
  select (array_agg(key order by key))[1], (array_agg(key order by key))[2] into k1, k2 from vocab_term where vocabulary = 'career_opportunities' and active and key <> 'nicht-interessiert';
  select (array_agg(key order by key))[1], (array_agg(key order by key))[2] into f1, f2 from vocab_term where vocabulary = 'function_area' and active;
  select (array_agg(key order by key))[1], (array_agg(key order by key))[2] into s1, s2 from vocab_term where vocabulary = 'skill' and active;
  select (array_agg(key order by key))[1], (array_agg(key order by key))[2] into sf1, sf2 from vocab_term where vocabulary = 'study_field' and active;
  if k2 is null or f2 is null or s2 is null or sf2 is null then raise exception 'VORBEDINGUNG: Vokabular zu klein (%, %, %, %)', k2, f2, s2, sf2; end if;

  insert into organization (legal_name) values ('ZZ Hiring A GmbH') returning id into v_a;
  insert into organization (legal_name) values ('ZZ Hiring Leser GmbH') returning id into v_l;
  insert into organization (legal_name) values ('ZZ Hiring Fremd GmbH') returning id into v_b;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_a, v_ed, 'invited') returning id into v_oe_a;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_l, v_ed, 'invited') returning id into v_oe_l;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_b, v_ed, 'invited') returning id into v_oe_b;
  insert into org_membership (person_id, org_id, roles) values (v_pid, v_a, '{additional}'), (v_pid, v_l, '{event_app_member}');
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', v_a), (v_pid, 'partner_contact', 'org', v_l);
  -- Einträge der anderen Organisationen schreibt der Test als Eigentümer (Direktzugriff, nicht über die Funktion).
  insert into org_hiring (org_edition_id, career_opportunity, function_area, role_text) values (v_oe_b, k1, f1, 'ZZ fremde Rolle') returning id into h_b;
  insert into org_hiring (org_edition_id, career_opportunity, function_area, role_text) values (v_oe_l, k1, f1, 'ZZ Rolle der Leserin') returning id into h_l;

  perform set_config('request.jwt.claims', v_claims, true);
  if not partner_can_edit(v_a) then raise exception 'VORBEDINGUNG: Konto darf A nicht bearbeiten'; end if;
  if partner_can_edit(v_l) or not is_partner_of(v_l) then raise exception 'VORBEDINGUNG: Konto muss L nur lesen dürfen'; end if;

  -- 01 Anlegen und Lesen
  h1 := set_org_hiring(v_a, null, '  ' || k1 || ' ', f1, '  Werkstudent Data Engineering  ', array[s2, s1, s1, '  ' || s2], array[sf1], null);
  select * into v_r from org_hiring where id = h1;
  insert into t_res values ('01a_anlegen',
    case when v_r.role_text = 'Werkstudent Data Engineering' and v_r.skills = array(select unnest(array[s1, s2]) order by 1)
              and v_r.career_opportunity = k1 and v_r.function_area = f1 and v_r.study_fields = array[sf1]
              and not v_r.published and v_r.created_by = v_pid and v_r.org_edition_id = v_oe_a
         then 'ok rolle=true skills=true felder=true published=false created_by=true'
         else 'unerwartet: ' || coalesce(v_r::text, 'keine Zeile') end);
  select count(*)::integer, bool_and(x.career_opportunity = k1 and x.function_area = f1 and x.role_text = 'Werkstudent Data Engineering' and x.skills = v_r.skills and not x.published)
    into v_n, v_b1 from partner_org_hiring(v_a) x;
  insert into t_res values ('01b_lesen', 'ok zeilen=' || v_n || ' gleich=' || coalesce(v_b1::text, 'keine'));
  h2 := set_org_hiring(v_a, null, k2, f2, null, null, null, true);
  select published into v_b1 from org_hiring where id = h2;
  insert into t_res values ('01c_freigabe', 'ok published=' || coalesce(v_b1::text, 'keine Zeile'));
  -- Reihenfolge: nach Anlage (`now()` steht in einer Transaktion still, also die Zeiten setzen, wie sie in zwei Aufrufen wären).
  update org_hiring set created_at = now() - interval '2 hours' where id = h1;
  update org_hiring set created_at = now() - interval '1 hour' where id = h2;
  select array_agg(x.id) into v_arr from partner_org_hiring(v_a) x;
  insert into t_res values ('01d_reihenfolge', 'ok nach_anlage=' || coalesce(v_arr = array[h1, h2], false));

  -- 02 Ändern, fremder Eintrag, unbekannt
  update org_hiring set updated_at = now() - interval '1 day' where id = h1;   -- now() steht in einer Transaktion still: gegen einen alten Wert prüfen
  v_t0 := (select updated_at from org_hiring where id = h1);
  perform set_org_hiring(v_a, h1, k2, f2, 'Praktikum Marketing', array[s1], array[sf2], true);
  select * into v_r from org_hiring where id = h1;
  select count(*)::integer into v_n from partner_org_hiring(v_a);
  insert into t_res values ('02a_aendern',
    case when v_r.career_opportunity = k2 and v_r.function_area = f2 and v_r.role_text = 'Praktikum Marketing' and v_r.skills = array[s1] and v_r.study_fields = array[sf2] and v_r.published
         then 'ok geaendert=true anzahl=' || v_n || ' aktualisiert=' || (v_r.updated_at > v_t0)
         else 'unerwartet: ' || coalesce(v_r::text, 'keine Zeile') end);
  perform pg_temp.zz_r('02b_fremd_aendern', pg_temp.zz_set(v_a, h_b, k1, f1, 'ZZ übernommen', null, null));
  perform pg_temp.zz_r('02c_fremd_loeschen', format('select delete_org_hiring(%L)', h_b));
  perform pg_temp.zz_r('02d_unbekannt', format('select delete_org_hiring(%L)', gen_random_uuid()));

  -- 03 Werte
  perform pg_temp.zz_r('03a_ohne_kategorie', pg_temp.zz_set(v_a, null, '  ', f1, null, null, null));
  perform pg_temp.zz_r('03b_ohne_fachbereich', pg_temp.zz_set(v_a, null, k1, null, null, null, null));
  perform pg_temp.zz_r('03c_rolle_121', pg_temp.zz_set(v_a, null, k1, f1, repeat('x', 121), null, null));
  select count(*)::integer into v_n from org_hiring where org_edition_id = v_oe_a;
  perform pg_temp.zz_r('03d_rolle_120', pg_temp.zz_set(v_a, null, k1, f1, repeat('x', 120), null, null));
  perform pg_temp.zz_r('03e_unbekannte_kategorie', pg_temp.zz_set(v_a, null, 'zz_unbekannt', f1, null, null, null));
  insert into t_res values ('03f_vorbedingung', 'ok im_vokabular=' || is_vocab_key('career_opportunities', 'nicht-interessiert'));
  perform pg_temp.zz_r('03f_nicht_interessiert', pg_temp.zz_set(v_a, null, 'nicht-interessiert', f1, null, null, null));
  perform pg_temp.zz_r('03g_unbekannter_fachbereich', pg_temp.zz_set(v_a, null, k1, 'zz_unbekannt', null, null, null));
  perform pg_temp.zz_r('03h_unbekannter_skill', pg_temp.zz_set(v_a, null, k1, f1, null, '{zz_unbekannt}', null));
  perform pg_temp.zz_r('03i_unbekanntes_fach', pg_temp.zz_set(v_a, null, k1, f1, null, null, '{zz_unbekannt}'));
  -- Nach den Abweisungen steht nichts Zusätzliches da (nur der Eintrag der 120-Zeichen-Rolle kam dazu).
  h_n := (select id from org_hiring where org_edition_id = v_oe_a and role_text = repeat('x', 120));
  delete from org_hiring where id = h_n;   -- zurück auf zwei, für die Grenze
  h_n := set_org_hiring(v_a, null, k1, f1, null, '{}'::text[], null, false);
  select cardinality(skills), cardinality(study_fields) into v_n, i from org_hiring where id = h_n;
  insert into t_res values ('03j_leere_listen', 'ok skills=' || v_n || ' fach=' || i);
  delete from org_hiring where id = h_n;

  -- 04 Grenze: zehn je Organisation und Edition
  select count(*)::integer into v_n from org_hiring where org_edition_id = v_oe_a;   -- zwei
  for i in v_n + 1 .. 10 loop
    perform set_org_hiring(v_a, null, k1, f1, 'ZZ Eintrag ' || i, null, null, false);
  end loop;
  select count(*)::integer into v_n from org_hiring where org_edition_id = v_oe_a;
  insert into t_res values ('04a_zehnter', 'ok anzahl=' || v_n);
  perform pg_temp.zz_r('04b_elfter', pg_temp.zz_set(v_a, null, k1, f1, 'ZZ elfter', null, null));
  perform pg_temp.zz_r('04c_aendern_am_limit', pg_temp.zz_set(v_a, h1, k1, f1, 'ZZ geändert am Limit', null, null));
  perform delete_org_hiring(h2);
  perform set_org_hiring(v_a, null, k1, f1, 'ZZ nach dem Löschen', null, null, false);
  select count(*)::integer into v_n from org_hiring where org_edition_id = v_oe_a;
  insert into t_res values ('04d_nach_loeschen', 'ok anzahl=' || v_n);

  -- 05 Leserin und Team
  select count(*)::integer into v_n from partner_org_hiring(v_l);
  insert into t_res values ('05a_leser_liest', 'ok zeilen=' || v_n);
  perform pg_temp.zz_r('05b_leser_anlegen', pg_temp.zz_set(v_l, null, k1, f1, 'ZZ Leserin legt an', null, null));
  perform pg_temp.zz_r('05c_leser_aendern', pg_temp.zz_set(v_l, h_l, k1, f1, 'ZZ Leserin ändert', null, null));
  perform pg_temp.zz_r('05d_leser_loeschen', format('select delete_org_hiring(%L)', h_l));
  perform pg_temp.zz_r('05e_ohne_beziehung_lesen', format('select * from partner_org_hiring(%L)', v_b));
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  select count(*)::integer into v_n from partner_org_hiring(v_b);
  v_x := set_org_hiring(v_b, null, k2, f2, 'ZZ Team legt an', null, null, false);
  v_b1 := v_x is not null and exists (select 1 from org_hiring where id = v_x and org_edition_id = v_oe_b);
  -- In **zwei** Anweisungen: eine Unterabfrage im selben Ausdruck sähe die Änderung der Funktion nicht (Snapshot der äußeren Anweisung).
  h_n := set_org_hiring(v_b, v_x, k1, f1, 'ZZ Team ändert', null, null, true);
  v_b2 := h_n = v_x and (select role_text from org_hiring where id = v_x) = 'ZZ Team ändert';
  perform delete_org_hiring(v_x);
  v_b3 := not exists (select 1 from org_hiring where id = v_x);
  insert into t_res values ('05f_team', 'ok liest=' || v_n || ' anlegen=' || v_b1 || ' aendern=' || v_b2 || ' loeschen=' || v_b3);
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';

  -- 06 Tabelle, Form, ohne Anmeldung, ohne Org-Edition
  perform pg_temp.zz_r('06a_tabelle_anon', 'select count(*) from org_hiring', 'anon');
  perform pg_temp.zz_r('06b_tabelle_authenticated', 'select count(*) from org_hiring', 'authenticated');
  insert into t_res
  select '06c_form', 'ok rls=' || (select relrowsecurity from pg_class where oid = 'org_hiring'::regclass)
         || ' policies=' || (select count(*) from pg_policies where tablename = 'org_hiring')
         || ' definer=' || count(*) filter (where p.prosecdef)
         || ' pfad=' || count(*) filter (where coalesce(p.proconfig::text like '%search_path=public, extensions%', false))
         || ' auth_exec=' || count(*) filter (where has_function_privilege('authenticated', p.oid, 'execute'))
         || ' anon_exec=' || count(*) filter (where has_function_privilege('anon', p.oid, 'execute'))
    from pg_proc p where p.proname in ('partner_org_hiring', 'set_org_hiring', 'delete_org_hiring');
  -- Die Prüfungen der Tabelle halten auch, wenn jemand an den Funktionen vorbei schreibt (Service-Schlüssel, Skripte).
  v_n := 0;
  begin insert into org_hiring (org_edition_id, career_opportunity, function_area) values (v_oe_b, 'nicht-interessiert', f1); exception when check_violation then v_n := v_n + 1; end;
  begin insert into org_hiring (org_edition_id, career_opportunity, function_area, role_text) values (v_oe_b, k1, f1, repeat('x', 121)); exception when check_violation then v_n := v_n + 1; end;
  begin insert into org_hiring (org_edition_id, career_opportunity, function_area) values (v_oe_b, k1, '  '); exception when check_violation then v_n := v_n + 1; end;
  insert into t_res values ('06f_tabelle_pruefung', 'ok n=' || v_n);
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.zz_r('06d_ohne_anmeldung', pg_temp.zz_set(v_a, null, k1, f1, null, null, null));
  perform set_config('request.jwt.claims', v_claims, true);
  insert into organization (legal_name) values ('ZZ Hiring Ohne Edition GmbH') returning id into v_x;
  insert into org_membership (person_id, org_id, roles) values (v_pid, v_x, '{additional}');
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', v_x);
  perform pg_temp.zz_r('06e_ohne_org_edition', pg_temp.zz_set(v_x, null, k1, f1, null, null, null));

  -- 07 Audit und Kaskade
  select count(*) filter (where action = 'partner.org_hiring' and (after->>'neu')::boolean),
         count(*) filter (where action = 'partner.org_hiring' and not (after->>'neu')::boolean),
         count(*) filter (where action = 'partner.org_hiring_remove'),
         bool_and(position('Werkstudent' in coalesce(after::text, '')) = 0 and position('Praktikum Marketing' in coalesce(after::text, '')) = 0
                  and position('@' in coalesce(after::text, '') || coalesce(before::text, '')) = 0)
    into v_neu_n, v_chg_n, v_ent_n, v_b1
    from audit_log where object_type = 'org_edition' and object_id in (v_oe_a::text, v_oe_b::text) and action like 'partner.org_hiring%';
  insert into t_res values ('07a_audit', 'ok anlegen=' || v_neu_n || ' aendern=' || v_chg_n || ' entfernen=' || v_ent_n || ' ohne_freitext=' || coalesce(v_b1::text, 'keine'));
  select count(*)::integer into v_n from org_hiring where org_edition_id = v_oe_a;
  delete from org_edition where id = v_oe_a;
  insert into t_res values ('07b_kaskade', 'ok vorher=' || (case when v_n > 0 then 1 else 0 end) || ' nachher=' || (select count(*) from org_hiring where org_edition_id = v_oe_a));
end $$;

-- Auswertung: jede erwartete Zeile muss da sein und ihr Muster treffen; NULL ist keine Übereinstimmung.
insert into t_res
select '99_auswertung',
       case when exists (select 1 from t_erw e where not exists (select 1 from t_res r where r.step = e.step)) then
              'FEHLT: ' || (select string_agg(e.step, ', ') from t_erw e where not exists (select 1 from t_res r where r.step = e.step))
            when exists (select 1 from t_res r join t_erw e on e.step = r.step where coalesce(r.result, '') !~ e.muster) then
              'ABWEICHUNG: ' || (select string_agg(r.step || ' = ' || coalesce(r.result, 'NULL'), ' | ') from t_res r join t_erw e on e.step = r.step where coalesce(r.result, '') !~ e.muster)
            else 'alle ' || (select count(*) from t_erw) || ' Schritte richtig' end;

select * from t_res order by step;
rollback;
