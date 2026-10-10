-- Test „Media Kit für Speaker“ (SPK-090, **keine Migration**). Echter Rollenwechsel des angemeldeten Kontos (Speaker, Marketing, Partner;
-- für den Bucket zusätzlich `set local role authenticated`), vier eigene Dateien der Edition fls27 (A Media Kit für Partner und Speaker,
-- B Media Kit nur Partner, C Media Kit nur Speaker, D Hallenplan nur Speaker) und die Objekte im Bucket `edition-files`; geurteilt wird nur über
-- diese. Alles wird zurückgerollt. Belegt den Weg, auf dem die Seite `/speaker/media` und die Wahl „Sichtbar für“ unter `/admin/grafiken` laufen:
--   01 ein Speaker sieht in `edition_files('speaker', ed)` A, C und D, **nicht B** (nur Partner);
--   02 im Bucket (Policy `edition_file_path_allowed`) sieht er die Objekte von A und C, nicht B;
--   03 die Zielgruppe `partner` darf er nicht abfragen (42501) — die Funktion leitet sie aus den Rollen ab;
--   04 das Marketing nimmt Speaker bei B dazu (`set_edition_file` mit `audience`): B trägt Partner und Speaker, Art und Titel unverändert,
--      `edition_files_admin` zeigt die Zielgruppen, **ein** Audit-Eintrag `edition_file.set`;
--   05 das Marketing darf die Zielgruppe des Hallenplans nicht ändern (42501), sie bleibt;
--   06 **die Annahme hinter der Route `/api/admin/media-kit`**: eine leere Liste ändert beim Ändern nichts, macht beim Anlegen aber „alle fünf
--      Zielgruppen“ (Talent, Volunteers, Hackathon eingeschlossen) — deshalb gibt die Route nie eine leere Liste weiter (Quelltext-Test);
--   07 danach sieht der Speaker A, B, C (Liste und Bucket);
--   08 ein Partner sieht A und B, nicht C;
--   09 nimmt das Marketing die Zielgruppe Speaker bei B wieder weg, sieht der Speaker B nicht mehr (Liste und Bucket);
--   10 Rechte: `edition_files` und `edition_files_admin` für `authenticated` ja, für `anon` nein.
-- Erwartung je Schritt als Muster in `t_erw`; `99_auswertung` am Ende.
-- Probelauf (`sh scripts/db.sh test supabase/tests/spk090_media_kit_speaker.sql`, 10.10.2026): siehe README.
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('01_speaker_liste_vorher', '^ok'),
  ('02_speaker_bucket_vorher', '^ok'),
  ('03_speaker_fragt_partner', '^42501'),
  ('04_marketing_aendert', '^ok'),
  ('05_hallenplan_bleibt', '^ok'),
  ('06_leere_liste', '^ok'),
  ('07_speaker_nachher', '^ok'),
  ('08_partner', '^ok'),
  ('09_zurueckgenommen', '^ok'),
  ('10_rechte', '^ok');

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_neu uuid;
  v_pa text; v_pb text; v_pc text;
  v_na bigint; v_nb bigint; v_nc bigint; v_nd bigint; v_nl bigint; v_naud bigint;
  v_aud text[]; v_kind text; v_label text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null order by p.created_at limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  if v_ed is null then raise exception 'VORBEDINGUNG: Edition fls27 fehlt'; end if;

  v_pa := v_ed::text || '/media_kit/zz-090-a.zip';
  v_pb := v_ed::text || '/media_kit/zz-090-b.zip';
  v_pc := v_ed::text || '/media_kit/zz-090-c.zip';
  insert into edition_file (edition_id, kind, storage_path, filename, mime, audience)
    values (v_ed, 'media_kit', v_pa, 'zz-090-a.zip', 'application/zip', '{partner,speaker}') returning id into v_a;
  insert into edition_file (edition_id, kind, storage_path, filename, mime, audience)
    values (v_ed, 'media_kit', v_pb, 'zz-090-b.zip', 'application/zip', '{partner}') returning id into v_b;
  insert into edition_file (edition_id, kind, storage_path, filename, mime, audience)
    values (v_ed, 'media_kit', v_pc, 'zz-090-c.zip', 'application/zip', '{speaker}') returning id into v_c;
  insert into edition_file (edition_id, kind, storage_path, filename, mime, audience)
    values (v_ed, 'hallenplan', v_ed::text || '/hallenplan/zz-090-d.pdf', 'zz-090-d.pdf', 'application/pdf', '{speaker}') returning id into v_d;
  insert into storage.objects (bucket_id, name) values ('edition-files', v_pa), ('edition-files', v_pb), ('edition-files', v_pc);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- === Rolle: nur Speaker ===
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'speaker', 'global');
  if is_staff() or is_marketing_team() or is_production_team() or is_partner_team() or not has_role('speaker') then
    raise exception 'VORBEDINGUNG: Konto ist nicht nur Speaker';
  end if;

  -- 01 Liste vorher
  select count(*) filter (where f.id = v_a), count(*) filter (where f.id = v_b),
         count(*) filter (where f.id = v_c), count(*) filter (where f.id = v_d)
    into v_na, v_nb, v_nc, v_nd
    from edition_files('speaker', v_ed) f;
  insert into t_res values ('01_speaker_liste_vorher',
    case when v_na = 1 and v_nb = 0 and v_nc = 1 and v_nd = 1 then 'ok: A, C und D sichtbar, B (nur Partner) nicht'
         else format('FEHLER a=%s b=%s c=%s d=%s', v_na, v_nb, v_nc, v_nd) end);

  -- 02 Bucket vorher
  execute 'set local role authenticated';
  select count(*) filter (where name = v_pa), count(*) filter (where name = v_pb), count(*) filter (where name = v_pc)
    into v_na, v_nb, v_nc
    from storage.objects where bucket_id = 'edition-files' and name in (v_pa, v_pb, v_pc);
  execute 'reset role';
  insert into t_res values ('02_speaker_bucket_vorher',
    case when v_na = 1 and v_nb = 0 and v_nc = 1 then 'ok: Objekte von A und C lesbar, B nicht'
         else format('FEHLER a=%s b=%s c=%s', v_na, v_nb, v_nc) end);

  -- 03 die Zielgruppe wird aus den Rollen abgeleitet, nicht geglaubt
  begin
    perform 1 from edition_files('partner', v_ed) limit 1;
    insert into t_res values ('03_speaker_fragt_partner', 'ALLOWED (BUG)');
  exception when sqlstate '42501' then
    insert into t_res values ('03_speaker_fragt_partner', '42501 (richtig)');
  end;

  -- === Rolle: nur Marketing ===
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'marketing_team', 'global');
  if is_staff() or is_production_team() or not is_marketing_team() then
    raise exception 'VORBEDINGUNG: Konto ist nicht nur Marketing';
  end if;

  -- 04 das Marketing nimmt Speaker bei B dazu
  perform set_edition_file(jsonb_build_object('id', v_b, 'kind', 'media_kit', 'audience', jsonb_build_array('partner', 'speaker')));
  select a.audience, a.kind, a.label_de into v_aud, v_kind, v_label from edition_files_admin(v_ed) a where a.id = v_b;
  select count(*) into v_naud from audit_log where action = 'edition_file.set' and object_id = v_b::text;
  insert into t_res values ('04_marketing_aendert',
    case when v_aud @> array['partner', 'speaker'] and v_aud <@ array['partner', 'speaker']
              and v_kind = 'media_kit' and v_label is null and v_naud = 1
         then 'ok: B trägt Partner und Speaker, Art und Titel unverändert, in edition_files_admin sichtbar, ein Audit-Eintrag'
         else format('FEHLER audience=%s kind=%s titel=%s audit=%s', coalesce(v_aud::text, 'null'), coalesce(v_kind, 'null'), coalesce(v_label, 'null'), v_naud) end);

  -- 05 der Hallenplan gehört der Produktion: keine Zielgruppe für das Marketing
  begin
    perform set_edition_file(jsonb_build_object('id', v_d, 'kind', 'hallenplan', 'audience', jsonb_build_array('partner')));
    insert into t_res values ('05_hallenplan_bleibt', 'ALLOWED (BUG)');
  exception when sqlstate '42501' then
    select audience into v_aud from edition_file where id = v_d;
    insert into t_res values ('05_hallenplan_bleibt',
      case when v_aud = array['speaker'] then 'ok: 42501, die Zielgruppe des Hallenplans blieb'
           else 'FEHLER: 42501, aber audience=' || coalesce(v_aud::text, 'null') end);
  end;

  -- 06 leere Liste: ändern lässt stehen, anlegen macht fünf Zielgruppen (Annahme hinter der Route)
  perform set_edition_file(jsonb_build_object('id', v_a, 'kind', 'media_kit', 'audience', '[]'::jsonb));
  select audience into v_aud from edition_file where id = v_a;
  v_naud := case when v_aud @> array['partner', 'speaker'] and v_aud <@ array['partner', 'speaker'] then 1 else 0 end;
  v_neu := set_edition_file(jsonb_build_object('edition_id', v_ed, 'kind', 'media_kit',
             'storage_path', v_ed::text || '/media_kit/zz-090-neu.zip', 'filename', 'zz-090-neu.zip', 'audience', '[]'::jsonb));
  select cardinality(audience) into v_nl from edition_file where id = v_neu;
  insert into t_res values ('06_leere_liste',
    case when v_naud = 1 and v_nl = 5
         then 'ok: eine leere Liste ändert nichts, beim Anlegen entstehen alle fünf Zielgruppen — die Route gibt nie eine leere Liste weiter'
         else format('FEHLER (Annahme der Route): ändern lässt stehen=%s, anlegen ergibt %s Zielgruppen', v_naud, v_nl) end);

  -- === Rolle: nur Speaker (nachher) ===
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'speaker', 'global');
  if is_staff() or is_marketing_team() or is_production_team() or is_partner_team() or not has_role('speaker') then
    raise exception 'VORBEDINGUNG: Konto ist nicht nur Speaker (nachher)';
  end if;

  -- 07 nachher: A, B, C
  select count(*) filter (where f.id = v_a), count(*) filter (where f.id = v_b), count(*) filter (where f.id = v_c)
    into v_na, v_nb, v_nc
    from edition_files('speaker', v_ed) f;
  v_nl := v_na + v_nb + v_nc;
  execute 'set local role authenticated';
  select count(*) filter (where name = v_pa), count(*) filter (where name = v_pb), count(*) filter (where name = v_pc)
    into v_na, v_nb, v_nc
    from storage.objects where bucket_id = 'edition-files' and name in (v_pa, v_pb, v_pc);
  execute 'reset role';
  insert into t_res values ('07_speaker_nachher',
    case when v_nl = 3 and v_na = 1 and v_nb = 1 and v_nc = 1 then 'ok: Liste und Bucket zeigen A, B und C'
         else format('FEHLER liste=%s bucket a=%s b=%s c=%s', v_nl, v_na, v_nb, v_nc) end);

  -- === Rolle: nur Partner ===
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'partner_contact', 'global');
  if is_staff() or is_marketing_team() or is_production_team() or has_role('speaker') then
    raise exception 'VORBEDINGUNG: Konto ist nicht nur Partner';
  end if;

  -- 08 Partner: A und B, nicht C
  select count(*) filter (where f.id = v_a), count(*) filter (where f.id = v_b), count(*) filter (where f.id = v_c)
    into v_na, v_nb, v_nc
    from edition_files('partner', v_ed) f;
  execute 'set local role authenticated';
  select count(*) filter (where name = v_pa), count(*) filter (where name = v_pb), count(*) filter (where name = v_pc)
    into v_nl, v_naud, v_nd
    from storage.objects where bucket_id = 'edition-files' and name in (v_pa, v_pb, v_pc);
  execute 'reset role';
  insert into t_res values ('08_partner',
    case when v_na = 1 and v_nb = 1 and v_nc = 0 and v_nl = 1 and v_naud = 1 and v_nd = 0
         then 'ok: Partner sieht A und B (Liste und Bucket), C (nur Speaker) nicht'
         else format('FEHLER liste a=%s b=%s c=%s bucket a=%s b=%s c=%s', v_na, v_nb, v_nc, v_nl, v_naud, v_nd) end);

  -- === Rolle: Marketing nimmt Speaker bei B wieder weg ===
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'marketing_team', 'global');
  perform set_edition_file(jsonb_build_object('id', v_b, 'kind', 'media_kit', 'audience', jsonb_build_array('partner')));

  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'speaker', 'global');

  -- 09 zurückgenommen
  select count(*) filter (where f.id = v_b) into v_nl from edition_files('speaker', v_ed) f;
  execute 'set local role authenticated';
  select count(*) filter (where name = v_pb) into v_nb from storage.objects where bucket_id = 'edition-files' and name = v_pb;
  execute 'reset role';
  insert into t_res values ('09_zurueckgenommen',
    case when v_nl = 0 and v_nb = 0 then 'ok: B ist für den Speaker wieder unsichtbar (Liste und Bucket)'
         else format('FEHLER liste=%s bucket=%s', v_nl, v_nb) end);
end $$;

-- 10 Rechte
insert into t_res
select '10_rechte',
       case when count(*) = 2
                  and bool_and(p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')
                               and not has_function_privilege('anon', p.oid, 'execute'))
            then 'ok: edition_files und edition_files_admin — SECURITY DEFINER, authenticated ja, anon nein'
            else 'FEHLER: ' || coalesce(string_agg(p.proname, ', '), 'keine') end
  from pg_proc p
 where p.oid in ('edition_files(text, uuid)'::regprocedure, 'edition_files_admin(uuid)'::regprocedure);

insert into t_res
select '99_auswertung',
       case when bool_and(erfuellt) then 'ALLE ERWARTUNGEN ERFÜLLT (' || count(*) || ')'
            else 'OFFEN: ' || string_agg(step, ', ') filter (where not erfuellt) end
  from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;

select * from t_res order by step;
rollback;
