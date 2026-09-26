-- Smoke-Test (Links je Schlüssel, zuerst die Store-Links der Event-App, PART-072). Nummer offen.
-- Echter Rollenwechsel des angemeldeten Kontos (erst Admin, dann Partner), Wegwerf-Organisation,
-- alles zurückgerollt. Belegt:
--   01 die beiden Store-Links stehen als Startwerte da (Schlüssel, https-Adresse, alle Zielgruppen);
--   02 das Team legt einen Link an, ändert ihn und löscht ihn — jede Änderung im Audit;
--   03 abgewiesen: http statt https (`portal_link_url`), Schlüssel mit Leerzeichen (`portal_link_key`),
--      neu ohne Zielgruppe und unbekannte Zielgruppe (`invalid_audience`), unbekannte Kennung (P0002);
--   04 ein Partner liest die Store-Links über `portal_links_for`; ein Link der Edition geht dem
--      allgemeinen vor; eine Zielgruppe, die er nicht hat, → 42501;
--   05 ein Partner darf nicht pflegen und die Admin-Liste nicht lesen (42501);
--   06 die Tabelle ist direkt nicht erreichbar; vier Funktionen SECURITY DEFINER mit festem
--      search_path, `authenticated` darf, `anon` nicht.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid;
  v_id uuid; v_edid uuid; v_n integer; v_url text; v_titel text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  if v_ed is null then raise exception 'VORBEDINGUNG: Edition fls27 fehlt'; end if;
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  if not is_staff() then raise exception 'VORBEDINGUNG: Konto ist nicht Admin'; end if;

  -- 01 Startwerte
  select count(*)::integer into v_n from portal_link
   where edition_id is null
     and ((key = 'event_app_app_store' and url = 'https://apps.apple.com/de/app/fls-2026/id6479501389')
       or (key = 'event_app_google_play' and url like 'https://play.google.com/store/apps/details?id=com.swapcard.apps.android.cheftreffdeutsch'))
     and audience @> array['partner','talent','speaker','volunteer','hackathon'];
  insert into t_res values ('01_startwerte', case when v_n = 2 then 'beide Store-Links da (richtig)' else 'BUG: ' || v_n || ' von 2' end);

  -- 02 anlegen, ändern, löschen, Audit
  v_id := upsert_portal_link(jsonb_build_object('key', 'zz_test_link', 'title_de', 'ZZ Test', 'url', 'https://example.org/zz',
                                                'audience', jsonb_build_array('partner')));
  perform upsert_portal_link(jsonb_build_object('id', v_id, 'title_de', 'ZZ Test neu', 'url', 'https://example.org/zz-neu'));
  select url, title_de into v_url, v_titel from portal_link where id = v_id;
  perform delete_portal_link(v_id);
  select count(*)::integer into v_n from audit_log
   where object_type = 'portal_link' and object_id = v_id::text and action in ('portal_link.upsert', 'portal_link.delete');
  insert into t_res values ('02_pflege',
    case when v_url = 'https://example.org/zz-neu' and v_titel = 'ZZ Test neu' and v_n = 3
              and not exists (select 1 from portal_link where id = v_id)
         then 'angelegt, geändert, gelöscht, drei Audit-Einträge (richtig)'
         else 'unerwartet: ' || coalesce(v_url, 'null') || ', ' || coalesce(v_titel, 'null') || ', Audit ' || v_n end);

  -- 03 abgewiesen
  begin
    perform upsert_portal_link('{"key": "zz_http", "url": "http://example.org", "audience": ["partner"]}'::jsonb);
    insert into t_res values ('03a_http', 'ALLOWED (BUG)');
  exception when sqlstate '22023' then
    insert into t_res values ('03a_http', case when sqlerrm = 'portal_link_url' then 'portal_link_url (richtig)' else '22023 ' || sqlerrm end);
  end;
  begin
    perform upsert_portal_link('{"key": "zz falsch", "url": "https://example.org", "audience": ["partner"]}'::jsonb);
    insert into t_res values ('03b_schluessel', 'ALLOWED (BUG)');
  exception when sqlstate '22023' then
    insert into t_res values ('03b_schluessel', case when sqlerrm = 'portal_link_key' then 'portal_link_key (richtig)' else '22023 ' || sqlerrm end);
  end;
  begin
    perform upsert_portal_link('{"key": "zz_leer", "url": "https://example.org"}'::jsonb);
    insert into t_res values ('03c_ohne_zielgruppe', 'ALLOWED (BUG)');
  exception when sqlstate '22023' then
    insert into t_res values ('03c_ohne_zielgruppe', case when sqlerrm = 'invalid_audience' then 'invalid_audience (richtig)' else '22023 ' || sqlerrm end);
  end;
  begin
    perform upsert_portal_link('{"key": "zz_fremd", "url": "https://example.org", "audience": ["alle"]}'::jsonb);
    insert into t_res values ('03d_fremde_zielgruppe', 'ALLOWED (BUG)');
  exception when sqlstate '22023' then
    insert into t_res values ('03d_fremde_zielgruppe', case when sqlerrm = 'invalid_audience' then 'invalid_audience (richtig)' else '22023 ' || sqlerrm end);
  end;
  begin
    perform upsert_portal_link(jsonb_build_object('id', gen_random_uuid(), 'title_de', 'x'));
    insert into t_res values ('03e_unbekannt', 'ALLOWED (BUG)');
  exception when sqlstate 'P0002' then
    insert into t_res values ('03e_unbekannt', case when sqlerrm = 'link_not_found' then 'link_not_found (richtig)' else 'P0002 ' || sqlerrm end);
  end;

  -- Link der Edition für 04 (geht dem allgemeinen vor)
  v_edid := upsert_portal_link(jsonb_build_object('key', 'event_app_app_store', 'url', 'https://apps.apple.com/de/app/zz-edition',
                                                  'audience', jsonb_build_array('partner'), 'edition_id', v_ed));

  -- Rollenwechsel: kein Admin mehr, Partner einer Wegwerf-Organisation
  delete from role_assignment where person_id = v_pid;
  insert into organization (legal_name) values ('ZZ Links GmbH') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited');
  insert into org_membership (person_id, org_id, roles) values (v_pid, v_org, '{additional}');
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', v_org);
  if is_staff() then raise exception 'VORBEDINGUNG: Konto ist noch Admin'; end if;

  -- 04 lesen
  select count(*)::integer into v_n from portal_links_for(array['event_app_app_store', 'event_app_google_play'], 'partner', v_ed);
  select url into v_url from portal_links_for(array['event_app_app_store'], 'partner', v_ed);
  insert into t_res values ('04a_partner_liest',
    case when v_n = 2 and v_url = 'https://apps.apple.com/de/app/zz-edition' then 'zwei Links, der Edition vor dem allgemeinen (richtig)'
         else 'unerwartet: ' || v_n || ', ' || coalesce(v_url, 'null') end);
  begin
    perform * from portal_links_for(array['event_app_app_store'], 'speaker', v_ed);
    insert into t_res values ('04b_fremde_zielgruppe', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('04b_fremde_zielgruppe', '42501 (richtig)');
    when others then insert into t_res values ('04b_fremde_zielgruppe', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 05 nicht pflegen
  begin
    perform upsert_portal_link('{"key": "zz_partner", "url": "https://example.org", "audience": ["partner"]}'::jsonb);
    insert into t_res values ('05a_pflege', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('05a_pflege', '42501 (richtig)');
    when others then insert into t_res values ('05a_pflege', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform * from portal_links_admin();
    insert into t_res values ('05b_admin_liste', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('05b_admin_liste', '42501 (richtig)');
    when others then insert into t_res values ('05b_admin_liste', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;

insert into t_res
select '06a_tabelle',
       case when has_table_privilege('authenticated', 'portal_link', 'select')
              or has_table_privilege('authenticated', 'portal_link', 'insert')
              or has_table_privilege('anon', 'portal_link', 'select')
            then 'BUG: Tabelle direkt erreichbar'
            when not (select relrowsecurity from pg_class where oid = 'portal_link'::regclass) then 'BUG: RLS aus'
            else 'nur über Funktionen, RLS an (richtig)' end;

insert into t_res
select '06b_rechte',
       case when count(*) filter (where p.prosecdef
                                    and coalesce(p.proconfig::text like '%search_path=public, extensions%', false)
                                    and has_function_privilege('authenticated', p.oid, 'execute')
                                    and not has_function_privilege('anon', p.oid, 'execute')) = 4
            then 'vier Funktionen SECURITY DEFINER, search_path fest, authenticated ja, anon nein (richtig)'
            else 'BUG: ' || string_agg(p.proname, ', ') end
  from pg_proc p
 where p.oid in ('portal_links_for(text[], text, uuid)'::regprocedure, 'portal_links_admin()'::regprocedure,
                 'upsert_portal_link(jsonb)'::regprocedure, 'delete_portal_link(uuid)'::regprocedure);

select * from t_res order by step;
rollback;
