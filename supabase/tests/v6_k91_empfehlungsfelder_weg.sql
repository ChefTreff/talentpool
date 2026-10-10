-- Test zu `v6_k91_empfehlungsfelder_weg` (K-91, QS-075). Belegt:
--   01 die vier Spalten `invite_code`, `referred_by_person_id`, `is_ambassador`, `engagement_score` sind weg;
--      Fremdschlüssel, Index und Spalten-Grants mit ihnen;
--   02 keine Funktion der Datenbank nennt die Spalten noch (Katalogprobe über den Quelltext);
--   03 `person_merge_core` läuft: die zweite Person geht, die erste bleibt, ein leeres Feld wird gefüllt, ein volles nicht
--      überschrieben, der Bericht kennt keine Spalte `referred_by_person_id`; Adressen kommen mit;
--   04 `anonymize_person` läuft: Name, Telefon und Konto der Person sind leer, `deleted_at` gesetzt, die primäre Adresse ist die anonyme;
--   Die Zählprobe selbst (bricht bei einem Wert ab) steht im Quelltext der Migration und im Node-Test; sie lief gegen live mit 0/0/0/0 durch.
-- Läuft gegen die Datenbank mit der Migration (db.sh dry-run) und rollt zurück; es geht keine Mail raus.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_a uuid; v_b uuid; v_j jsonb; v_txt text; v_n integer;
begin
  -- 01
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'person'
     and column_name in ('invite_code', 'referred_by_person_id', 'is_ambassador', 'engagement_score');
  insert into t_res values ('01a_spalten_weg', v_n || ' (erwartet 0)');
  select (select count(*) from pg_constraint where conrelid = 'person'::regclass and conname = 'person_referred_by_person_id_fkey')
       + (select count(*) from pg_indexes where tablename = 'person' and indexname = 'person_referred_by_idx') into v_n;
  insert into t_res values ('01b_fkey_index_weg', v_n || ' (erwartet 0)');
  select count(*) into v_n from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'person'
     and column_name in ('invite_code', 'referred_by_person_id', 'is_ambassador', 'engagement_score');
  insert into t_res values ('01c_grants_weg', v_n || ' (erwartet 0)');

  -- 02
  select string_agg(p.proname, ',' order by p.proname) into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc ~ 'invite_code|referred_by_person_id|is_ambassador|engagement_score';
  insert into t_res values ('02_keine_funktion_nennt_sie', coalesce(v_txt, '-') || ' (erwartet -)');

  -- 03 · Zusammenführen ohne die Spalten
  insert into person (first_name, last_name) values ('Erika', 'ZZTEST-K91') returning id into v_a;
  insert into person_email (person_id, email, is_primary) values (v_a, 'zztest-k91-a@example.org', true);
  insert into person (first_name, last_name, phone) values ('Erica', 'ZZTEST-K91', '+49 30 5550') returning id into v_b;
  insert into person_email (person_id, email, is_primary) values (v_b, 'zztest-k91-b@example.org', true);
  v_j := person_merge_core(v_a, v_b);
  insert into t_res values ('03a_zusammengefuehrt',
    'b_weg=' || (not exists (select 1 from person where id = v_b))
    || ' a_bleibt=' || exists (select 1 from person where id = v_a)
    || ' vorname=' || (select first_name from person where id = v_a)
    || ' telefon=' || coalesce((select phone from person where id = v_a), '-')
    || ' adressen=' || (select count(*) from person_email where person_id = v_a)
    || ' (erwartet b_weg=true a_bleibt=true vorname=Erika telefon=+49 30 5550 adressen=2)');
  insert into t_res values ('03b_bericht',
    'blockiert=' || (v_j->'report'->'blocking')::text
    || ' ohne_referred=' || (v_j::text !~ 'referred_by_person_id')
    || ' gefuellt=' || (v_j->'report'->'filled')::text
    || ' (erwartet blockiert=[] ohne_referred=true gefuellt=["phone", "phone_e164"])');

  -- 04 · Löschen der Person
  perform set_config('request.jwt.claims', '', true);
  perform anonymize_person(v_a);
  select 'name=' || coalesce(first_name || last_name, '-') || ' telefon=' || coalesce(phone, '-')
         || ' konto=' || (auth_user_id is not null) || ' geloescht=' || (deleted_at is not null)
    into v_txt from person where id = v_a;
  insert into t_res values ('04a_anonymisiert', v_txt || ' (erwartet name=- telefon=- konto=false geloescht=true)');
  insert into t_res values ('04b_adresse',
    (select count(*) from person_email where person_id = v_a and email::text like 'deleted+%@anonym.invalid')::text
    || ' anonyme, ' || (select count(*) from person_email where person_id = v_a and email::text like 'zztest-k91%')::text || ' Klartext (erwartet 1 anonyme, 0 Klartext)');
end $$;
select * from t_res order by step;
rollback;
