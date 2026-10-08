-- Test zu `v6_auskuenfte_weg` (ADM-100). Belegt:
--   01 Tabelle edition_info und die fünf Funktionen sind weg (edition_infos, edition_infos_admin,
--      upsert_edition_info, delete_edition_info, can_edit_edition_info);
--   02 Gegenprobe: die Ansprechpartner-Seite läuft unverändert — edition_contact, edition_contacts_admin,
--      my_contacts, upsert_edition_contact, can_edit_edition_contacts sind da und edition_contacts_admin liefert
--      für einen Admin eine Liste (kein Fehler);
--   03 Gegenprobe: keine andere Funktion im Schema public verweist noch auf edition_info (Funktionstext);
--   04 Gegenprobe: keine Policy und keine Abhängigkeit (pg_depend) bleibt an der entfernten Tabelle (Namen der
--      Tabelle tauchen in keinem Katalog mehr auf);
--   05 Rechte: edition_contacts_admin ohne Recht ⇒ 42501 wie zuvor (kein Rechteverlust durch das Entfernen);
-- Die Löschsperre (Abbruch bei einer Zeile in edition_info) prüft `tests/auskuenfte-weg.test.ts` am Migrationstext: sie steht vor dem ersten drop.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_txt text; v_n integer; v_j jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;

  -- 01
  select 'tabelle=' || (to_regclass('public.edition_info') is not null)::text
      || ' funktionen=' || (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
                             where n.nspname = 'public'
                               and pr.proname in ('edition_infos', 'edition_infos_admin', 'upsert_edition_info', 'delete_edition_info', 'can_edit_edition_info'))
    into v_txt;
  insert into t_res values ('01_weg', v_txt || ' (erwartet tabelle=false funktionen=0)');

  -- 02
  select 'tabelle=' || (to_regclass('public.edition_contact') is not null)::text
      || ' funktionen=' || (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
                             where n.nspname = 'public'
                               and pr.proname in ('edition_contacts_admin', 'my_contacts', 'upsert_edition_contact', 'can_edit_edition_contacts'))
    into v_txt;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select count(*) into v_n from edition_contacts_admin();
  insert into t_res values ('02_ansprechpartner', v_txt || ' liste_laeuft=true zeilen=' || v_n
    || ' (erwartet tabelle=true funktionen=4 liste_laeuft=true)');

  -- 03
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
   where n.nspname = 'public' and pr.prokind = 'f' and pg_get_functiondef(pr.oid) ilike '%edition_info%';
  insert into t_res values ('03_keine_verweise', 'funktionen_mit_verweis=' || v_n || ' (erwartet 0)');

  -- 04
  select count(*) into v_n from pg_policies where tablename = 'edition_info';
  insert into t_res values ('04_keine_policy', 'policies=' || v_n
    || ' klassen=' || (select count(*) from pg_class where relname like 'edition_info%')
    || ' (erwartet policies=0 klassen=0)');

  -- 05
  delete from role_assignment where person_id = v_me;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform * from edition_contacts_admin(); v_txt := 'ERLAUBT'; exception when sqlstate '42501' then v_txt := '42501'; end;
  insert into t_res values ('05_ohne_recht', v_txt || ' (erwartet 42501)');
end $$;
select * from t_res order by step;
rollback;
