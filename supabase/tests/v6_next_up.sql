-- Test „Next Up" (TAL-006, vorschlag/v6_next_up.sql). Belegt:
--   01 ohne Rolle: Lesen für Home geht, Admin-Liste und Schreiben 42501;
--   02 marketing_team legt an und ändert; Audit-Zeilen entstehen;
--   03 area_lead_talent darf pflegen; eine andere Bereichsleitung (area_lead_partner) nicht;
--   04 Titel leer ⇒ 22023 title_required;
--   05 Links: https und Portalpfad gehen; javascript:, http:, `//host` und `/\host` ⇒
--      22023 invalid_link_url;
--   06 Home zeigt nur aktive Einträge im Fenster (inaktiv, zukünftig, abgelaufen fehlen);
--   07 unbekannte Id beim Ändern und Löschen ⇒ P0002 next_up_not_found;
--   08 Löschen geht und entfernt den Eintrag;
--   09 Grants: anon ohne EXECUTE, Tabelle ohne Grants für authenticated.
--
-- Probelauf der Build-Session am 24.09.2026 gegen die Live-Datenbank (`sh scripts/db.sh dry-run`,
-- alles zurueckgerollt): 9 von 9 Schritten gruen. Keine bestehende Funktion geaendert.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_id uuid; v_a uuid; v_i uuid; v_z uuid; v_ab uuid;
  v_s text; v_n integer; v_bad text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 ohne Rolle
  perform * from next_up_items();
  v_s := 'ok';
  begin perform * from next_up_items_admin(); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  begin perform upsert_next_up_item('{"title_de":"x"}'::jsonb); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('01_ohne_rolle', case when v_s = 'ok/ok/ok' then 'ok' else v_s end);

  -- 02 marketing_team
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'marketing_team', 'global');
  v_id := upsert_next_up_item(jsonb_build_object('title_de', 'AI Bootcamp', 'word_de', 'Bootcamp',
            'link_url', 'https://chef-treff.de/bootcamp', 'sort_order', 1));
  perform upsert_next_up_item(jsonb_build_object('id', v_id, 'title_de', 'AI Bootcamp Herbst', 'word_de', 'Bootcamp'));
  select count(*) into v_n from audit_log a where a.object_id = v_id::text and a.action = 'next_up.upsert';
  insert into t_res values ('02_marketing_pflegt',
    case when (select title_de from next_up_item where id = v_id) = 'AI Bootcamp Herbst'
          and (select link_url from next_up_item where id = v_id) is null and v_n = 2
         then 'ok' else 'FEHLER n=' || v_n end);
  delete from role_assignment where person_id = v_pid;

  -- 03 area_lead_talent ja, area_lead_partner nein
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_talent', 'global');
  begin perform upsert_next_up_item(jsonb_build_object('id', v_id, 'title_de', 'AI Bootcamp')); v_s := 'ok';
  exception when others then v_s := 'FEHLER ' || sqlstate; end;
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  begin perform upsert_next_up_item(jsonb_build_object('id', v_id, 'title_de', 'fremd')); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  delete from role_assignment where person_id = v_pid;
  insert into t_res values ('03_rollen', case when v_s = 'ok/ok' then 'ok' else v_s end);

  -- Ab hier: marketing_team
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'marketing_team', 'global');

  -- 04 Titel leer
  begin perform upsert_next_up_item('{"title_de":"  "}'::jsonb); insert into t_res values ('04_titel', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_titel', case when sqlstate = '22023' and sqlerrm = 'title_required' then 'ok' else sqlstate || ' ' || sqlerrm end); end;

  -- 05 Links
  perform upsert_next_up_item(jsonb_build_object('title_de', 'Pfad', 'link_url', '/summit', 'active', false));
  v_s := 'ok';
  foreach v_bad in array array['javascript:alert(1)', 'http://chef-treff.de', '//evil.example', '/\evil.example', 'https://a b'] loop
    begin
      perform upsert_next_up_item(jsonb_build_object('title_de', 'x', 'link_url', v_bad));
      v_s := v_s || '/ALLOWED (BUG): ' || v_bad;
    exception when others then
      if not (sqlstate = '22023' and sqlerrm = 'invalid_link_url') then v_s := v_s || '/' || sqlstate || ' ' || v_bad; end if;
    end;
  end loop;
  insert into t_res values ('05_links', v_s);

  -- 06 Sichtbarkeit auf Home
  v_a  := upsert_next_up_item(jsonb_build_object('title_de', 'Aktiv', 'visible_from', (now() - interval '1 day')::text));
  v_i  := upsert_next_up_item(jsonb_build_object('title_de', 'Inaktiv', 'active', false));
  v_z  := upsert_next_up_item(jsonb_build_object('title_de', 'Zukunft', 'visible_from', (now() + interval '1 day')::text));
  v_ab := upsert_next_up_item(jsonb_build_object('title_de', 'Abgelaufen',
            'visible_from', (now() - interval '3 days')::text, 'visible_until', (now() - interval '1 day')::text));
  delete from role_assignment where person_id = v_pid;   -- Home liest ohne Rolle
  select string_agg(title_de, ',' order by title_de) into v_s from next_up_items() where id in (v_a, v_i, v_z, v_ab, v_id);
  insert into t_res values ('06_home_fenster', case when v_s = 'AI Bootcamp,Aktiv' then 'ok' else coalesce(v_s, 'leer') end);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'marketing_team', 'global');

  -- 07 unbekannte Id
  v_s := '';
  begin perform upsert_next_up_item(jsonb_build_object('id', gen_random_uuid(), 'title_de', 'x')); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = 'P0002' and sqlerrm = 'next_up_not_found' then 'ok' else sqlstate end; end;
  begin perform delete_next_up_item(gen_random_uuid()); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = 'P0002' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('07_unbekannt', case when v_s = 'ok/ok' then 'ok' else v_s end);

  -- 08 Löschen
  perform delete_next_up_item(v_i);
  insert into t_res values ('08_loeschen', case when not exists (select 1 from next_up_item where id = v_i) then 'ok' else 'FEHLER' end);

  -- 09 Grants
  insert into t_res values ('09_grants',
    case when not has_function_privilege('anon', 'next_up_items()', 'execute')
          and not has_function_privilege('anon', 'upsert_next_up_item(jsonb)', 'execute')
          and has_function_privilege('authenticated', 'next_up_items()', 'execute')
          and not has_table_privilege('authenticated', 'next_up_item', 'select')
          and not has_table_privilege('anon', 'next_up_item', 'select')
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
