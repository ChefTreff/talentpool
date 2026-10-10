-- Test „Fachbereiche als Liste“ (K-94 Stufe 1 Teil B, vorschlag/v6_profil_function_area_liste.sql). Belegt:
--   01 die Person trägt zwei Fachbereiche in ihr Profil ein (`person_interest`, Vokabular `function_area`); ein unbekannter Schlüssel scheitert am
--      Fremdschlüssel (23503), ein fremdes Vokabular am Prüfsatz (23514);
--   02 die alten Listen bleiben erlaubt (career_opportunities, notification_topic);
--   03 Bestand: jede Einzelauswahl `person.function_area` mit gültigem Schlüssel steht auch in der Liste;
--   04 die Person sieht nur ihre eigenen Zeilen nicht die einer anderen Person (RLS wie bei den anderen Listen).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_other uuid; v_s text; v_n integer; v_k1 text; v_k2 text; r1 text; r2 text; r4 text;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at limit 1;
  select p.id into v_other from person p where p.id <> v_pid and p.deleted_at is null order by p.created_at limit 1;
  select key into v_k1 from vocab_term where vocabulary = 'function_area' and active order by sort_order limit 1;
  select key into v_k2 from vocab_term where vocabulary = 'function_area' and active order by sort_order offset 1 limit 1;
  delete from person_interest where person_id in (v_pid, v_other) and vocabulary = 'function_area';
  insert into person_interest (person_id, vocabulary, term_key) values (v_other, 'function_area', v_k1);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 01
  insert into person_interest (person_id, vocabulary, term_key) values (v_pid, 'function_area', v_k1), (v_pid, 'function_area', v_k2);
  begin insert into person_interest (person_id, vocabulary, term_key) values (v_pid, 'function_area', 'gibtsnicht'); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '23503' then 'ok' else sqlstate end; end;
  begin insert into person_interest (person_id, vocabulary, term_key) values (v_pid, 'unbekannt', v_k1); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '23514' then '/ok' else '/' || sqlstate end; end;
  select count(*) into v_n from person_interest where person_id = v_pid and vocabulary = 'function_area';
  r1 := case when v_s = 'ok/ok' and v_n = 2 then 'ok' else v_s || ' n=' || v_n end;

  -- 02
  v_s := '';
  begin insert into person_interest (person_id, vocabulary, term_key) select v_pid, 'career_opportunities', key from vocab_term where vocabulary = 'career_opportunities' limit 1; v_s := 'ok';
  exception when others then v_s := sqlstate; end;
  begin insert into person_interest (person_id, vocabulary, term_key) select v_pid, 'notification_topic', key from vocab_term where vocabulary = 'notification_topic' limit 1; v_s := v_s || '/ok';
  exception when others then v_s := v_s || '/' || sqlstate; end;
  r2 := case when v_s = 'ok/ok' then 'ok' else v_s end;

  -- 04
  select count(*) into v_n from person_interest where person_id = v_other and vocabulary = 'function_area';
  r4 := case when v_n = 0 then 'ok' else 'FREMD SICHTBAR: ' || v_n end;

  reset role;
  insert into t_res values ('01_eintragen', r1), ('02_alte_listen', r2), ('04_nur_eigene_zeilen', r4);
  -- 03
  select count(*) into v_n from person p
   where p.function_area is not null
     and exists (select 1 from vocab_term v where v.vocabulary = 'function_area' and v.key = p.function_area)
     and not exists (select 1 from person_interest i where i.person_id = p.id and i.vocabulary = 'function_area' and i.term_key = p.function_area);
  insert into t_res values ('03_bestand', case when v_n = 0 then 'ok' else 'FEHLT: ' || v_n end);
end $$;
select * from t_res order by step;
rollback;
