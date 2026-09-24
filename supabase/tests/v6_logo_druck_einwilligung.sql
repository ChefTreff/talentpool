-- Smoke-Test (Logo-Wand: Einwilligung und Dateiregel, PART-053). Nummer offen. Belegt:
--   01 die Vorlage `logo_vector` nimmt nur noch `svg` und `eps` — `ai` und `pdf` sind raus;
--   02 die **zweite** Stelle zieht mit: `register_partner_asset` weist eine `.ai`-Datei auch
--      ohne Pflicht ab, laesst `svg` aber durch. Genau hier lag die Falle — die Regel steht
--      doppelt im System, und ein Test nur auf „abgewiesen" waere auch gruen, wenn die
--      Funktion alles abwiese;
--   03 ohne Einwilligung steht nichts in der Spalte: NULL heisst „nicht auf die Wand";
--   04 die Einwilligung wird erteilt, vermerkt **wer** und **wann**, und im Audit;
--   05 eine zweite Bestaetigung datiert sie **nicht** um — der Nachweis soll sagen, wann sie
--      erteilt wurde, nicht wann jemand zuletzt geklickt hat;
--   06 der Widerruf setzt beide Felder zurueck (eine Erlaubnis ohne Widerruf waere keine);
--   07 eine fremde Organisation darf nicht (42501), `anon` gar nicht.
-- Probelauf Bau-Chat 22.09.2026: 10/10 gruen. Nach Einzug von main erneut 24.09.2026
-- (`sh scripts/db.sh dry-run`, fn-diff gegen live ohne unerklaerte Zeile): **10/10 gruen**.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_fremd uuid; v_oe uuid;
  v_rules jsonb; v_at timestamptz; v_at2 timestamptz; v_by uuid; v_n integer; v_pfad text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into organization (legal_name) values ('ZZ Logo GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremde Logo GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited')
    returning id into v_oe;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- 01 Die Vorlage
  select file_rules into v_rules from deliverable_template
   where key = 'logo_vector' and product_sku is null and category is null;
  insert into t_res values ('01_vorlage_nur_svg_eps',
    case when v_rules->'ext' @> '["svg"]'::jsonb and v_rules->'ext' @> '["eps"]'::jsonb
              and not (v_rules->'ext' @> '["ai"]'::jsonb) and not (v_rules->'ext' @> '["pdf"]'::jsonb)
         then 'svg und eps, kein ai und kein pdf (richtig)'
         else 'unerwartet ' || coalesce(v_rules->>'ext', 'null') end);

  -- 02 Die zweite Stelle im Code. Ohne Pflicht greift die hartcodierte Liste in
  --    `register_partner_asset`. Die Funktion prueft **zuerst**, ob die Datei im Bucket
  --    liegt — im echten Ablauf laedt der Browser sie hoch und ruft erst dann die RPC, die
  --    Reihenfolge stimmt also. Fuer den Test heisst das: das Objekt muss existieren, sonst
  --    kommt `object_not_found` und der Schritt belegt nichts (erster Versuch, 22.09.).
  v_pfad := v_ed::text || '/' || v_org::text || '/logo_vector/zz.ai';
  insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('partner-assets', v_pfad, v_uid::text, '{}'::jsonb);
  begin
    perform register_partner_asset(v_org, 'logo_vector', v_pfad, 'zz.ai', null, null, null, v_ed);
    insert into t_res values ('02_code_weist_ai_ab', 'ALLOWED (BUG): .ai durchgelassen');
  exception
    when sqlstate '22023' then
      insert into t_res values ('02_code_weist_ai_ab',
        case when sqlerrm like '%file_rules%' then '22023 file_rules (richtig)'
             else '22023, aber ' || sqlerrm end);
    when others then
      insert into t_res values ('02_code_weist_ai_ab', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 02b Und eine SVG-Datei geht durch — sonst waere Schritt 02 auch dann gruen, wenn die
  --     Funktion **alles** abwiese.
  v_pfad := v_ed::text || '/' || v_org::text || '/logo_vector/zz.svg';
  insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('partner-assets', v_pfad, v_uid::text, '{}'::jsonb);
  begin
    perform register_partner_asset(v_org, 'logo_vector', v_pfad, 'zz.svg', null, null, null, v_ed);
    insert into t_res values ('02b_svg_geht_durch', 'angenommen (richtig)');
  exception when others then
    insert into t_res values ('02b_svg_geht_durch', 'ABGEWIESEN (BUG): ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 03 Vorgabe: keine Einwilligung
  select logo_whitening_consent_at into v_at from org_edition where id = v_oe;
  insert into t_res values ('03_ohne_einwilligung',
    case when v_at is null then 'NULL — nicht auf die Wand (richtig)'
         else 'ALLOWED (BUG): von allein gesetzt' end);

  -- 04 Erteilen
  v_at := set_logo_whitening_consent(v_org, true, v_ed);
  select logo_whitening_consent_at, logo_whitening_consent_by into v_at2, v_by
    from org_edition where id = v_oe;
  insert into t_res values ('04_erteilt',
    case when v_at2 is not null and v_by = v_pid and v_at = v_at2
         then 'Zeitpunkt und Person vermerkt, Rueckgabe stimmt (richtig)'
         else 'unerwartet ' || coalesce(v_at2::text,'null') || '/' || coalesce(v_by::text,'null') end);
  select count(*)::integer into v_n from audit_log
   where action = 'partner.logo_whitening_granted' and object_id = v_oe::text;
  insert into t_res values ('04b_im_audit',
    case when v_n >= 1 then 'protokolliert (richtig)' else 'ALLOWED (BUG): kein Eintrag' end);

  -- 05 Zweite Bestaetigung datiert nicht um
  perform pg_sleep(0.01);
  perform set_logo_whitening_consent(v_org, true, v_ed);
  select logo_whitening_consent_at into v_at from org_edition where id = v_oe;
  insert into t_res values ('05_nicht_umdatiert',
    case when v_at = v_at2 then 'Zeitpunkt bleibt (richtig)'
         else 'ALLOWED (BUG): auf den letzten Klick umdatiert' end);

  -- 06 Widerruf
  perform set_logo_whitening_consent(v_org, false, v_ed);
  select logo_whitening_consent_at, logo_whitening_consent_by into v_at, v_by
    from org_edition where id = v_oe;
  insert into t_res values ('06_widerruf',
    case when v_at is null and v_by is null then 'beide Felder zurueck (richtig)'
         else 'ALLOWED (BUG): Erlaubnis nicht widerrufbar' end);

  -- 07 Fremde Organisation
  begin
    perform set_logo_whitening_consent(v_fremd, true, v_ed);
    insert into t_res values ('07_fremde_org', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('07_fremde_org', '42501 (richtig)');
    when others then insert into t_res values ('07_fremde_org', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;

-- 07b anon darf die Funktion nicht
insert into t_res
select '07b_anon_gesperrt',
       case when has_function_privilege('anon', 'set_logo_whitening_consent(uuid, boolean, uuid)', 'execute')
            then 'ALLOWED (BUG)' else 'gesperrt (richtig)' end;

select * from t_res order by step;
rollback;
