-- Smoke-Test „Ich moechte weggebracht werden" (SPK-032). Belegt:
--   01 die Spalte gibt es und steht auf false, solange niemand sie setzt;
--   02 `set_my_speaker_travel` schreibt sie;
--   03 ein Speichern **ohne** den Schluessel laesst sie stehen — das Formular
--      darf einen Abschnitt speichern, ohne den anderen zu leeren;
--   04 `my_speaker_travel` liefert sie zurueck;
--   05 die Teamliste fuehrt sie als eigene Spalte;
--   06 ohne Team-Rolle bleibt die Teamliste gesperrt (42501);
--   07 Grants: anon hat auf `speaker_travel_list` kein EXECUTE (der `drop`
--      nimmt die Rechte mit, `harden_definer_functions` setzt sie neu).
--
-- Probelauf der Build-Session am 22.09.2026 gegen die Live-Datenbank
-- (`sh scripts/db.sh dry-run`, alles zurueckgerollt): 8 von 8 Schritten gruen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_profile uuid;
  v_json jsonb; v_b boolean; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  select sp.id into v_profile from speaker_profile sp
   where sp.person_id = v_pid and sp.edition_id = v_ed limit 1;
  if v_profile is null then
    insert into speaker_profile (person_id, edition_id) values (v_pid, v_ed) returning id into v_profile;
  end if;
  delete from speaker_travel where profile_id = v_profile;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 · Vorgabe
  perform set_my_speaker_travel(jsonb_build_object('arrival_date', '2027-04-15'));
  select needs_dropoff into v_b from speaker_travel where profile_id = v_profile;
  insert into t_res values ('01_vorgabe_false',
    case when v_b is false then 'ok' else 'FEHLER ' || coalesce(v_b::text, 'null') end);

  -- 02 · setzen
  perform set_my_speaker_travel(jsonb_build_object('needs_dropoff', true));
  select needs_dropoff into v_b from speaker_travel where profile_id = v_profile;
  insert into t_res values ('02_setzen', case when v_b then 'ok' else 'FEHLER' end);

  -- 03 · ein Speichern ohne den Schluessel laesst den Wert stehen
  perform set_my_speaker_travel(jsonb_build_object('note', 'komme spaeter'));
  select needs_dropoff into v_b from speaker_travel where profile_id = v_profile;
  insert into t_res values ('03_bleibt_stehen',
    case when v_b then 'ok, nicht ueberschrieben' else 'FEHLER: still geleert' end);

  -- 04 · eigene Sicht
  v_json := my_speaker_travel();
  insert into t_res values ('04_eigene_sicht',
    case when (v_json->>'needs_dropoff')::boolean then 'ok'
         else 'FEHLER ' || coalesce(v_json->>'needs_dropoff', 'fehlt') end);

  -- 05/06 · Teamliste
  begin
    perform count(*) from speaker_travel_list();
    insert into t_res values ('06_ohne_rolle', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('06_ohne_rolle', 'abgewiesen ' || sqlstate);
  end;

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  select count(*)::integer into v_n from speaker_travel_list() l
   where l.profile_id = v_profile and l.needs_dropoff;
  insert into t_res values ('05_teamliste',
    case when v_n = 1 then 'ok, Spalte da und wahr' else 'FEHLER ' || v_n::text end);
  delete from role_assignment where person_id = v_pid;

  -- 07 · Grants nach dem drop/create
  insert into t_res values ('07_anon_gesperrt',
    case when has_function_privilege('anon', 'speaker_travel_list(uuid)', 'execute')
         then 'ERLAUBT (BUG)' else 'gesperrt' end);
  insert into t_res values ('07_authenticated_erlaubt',
    case when has_function_privilege('authenticated', 'speaker_travel_list(uuid)', 'execute')
         then 'ok' else 'FEHLER: der drop hat die Rechte mitgenommen' end);
end $$;
select * from t_res order by step;
rollback;
