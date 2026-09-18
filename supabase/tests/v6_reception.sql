-- Smoke-Test 0125 (Speaker Reception). Belegt:
--   01 ohne `reception_eligible` ist die Liste **leer** — keine Fehlermeldung,
--      die verraet, dass es ueberhaupt eine Reception gibt;
--   02 und eine Anmeldung wird abgewiesen (P0001 reception_not_eligible);
--   03 mit Kennzeichen erscheint die Reception, aber nur die veroeffentlichte;
--   04 Zusage traegt ein, `taken` zaehlt Plaetze (Person + Begleitung);
--   05 ungueltiger Status und zu viele Begleitungen ⇒ 22023 invalid_rsvp;
--   06 die Obergrenze zaehlt **Plaetze**: eine Zusage mit Begleitung ueber die
--      Grenze ⇒ P0001 reception_full mit der Zahl freier Plaetze im detail;
--   07 die **eigene** bisherige Zusage zaehlt beim Aendern nicht mit — sonst
--      liesse sich eine Begleitung nie nachtragen, wenn es eng wird;
--   08 eine Absage gibt die Plaetze wieder frei und bleibt als Zeile stehen
--      (das Team unterscheidet „abgesagt" von „nie geantwortet");
--   09 nach der Frist ⇒ P0001 reception_closed;
--   10 `receptions_admin` und `reception_guests` ohne Speaker-Team ⇒ 42501;
--   11 mit Team-Rolle stimmen Zahlen und Gaesteliste;
--   12 Loeschen mit Zusagen ⇒ 22023 (has_guests), ohne Zusagen geht es;
--   13 Grants: Helfer gesperrt, beide Tabellen ohne Grants.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_profile uuid; v_rec uuid; v_entwurf uuid; v_eng uuid;
  v_n integer; v_detail text; v_txt text; v_res jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  -- Testperson ohne Vorrechte; `staff_user` gibt es seit 20260917183022 nicht mehr.
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  select sp.id into v_profile from speaker_profile sp
   where sp.person_id = v_pid and sp.edition_id = v_ed limit 1;
  if v_profile is null then
    insert into speaker_profile (person_id, edition_id) values (v_pid, v_ed) returning id into v_profile;
  end if;
  update speaker_profile set reception_eligible = false where id = v_profile;
  delete from speaker_reception where edition_id = v_ed and title_de like 'ZZ %';

  insert into speaker_reception (edition_id, title_de, title_en, location, starts_at, capacity, published)
    values (v_ed, 'ZZ Reception', 'ZZ Reception', 'Elbphilharmonie', now() + interval '180 days', 3, true)
    returning id into v_rec;
  insert into speaker_reception (edition_id, title_de, title_en, location, starts_at, published)
    values (v_ed, 'ZZ Entwurf', 'ZZ Draft', 'Irgendwo', now() + interval '181 days', false)
    returning id into v_entwurf;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 · ohne Kennzeichen leer
  select count(*) into v_n from my_receptions();
  insert into t_res values ('01_ohne_kennzeichen_leer',
    case when v_n = 0 then 'ok, leer' else 'FEHLER ' || v_n::text end);

  -- 02 · Anmeldung abgewiesen
  begin
    perform set_reception_rsvp(v_rec, 'yes', 0, null);
    insert into t_res values ('02_ohne_kennzeichen_anmeldung', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('02_ohne_kennzeichen_anmeldung',
      'abgewiesen ' || sqlstate || ' / ' || coalesce(v_detail, '-'));
  end;

  -- 03 · mit Kennzeichen: nur die veroeffentlichte
  update speaker_profile set reception_eligible = true where id = v_profile;
  select count(*) into v_n from my_receptions();
  select string_agg(m.title_de, ',') into v_txt from my_receptions() m;
  insert into t_res values ('03_nur_veroeffentlichte',
    case when v_n = 1 and v_txt = 'ZZ Reception' then 'ok' else 'FEHLER ' || v_n::text || ' / ' || coalesce(v_txt, '-') end);

  -- 04 · Zusage mit Begleitung
  v_res := set_reception_rsvp(v_rec, 'yes', 1, 'komme mit Begleitung');
  insert into t_res values ('04_zusage',
    case when (v_res->>'taken')::integer = 2 then 'ok, 2 Plaetze' else 'FEHLER ' || v_res::text end);

  -- 05 · ungueltige Eingaben
  begin
    perform set_reception_rsvp(v_rec, 'vielleicht', 0, null);
    insert into t_res values ('05a_status', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('05a_status', 'abgewiesen ' || sqlstate); end;
  begin
    perform set_reception_rsvp(v_rec, 'yes', 9, null);
    insert into t_res values ('05b_begleitungen', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('05b_begleitungen', 'abgewiesen ' || sqlstate); end;

  -- 06 · Obergrenze zaehlt Plaetze (Kapazitaet 3, zwei belegt)
  begin
    perform set_reception_rsvp(v_rec, 'yes', 3, null);
    insert into t_res values ('06_obergrenze', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('06_obergrenze', 'abgewiesen ' || sqlstate || ' / frei=' || coalesce(v_detail, '-'));
  end;

  -- 07 · eigene Zusage zaehlt beim Aendern nicht mit
  v_res := set_reception_rsvp(v_rec, 'yes', 2, null);
  insert into t_res values ('07_eigene_zaehlt_nicht_mit',
    case when (v_res->>'taken')::integer = 3 then 'ok, 3 Plaetze' else 'FEHLER ' || v_res::text end);

  -- 08 · Absage gibt frei und bleibt stehen
  perform set_reception_rsvp(v_rec, 'no', 0, null);
  select reception_taken(v_rec) into v_n;
  select count(*)::integer into v_n from speaker_reception_rsvp
   where reception_id = v_rec and profile_id = v_profile;
  insert into t_res values ('08_absage',
    case when reception_taken(v_rec) = 0 and v_n = 1
         then 'ok, frei und Zeile bleibt' else 'FEHLER belegt=' || reception_taken(v_rec)::text end);

  -- 09 · Frist abgelaufen
  update speaker_reception set rsvp_deadline = now() - interval '1 day' where id = v_rec;
  begin
    perform set_reception_rsvp(v_rec, 'yes', 0, null);
    insert into t_res values ('09_frist', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('09_frist', 'abgewiesen ' || sqlstate || ' / ' || coalesce(v_detail, '-'));
  end;
  update speaker_reception set rsvp_deadline = null where id = v_rec;

  -- 10 · Team-Sichten ohne Rolle
  begin
    perform count(*) from receptions_admin();
    insert into t_res values ('10a_adminliste', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('10a_adminliste', 'abgewiesen ' || sqlstate); end;
  begin
    perform count(*) from reception_guests(v_rec);
    insert into t_res values ('10b_gaesteliste', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('10b_gaesteliste', 'abgewiesen ' || sqlstate); end;

  -- 11 · mit Team-Rolle
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  perform set_reception_rsvp(v_rec, 'yes', 0, null);
  select a.yes_count into v_n from receptions_admin() a where a.id = v_rec;
  insert into t_res values ('11a_zahlen',
    case when v_n = 1 then 'ok' else 'FEHLER yes=' || coalesce(v_n::text, 'null') end);
  select count(*) into v_n from reception_guests(v_rec);
  insert into t_res values ('11b_gaesteliste', case when v_n = 1 then 'ok' else 'FEHLER ' || v_n::text end);
  -- Der Entwurf steht im Admin, aber nicht beim Speaker.
  select count(*) into v_n from receptions_admin() a where a.id = v_entwurf;
  insert into t_res values ('11c_entwurf_im_admin', case when v_n = 1 then 'ok' else 'FEHLER ' || v_n::text end);

  -- 12 · Loeschen
  begin
    perform delete_reception(v_rec);
    insert into t_res values ('12a_mit_zusagen', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('12a_mit_zusagen', 'abgewiesen ' || sqlstate || ' / ' || coalesce(v_detail, '-'));
  end;
  perform delete_reception(v_entwurf);
  select count(*) into v_n from speaker_reception where id = v_entwurf;
  insert into t_res values ('12b_ohne_zusagen', case when v_n = 0 then 'ok, geloescht' else 'FEHLER' end);

  -- 13 · Grants
  insert into t_res values ('13a_helfer_gesperrt',
    case when has_function_privilege('authenticated', 'reception_taken(uuid)', 'execute')
         then 'ERLAUBT (BUG)' else 'gesperrt' end);
  select count(*) into v_n from information_schema.role_table_grants
   where table_name in ('speaker_reception', 'speaker_reception_rsvp')
     and grantee in ('anon', 'authenticated');
  insert into t_res values ('13b_tabellen_grants',
    case when v_n = 0 then 'keine' else 'FEHLER ' || v_n::text end);
end $$;
select * from t_res order by step;
rollback;
