-- Smoke-Test 0126 (Zähler für Assistenten). Belegt:
--   01 leere und absurd lange Art ⇒ 22023 invalid_kind;
--   02 der erste Aufruf zaehlt und meldet den Rest;
--   03 ueber der Grenze ⇒ P0001 rate_limited mit der Grenze im detail;
--   04 **zwei Arten, zwei Toepfe** — das ist der Grund fuer die eigene
--      Tabelle: wer das Wiki ausreizt, hat den Titel-Assistenten noch;
--   05 `kb_rate_limit` bleibt unberuehrt (die Wissensbasis zaehlt weiter
--      fuer sich);
--   06 das Aufraeumen nimmt nur Fenster aelter als 24 Stunden;
--   07 Grants: Tabelle ohne Grants, Aufraeumen fuer authenticated gesperrt.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text;
  v_res jsonb; v_n integer; v_detail text; v_kb integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from ai_rate_limit where auth_user_id = v_uid;
  select count(*)::integer into v_kb from kb_rate_limit where auth_user_id = v_uid;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 · unbrauchbare Art
  begin
    perform ai_take_slot('   ', 5);
    insert into t_res values ('01a_leere_art', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01a_leere_art', 'abgewiesen ' || sqlstate); end;
  begin
    perform ai_take_slot(repeat('x', 41), 5);
    insert into t_res values ('01b_lange_art', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01b_lange_art', 'abgewiesen ' || sqlstate); end;

  -- 02 · erster Aufruf
  v_res := ai_take_slot('speaker_title', 3);
  insert into t_res values ('02_erster_aufruf',
    case when (v_res->>'used')::integer = 1 and (v_res->>'left')::integer = 2
         then 'ok 1/3' else 'FEHLER ' || v_res::text end);

  -- 03 · ueber der Grenze
  perform ai_take_slot('speaker_title', 3);
  perform ai_take_slot('speaker_title', 3);
  begin
    perform ai_take_slot('speaker_title', 3);
    insert into t_res values ('03_ueber_grenze', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_ueber_grenze',
      'abgewiesen ' || sqlstate || ' / Grenze=' || coalesce(v_detail, '-'));
  end;

  -- 04 · zweite Art, eigener Topf
  v_res := ai_take_slot('etwas_anderes', 3);
  insert into t_res values ('04_getrennte_toepfe',
    case when (v_res->>'used')::integer = 1
         then 'ok, eigener Zaehler' else 'FEHLER ' || v_res::text end);

  -- 05 · die Wissensbasis zaehlt weiter fuer sich
  select count(*)::integer into v_n from kb_rate_limit where auth_user_id = v_uid;
  insert into t_res values ('05_kb_unberuehrt',
    case when v_n = v_kb then 'ok, unveraendert' else 'FEHLER ' || v_n::text || ' statt ' || v_kb::text end);

  -- 06 · Aufraeumen
  insert into ai_rate_limit (auth_user_id, kind, window_start, hits)
    values (v_uid, 'alt', date_trunc('hour', now() - interval '30 hours'), 1);
  perform set_config('request.jwt.claims', null, true);
  select purge_ai_rate_limit() into v_n;
  insert into t_res values ('06a_alte_zeile_weg', case when v_n >= 1 then 'ok ' || v_n::text else 'FEHLER' end);
  select count(*)::integer into v_n from ai_rate_limit
   where auth_user_id = v_uid and kind = 'speaker_title';
  insert into t_res values ('06b_junge_zeile_bleibt',
    case when v_n = 1 then 'ok' else 'FEHLER ' || v_n::text end);

  -- 07 · Grants
  insert into t_res values ('07a_purge_gesperrt',
    case when has_function_privilege('authenticated', 'purge_ai_rate_limit()', 'execute')
         then 'ERLAUBT (BUG)' else 'gesperrt' end);
  select count(*) into v_n from information_schema.role_table_grants
   where table_name = 'ai_rate_limit' and grantee in ('anon', 'authenticated');
  insert into t_res values ('07b_tabellen_grants',
    case when v_n = 0 then 'keine' else 'FEHLER ' || v_n::text end);
end $$;
select * from t_res order by step;
rollback;
