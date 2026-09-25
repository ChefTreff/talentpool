-- Smoke-Test (Media Kit und Partnergrafik, PART-041/ADM-023). Nummer offen.
-- Echter Rollenwechsel des angemeldeten Kontos (erst Marketing, dann Partner), Wegwerf-Organisationen
-- und Speicherobjekte, alles zurückgerollt. Belegt:
--   01 das Marketing legt eine Media-Kit-Datei an, ändert sie und sieht in edition_files_admin nur
--      das Media Kit (nicht den Hallenplan);
--   02 das Marketing darf keinen Hallenplan anlegen, keinen umwidmen und keinen löschen (42501);
--   03 das Marketing legt die Partnergrafik an und ersetzt sie: Version 2 ist aktuell, Version 1
--      nicht mehr, beide „angenommen“, im Audit; partner_graphics_admin zeigt die Organisation mit
--      Grafik und die fremde ohne;
--   04 abgewiesen: falscher Pfad (path_mismatch), fehlendes Objekt (P0002), falsches Format (file_rules);
--   05 Speicherregel: das Marketing darf den Pfad der Partnergrafik beschreiben, der Partner nur lesen;
--      eine fremde Organisation weder noch;
--   06 der Partner sieht das Media Kit (edition_files) und seine Grafik (my_partner_assets), darf aber
--      keine Grafik anlegen (weder set_partner_graphic noch register_partner_asset, 42501) und das
--      Media Kit nicht pflegen;
--   07 die neuen Funktionen: SECURITY DEFINER, fester search_path, authenticated ja, anon nein.
--   08 der Bucket edition-files nimmt ZIP, PDF und Bilder weiter.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_org uuid; v_fremd uuid; v_mk uuid; v_hp uuid; v_g1 jsonb; v_g2 jsonb;
  v_pfad1 text; v_pfad2 text; v_n integer; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  if v_ed is null then raise exception 'VORBEDINGUNG: Edition fls27 fehlt'; end if;

  insert into organization (legal_name, communication_name) values ('ZZ Media GmbH', 'ZZ Media') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremde Media GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited'), (v_fremd, v_ed, 'invited');
  -- Ein Hallenplan, den das Marketing nicht anfassen darf (angelegt wie von der Produktion).
  insert into edition_file (edition_id, kind, storage_path, filename, audience)
    values (v_ed, 'hallenplan', v_ed::text || '/hallenplan/zz-plan.pdf', 'zz-plan.pdf', '{partner}') returning id into v_hp;
  v_pfad1 := v_ed::text || '/' || v_org::text || '/partner_graphic/zz-1.png';
  v_pfad2 := v_ed::text || '/' || v_org::text || '/partner_graphic/zz-2.png';
  insert into storage.objects (bucket_id, name, owner_id, metadata) values
    ('partner-assets', v_pfad1, v_uid::text, '{}'::jsonb),
    ('partner-assets', v_pfad2, v_uid::text, '{}'::jsonb);

  -- Marketing
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'marketing_team', 'global');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  if is_staff() or is_production_team() or is_partner_team() or not is_marketing_team() then
    raise exception 'VORBEDINGUNG: Konto ist nicht nur Marketing';
  end if;

  -- 01 Media-Kit-Datei
  v_mk := set_edition_file(jsonb_build_object('edition_id', v_ed, 'kind', 'media_kit',
            'storage_path', v_ed::text || '/media_kit/zz-logos.zip', 'filename', 'zz-logos.zip',
            'label_de', 'ZZ Logo-Paket', 'audience', jsonb_build_array('partner')));
  perform set_edition_file(jsonb_build_object('id', v_mk, 'kind', 'media_kit', 'label_de', 'ZZ Logo-Paket neu'));
  select count(*) filter (where kind = 'media_kit' and label_de = 'ZZ Logo-Paket neu'),
         count(*) filter (where kind <> 'media_kit')
    into v_n, v_txt
    from edition_files_admin(v_ed);
  insert into t_res values ('01_media_kit',
    case when v_n = 1 and v_txt = '0' then 'angelegt, geändert, nur Media Kit sichtbar (richtig)'
         else 'unerwartet: ' || v_n || ' Media Kit, ' || v_txt || ' andere sichtbar' end);

  -- 02 keine anderen Arten
  begin
    perform set_edition_file(jsonb_build_object('edition_id', v_ed, 'kind', 'hallenplan',
              'storage_path', v_ed::text || '/hallenplan/zz-neu.pdf', 'filename', 'zz-neu.pdf'));
    insert into t_res values ('02a_hallenplan_anlegen', 'ALLOWED (BUG)');
  exception when sqlstate '42501' then insert into t_res values ('02a_hallenplan_anlegen', '42501 (richtig)');
  end;
  begin
    perform set_edition_file(jsonb_build_object('id', v_hp, 'kind', 'media_kit', 'label_de', 'umgewidmet'));
    insert into t_res values ('02b_umwidmen', 'ALLOWED (BUG)');
  exception when sqlstate '42501' then insert into t_res values ('02b_umwidmen', '42501 (richtig)');
  end;
  begin
    perform delete_edition_file(v_hp);
    insert into t_res values ('02c_hallenplan_loeschen', 'ALLOWED (BUG)');
  exception when sqlstate '42501' then insert into t_res values ('02c_hallenplan_loeschen', '42501 (richtig)');
  end;

  -- 03 Partnergrafik anlegen und ersetzen
  v_g1 := set_partner_graphic(v_org, v_pfad1, 'zz-1.png', 'image/png', 1234, v_ed);
  v_g2 := set_partner_graphic(v_org, v_pfad2, 'zz-2.png', 'image/png', 2345, v_ed);
  select count(*) into v_n from partner_asset a
   where a.kind = 'partner_graphic' and a.status = 'accepted'
     and ((a.id = (v_g1->>'id')::uuid and not a.is_current and a.version = 1)
       or (a.id = (v_g2->>'id')::uuid and a.is_current and a.version = 2));
  insert into t_res values ('03a_grafik',
    case when v_n = 2 and (select count(*) from audit_log where action = 'partner.graphic' and object_id = v_org::text) = 2
         then 'Version 2 aktuell, Version 1 nicht, beide angenommen, zweimal im Audit (richtig)'
         else 'unerwartet: ' || v_n || ' passende Zeilen' end);
  select count(*) into v_n from partner_graphics_admin(v_ed) g
   where (g.org_id = v_org and g.org_name = 'ZZ Media' and g.asset_id = (v_g2->>'id')::uuid and g.version = 2)
      or (g.org_id = v_fremd and g.asset_id is null);
  insert into t_res values ('03b_liste',
    case when v_n = 2 then 'Organisation mit Grafik, fremde ohne (richtig)' else 'unerwartet: ' || v_n end);

  -- 04 abgewiesen
  begin
    perform set_partner_graphic(v_org, v_ed::text || '/' || v_fremd::text || '/partner_graphic/zz.png', 'zz.png', 'image/png');
    insert into t_res values ('04a_pfad', 'ALLOWED (BUG)');
  exception when sqlstate '22023' then
    insert into t_res values ('04a_pfad', case when sqlerrm = 'path_mismatch' then 'path_mismatch (richtig)' else '22023 ' || sqlerrm end);
  end;
  begin
    perform set_partner_graphic(v_org, v_ed::text || '/' || v_org::text || '/partner_graphic/gibt-es-nicht.png', 'x.png', 'image/png');
    insert into t_res values ('04b_objekt', 'ALLOWED (BUG)');
  exception when sqlstate 'P0002' then
    insert into t_res values ('04b_objekt', case when sqlerrm = 'object_not_found' then 'object_not_found (richtig)' else 'P0002 ' || sqlerrm end);
  end;
  begin
    perform set_partner_graphic(v_org, v_pfad1, 'zz.zip', 'application/zip');
    insert into t_res values ('04c_format', 'ALLOWED (BUG)');
  exception when sqlstate '22023' then
    insert into t_res values ('04c_format', case when sqlerrm = 'file_rules' then 'file_rules (richtig)' else '22023 ' || sqlerrm end);
  end;

  -- 05 Speicherregel, Marketing
  insert into t_res values ('05a_marketing_schreibt',
    case when partner_asset_path_allowed(v_pfad1, true) then 'darf schreiben (richtig)' else 'BUG: darf nicht' end);

  -- Rollenwechsel: Partner der Organisation
  delete from role_assignment where person_id = v_pid;
  insert into org_membership (person_id, org_id, roles) values (v_pid, v_org, '{additional}');
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', v_org);
  if is_marketing_team() or is_partner_team() or not partner_can_edit(v_org) then
    raise exception 'VORBEDINGUNG: Konto ist nicht nur Partner';
  end if;

  -- 05 Speicherregel, Partner
  insert into t_res values ('05b_partner',
    case when partner_asset_path_allowed(v_pfad1, false) and not partner_asset_path_allowed(v_pfad1, true)
              and not partner_asset_path_allowed(v_ed::text || '/' || v_fremd::text || '/partner_graphic/x.png', false)
              -- die übrigen Arten bleiben, wie sie waren
              and partner_asset_path_allowed(v_ed::text || '/' || v_org::text || '/logo_vector/logo.svg', true)
         then 'eigene Grafik lesen ja, schreiben nein, fremde nein, Logo weiter (richtig)'
         else 'BUG in partner_asset_path_allowed' end);

  -- 06 lesen ja, pflegen nein
  select count(*) into v_n from (select 1 from edition_files('partner', v_ed) f where f.id = v_mk
                                  union all
                                  select 1 from my_partner_assets(v_org, v_ed) a
                                   where a.kind = 'partner_graphic' and a.is_current and a.id = (v_g2->>'id')::uuid) x;
  insert into t_res values ('06a_partner_liest',
    case when v_n = 2 then 'Media Kit und eigene Grafik sichtbar (richtig)' else 'unerwartet: ' || v_n end);
  begin
    perform set_partner_graphic(v_org, v_pfad1, 'zz-1.png', 'image/png');
    insert into t_res values ('06b_partner_setzt', 'ALLOWED (BUG)');
  exception when sqlstate '42501' then insert into t_res values ('06b_partner_setzt', '42501 (richtig)');
  end;
  begin
    perform register_partner_asset(v_org, 'partner_graphic', v_pfad1, 'zz-1.png', 'image/png', 1234, null, v_ed);
    insert into t_res values ('06c_partner_registriert', 'ALLOWED (BUG)');
  exception when sqlstate '42501' then insert into t_res values ('06c_partner_registriert', '42501 (richtig)');
  end;
  begin
    perform set_edition_file(jsonb_build_object('id', v_mk, 'kind', 'media_kit', 'label_de', 'vom Partner'));
    insert into t_res values ('06d_partner_media_kit', 'ALLOWED (BUG)');
  exception when sqlstate '42501' then insert into t_res values ('06d_partner_media_kit', '42501 (richtig)');
  end;
end $$;

insert into t_res
select '07_rechte',
       case when count(*) filter (where p.prosecdef
                                    and coalesce(p.proconfig::text like '%search_path=public, extensions%', false)
                                    and has_function_privilege('authenticated', p.oid, 'execute')
                                    and not has_function_privilege('anon', p.oid, 'execute')) = 2
            then 'set_partner_graphic und partner_graphics_admin: SECURITY DEFINER, search_path fest, authenticated ja, anon nein (richtig)'
            else 'BUG: ' || string_agg(p.proname, ', ') end
  from pg_proc p
 where p.oid in ('set_partner_graphic(uuid, text, text, text, bigint, uuid)'::regprocedure,
                 'partner_graphics_admin(uuid)'::regprocedure);

insert into t_res
select '08_bucket',
       case when allowed_mime_types @> array['application/zip', 'application/pdf', 'image/png', 'image/svg+xml']
            then 'ZIP dazu, PDF und Bilder weiter (richtig)'
            else 'BUG: ' || coalesce(allowed_mime_types::text, 'null') end
  from storage.buckets where id = 'edition-files';

select * from t_res order by step;
rollback;
