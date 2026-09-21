-- Smoke-Test 0122 (Belege aus SevDesk · A5, PART-036). Belegt:
--   01 die Zielliste ohne Partner-Team 42501;
--   02 der Rueckfall ebenso;
--   03 eine Organisation **mit** SevDesk-Kennung steht in der Zielliste;
--   04 eine ohne Kennung nicht — dort gibt es drueben nichts zu holen;
--   05 `register_sevdesk_document` aus einem **angemeldeten** Kontext 42501: sie gehoert
--      dem Server, und eine Rollenpruefung waere dort wirkungslos (Befund zu 0120);
--   06 der Rueckfall legt einen Beleg ab und 07 protokolliert ihn — eine Datei, die ein
--      Mensch hochgeladen hat, soll jemandem zuzuordnen sein;
--   08 ein Pfad, der zu einer **anderen** Organisation gehoert ⇒ 22023 `path_mismatch`
--      (sonst landete die Rechnung im Ordner eines Fremden, und die Leseregel des
--      Buckets liesse sie dort lesen);
--   09 eine erfundene Belegart ⇒ 22023 `invalid_kind`;
--   10 derselbe Beleg zweimal abgerufen ergibt **eine** Zeile mit neuem Stand;
--   11 ein zweiter Beleg **ueberholt den ersten nicht** — jede Rechnung bleibt gueltig
--      (genau das kann `register_partner_asset` aus 0053 nicht, deshalb die eigene Funktion);
--   12 ein Eintrag ohne Datei im Bucket ⇒ P0002 `object_not_found`;
--   13 die Zielliste liest **auch im Servicekontext** — sonst waere der naechtliche
--      Lauf beim ersten Aufruf mit 42501 gescheitert (dieselbe Falle wie in 0120).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid;
        v_fremd_org uuid; v_fremd_oe uuid; v_pfad text; v_fremdpfad text;
        v_id uuid; v_n integer; v_txt text;
begin
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into organization (legal_name, type, slug, sevdesk_contact_id)
  values ('ZZTEST Beleg GmbH', 'corporate', 'zztest-beleg', 'sd-4711') returning id into v_org;
  insert into org_edition (org_id, edition_id) values (v_org, v_ed) returning id into v_oe;
  insert into organization (legal_name, type, slug)
  values ('ZZTEST Fremd GmbH', 'corporate', 'zztest-fremd') returning id into v_fremd_org;
  insert into org_edition (org_id, edition_id) values (v_fremd_org, v_ed) returning id into v_fremd_oe;

  v_pfad := v_ed::text || '/' || v_org::text || '/documents/sd-1001.pdf';
  v_fremdpfad := v_ed::text || '/' || v_fremd_org::text || '/documents/sd-1001.pdf';
  insert into storage.objects (bucket_id, name) values ('partner-assets', v_pfad);

  begin perform sevdesk_document_targets(v_ed);
    insert into t_res values ('01_liste_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01_liste_ohne_recht', 'abgewiesen ' || sqlstate); end;
  begin perform upload_partner_document(v_oe, 'invoice', v_pfad, 'sd-1001.pdf');
    insert into t_res values ('02_rueckfall_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('02_rueckfall_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid, 'area_lead_partner', 'global', now() - interval '1 hour');

  select count(*)::integer into v_n from sevdesk_document_targets(v_ed) t where t.org_edition_id = v_oe;
  insert into t_res values ('03_ziel_mit_kennung', case when v_n = 1 then 'gelistet (richtig)' else 'FEHLT' end);
  select count(*)::integer into v_n from sevdesk_document_targets(v_ed) t where t.org_edition_id = v_fremd_oe;
  insert into t_res values ('04_ohne_kennung', case when v_n = 0 then 'nicht gelistet (richtig)' else 'FEHLER' end);

  begin perform register_sevdesk_document(v_oe, 'invoice', v_pfad, 'sd-1001.pdf');
    insert into t_res values ('05_angemeldet_verboten', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('05_angemeldet_verboten', 'abgewiesen ' || sqlstate); end;

  v_id := upload_partner_document(v_oe, 'invoice', v_pfad, 'sd-1001.pdf', 2048);
  insert into t_res values ('06_rueckfall', case when v_id is not null then 'abgelegt (richtig)' else 'FEHLT' end);
  select count(*)::integer into v_n from audit_log where action = 'partner.document' and object_id = v_oe::text;
  insert into t_res values ('07_rueckfall_protokolliert',
    case when v_n = 1 then 'protokolliert (richtig)' else 'FEHLT (' || v_n || ')' end);

  begin perform upload_partner_document(v_oe, 'invoice', v_fremdpfad, 'x.pdf');
    insert into t_res values ('08_fremder_pfad', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('08_fremder_pfad', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin perform upload_partner_document(v_oe, 'mahnung', v_pfad, 'x.pdf');
    insert into t_res values ('09_fremde_art', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('09_fremde_art', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- Ab hier der Servicekontext: Claims **ohne** `sub`, so ruft der Abruf die Funktion.
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  v_id := register_sevdesk_document(v_oe, 'invoice', v_pfad, 'sd-1001.pdf', 4096);
  select count(*)::integer into v_n from partner_asset where storage_path = v_pfad;
  select size_bytes::text into v_txt from partner_asset where storage_path = v_pfad;
  insert into t_res values ('10_idempotent',
    case when v_n = 1 and v_txt = '4096' then 'eine Zeile, neuer Stand (richtig)'
         else 'unerwartet ' || v_n || '/' || coalesce(v_txt, 'null') end);

  insert into storage.objects (bucket_id, name)
  values ('partner-assets', v_ed::text || '/' || v_org::text || '/documents/sd-1002.pdf');
  perform register_sevdesk_document(v_oe, 'invoice',
    v_ed::text || '/' || v_org::text || '/documents/sd-1002.pdf', 'sd-1002.pdf');
  select count(*)::integer into v_n from partner_asset
   where org_edition_id = v_oe and kind = 'invoice' and is_current;
  insert into t_res values ('11_nichts_ueberholt',
    case when v_n = 2 then 'beide Rechnungen gueltig (richtig)' else 'unerwartet ' || v_n end);

  begin perform register_sevdesk_document(v_oe, 'invoice',
      v_ed::text || '/' || v_org::text || '/documents/gibt-es-nicht.pdf', 'x.pdf');
    insert into t_res values ('12_ohne_datei', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('12_ohne_datei', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 13 die Zielliste im Servicekontext -------------------------------------------
  begin
    select count(*)::integer into v_n from sevdesk_document_targets(v_ed) t where t.org_edition_id = v_oe;
    insert into t_res values ('13_zielliste_im_service',
      case when v_n = 1 then 'lesbar (richtig)' else 'FEHLT (' || v_n || ')' end);
  exception when others then
    insert into t_res values ('13_zielliste_im_service', 'ABGEWIESEN (BUG) ' || sqlstate); end;
end $$;
select * from t_res order by step;
rollback;
-- Lauf am 18.09. gegen die Datenbank (Migration + Test in einer Transaktion, rollback): 12/12 gruen.
