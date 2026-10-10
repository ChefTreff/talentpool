-- 0313 · Empfehlungs- und Botschafterfelder gestrichen (K-91, ADM-110)
-- Angewendet von der Architektur-Session am 10.10.2026 als 20261010151414.
--
-- Anlass: Befund QS-075 (docs/befund-qs075-spalten-2026-10-09.md, #429); Konrad 09.10.2026 zu K-91: „Empfehlung folgen“ — streichen. Die Empfehlungs-
-- und Botschafterlogik (TAL-005ff.) wurde nie gebaut und steht nicht im Masterplan; kein Leser, kein Schreiber, in der Oberfläche nirgends. Der Altdaten-
-- Import nimmt `invite_code` nicht mit (Plan 09.10.). Die Migration läuft **vor** dem Import.
--
-- Zählprobe: bricht ab (P0001), wenn irgendein Wert steht — dann nichts löschen, Plan fragen. Stand 10.10.2026 gegen live: 0 / 0 / 0 / 0 bei 357 Personen
-- (`is_ambassador` ist `not null default false`; gezählt wird `true`).
--
-- Zwei Funktionen ziehen nach, beide aus dem Snapshot (docs/db-konventionen.md §1), je genau die Zeilen mit den vier Spalten weniger:
--   anonymize_person   : `invite_code = null` im Nullen der Person entfällt (eine Zeile).
--   person_merge_core  : `is_ambassador`, `engagement_score`, `referred_by_person_id` aus `c_keep` (Felder, die nie gefüllt werden) und der Block „Wer von der
--                        zweiten Person geworben wurde …“ (Verweise der Geworbenen umhängen) entfallen; die Fremdschlüssel-Schleife nimmt die Spalte nicht
--                        mehr aus. Der Rückweg (`unmerge_persons`) bleibt unberührt: er liest die gespeicherte Zeile mit `jsonb_populate_record`, ein
--                        unbekannter Schlüssel in einer alten Sicherung wird dort ignoriert; ein Umhängen von `referred_by_person_id` kann in keiner Sicherung
--                        stehen (0 belegte Zeilen).
--
-- Mit den Spalten fallen von selbst: der Fremdschlüssel `person_referred_by_person_id_fkey`, der Index `person_referred_by_idx` und die vier Spalten-Grants
-- `select … to authenticated`. Keine Policy, keine Sicht, kein Trigger nennt die Spalten (Katalogprobe gegen live 10.10.2026).
--
-- Fehlerschlüssel: keine neuen.
set search_path = public, extensions;

do $$
declare v_inv integer; v_ref integer; v_amb integer; v_eng integer;
begin
  select count(*) filter (where invite_code is not null), count(*) filter (where referred_by_person_id is not null),
         count(*) filter (where is_ambassador), count(*) filter (where engagement_score is not null)
    into v_inv, v_ref, v_amb, v_eng from person;
  if v_inv + v_ref + v_amb + v_eng > 0 then
    raise exception 'Spalten nicht leer: invite_code=%, referred_by_person_id=%, is_ambassador=%, engagement_score=%; nichts löschen, Plan fragen', v_inv, v_ref, v_amb, v_eng
      using errcode = 'P0001';
  end if;
end $$;

create or replace function anonymize_person(p_person_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_hash text; v_profile uuid[];
begin
  if p_person_id is null then raise exception 'person_not_found' using errcode = 'P0002'; end if;
  perform log_audit('profile.delete', 'person', p_person_id::text, null, null);

  select array_agg(sp.id) into v_profile from speaker_profile sp where sp.person_id = p_person_id;
  v_profile := coalesce(v_profile, '{}');

  -- 1 · Sperrliste. Der Hash bleibt, die Adresse geht.
  insert into suppression (email_hash, reason)
    select email_hash(email::text), 'profile_deleted' from person_email where person_id = p_person_id
  on conflict (email_hash) do nothing;
  select email_hash(pe.email::text) into v_hash
    from person_email pe where pe.person_id = p_person_id and pe.is_primary;

  -- 2 · Dateien zum Wegräumen anmelden, **bevor** die Zeilen fallen: danach
  --     wüsste niemand mehr, welche Pfade gemeint waren.
  insert into storage_purge_queue (bucket, path)
    select 'speaker-assets', sa.storage_path from speaker_asset sa where sa.profile_id = any (v_profile)
  on conflict (bucket, path) do nothing;
  -- Porträt aus dem Teilnehmer-Profil (TAL-012).
  insert into storage_purge_queue (bucket, path)
    select 'person-photos', p.photo_path from person p
     where p.id = p_person_id and p.photo_path is not null
  on conflict (bucket, path) do nothing;
  -- Lebenslauf aus dem Teilnehmer-Profil (TAL-013, B3).
  insert into storage_purge_queue (bucket, path)
    select 'person-cv', p.cv_path from person p
     where p.id = p_person_id and p.cv_path is not null
  on conflict (bucket, path) do nothing;

  -- 3 · Zeilen, die ohne die Person keinen Sinn mehr haben.
  delete from person_interest            where person_id = p_person_id;
  delete from person_acquisition_channel where person_id = p_person_id;
  delete from person_language            where person_id = p_person_id;
  delete from role_assignment            where person_id = p_person_id;
  -- Ansprechperson einer Organisation kann nur sein, wen es gibt.
  delete from org_membership             where person_id = p_person_id;
  delete from speaker_asset  where profile_id = any (v_profile);
  -- Anreise ist reine Logistik eines vergangenen Termins: Flugnummer, Ankunft,
  -- Notiz. Nichts davon trägt eine Zahl, die später jemand braucht.
  delete from speaker_travel where profile_id = any (v_profile);

  -- 4 · Die Person selbst. Grobe Merkmale bleiben für die Statistik
  --     (career_level, study_field, country, tier, occupation_status) — sie
  --     beschreiben eine Gruppe, keinen Menschen. Freitext, Kontaktdaten und
  --     alles nach Art. 9 DSGVO (Ernährung, Geschlecht) fällt weg.
  update person set
    first_name = null, last_name = null, birthdate = null, phone = null, phone_e164 = null,
    linkedin_url = null, linkedin_normalized = null,
    employer_name = null, university = null, title = null, city = null,
    nationality = null, auth_user_id = null,
    gender = null, diet = null, diet_note = null, photo_path = null,
    job_title = null, study_program_label = null, cv_path = null,
    salutation_de = null, salutation_en = null, self_assessment = null,
    deleted_at = now()
  where id = p_person_id;

  delete from person_email where person_id = p_person_id and not is_primary;
  update person_email
     set email = ('deleted+' || p_person_id::text || '@anonym.invalid')::citext, verified = false
   where person_id = p_person_id and is_primary;

  -- 5 · Mail-Protokoll: die Zeile bleibt als Zahl (wie viele Einladungen gingen
  --     raus), die Adresse wird zum Hash und die eingesetzten Angaben — dort
  --     steht der Name im Klartext — verschwinden.
  update mail_log
     set to_email = ('deleted:' || coalesce(v_hash, p_person_id::text))::citext,
         meta = coalesce(meta, '{}'::jsonb) - 'vars'
   where person_id = p_person_id;

  -- 6 · Freitexte und Fremdschlüssel in allen übrigen Tabellen mit `person_id`.
  --     Was bleibt, ist jeweils der zählbare Teil: Status, Typ, Zeitpunkt.
  update application      set answers = '{}'::jsonb where person_id = p_person_id;
  update hack_application set motivation = null, team_pref = null, note = null,
                              github_url = null, website_url = null, behance_url = null
   where person_id = p_person_id;
  -- Der Einwilligungsnachweis bleibt — er ist der Beleg, dass wir durften, was
  -- wir getan haben. Das Gerät, von dem sie kam, ist dafür ohne Bedeutung.
  update consent_record   set user_agent = null where person_id = p_person_id;
  -- Fremdsystem-Verweise zeigen auf Kopien, die dort noch den Namen tragen;
  -- der Verweis selbst darf nicht bleiben (siehe Kopf, vivenu).
  update registration     set external_ref = null, external_ids = '{}'::jsonb where person_id = p_person_id;
  update shift_assignment set decline_reason = null where person_id = p_person_id;
  update volunteer_profile set availability = null, buddy_note = null, notes_internal = null,
                               decision_note = null, coupon_error = null, buddy_person_id = null
   where person_id = p_person_id;
  update ticket set holder_email = null, holder_first_name = null, holder_last_name = null,
                    holder_company = null, holder_position = null, buyer_email = null,
                    team_note = null, extra_fields = '{}'::jsonb
   where person_id = p_person_id;
  -- ADM-076: Begleittickets hängen am Profil des Speakers, nicht an einer Person (`person_id` ist leer). Die Begleitung hat
  --         hier nie ein Konto gehabt und kann die Löschung nicht selbst verlangen — wie der Kontakt ohne Portalzugang (0127)
  --         fällt sie mit dem Profil, das sie eingetragen hat. Name und Adresse gehen; Status, Pass und Lounge bleiben als Zahl.
  --         Was bei vivenu steht (ausgestellte Tickets), räumt die externe Löschung dort auf.
  update ticket set holder_email = null, holder_first_name = null, holder_last_name = null,
                    holder_company = null, holder_position = null, buyer_email = null,
                    team_note = null, extra_fields = '{}'::jsonb
   where source = 'speaker_companion' and speaker_profile_id = any (v_profile);

  -- 7 · Speaker-Profil und was daran hängt.
  update speaker_profile set
    bio_short_de = null, bio_short_en = null, bio_long_de = null, bio_long_en = null,
    job_title = null, organization_name = null, internal_notes = null,
    -- `tech_rider` und `socials` sind `not null default '{}'` — hier gehoert der
    -- leere Wert hin, nicht `null` (Probelauf der Architektur-Session, 23502).
    tech_rider = '{}'::jsonb, socials = '{}'::jsonb,
    decline_reason = null, photo_asset_id = null,
    -- Der Kontakt ohne Portalzugang (0127) gehoert einer **dritten** Person:
    -- Agentur, Office, Management. Sie hat hier nie ein Konto gehabt und kann
    -- die Loeschung auch nicht selbst verlangen — deshalb faellt sie mit dem
    -- Profil, das sie eingetragen hat. Keine Sperrliste: die Adresse stand nie
    -- in einem Verteiler, das Portal kann an sie gar nicht senden (`queue_mail`
    -- braucht eine `person_id`, und eine hat sie nicht).
    contact_first_name = null, contact_last_name = null, contact_email = null,
    contact_phone = null, contact_kind = null, contact_consent_at = null,
    -- LEAD-039: die Einordnung ist eine Einschätzung über die Person, und
    -- `contact_via` nennt, über wen sie läuft.
    category = null, topic_cluster = null, topic_role = null, priority = null,
    recommended_format = null, contact_via = null, outreach_channel = null
   where person_id = p_person_id;
  delete from speaker_stage_candidate where profile_id = any (v_profile);
  -- LEAD-039 Schnitt 2: der Verlauf über die Person geht mit. Einträge, die sie
  -- selbst über andere geschrieben hat, bleiben; sie zeigen dann den
  -- anonymisierten Namen.
  delete from speaker_activity where profile_id = any (v_profile);
  -- Titel und Beschreibung sind der veröffentlichte Programmpunkt und gehören
  -- zur Veranstaltung, nicht zur Person; die interne Notiz nicht.
  update session_submission  set notes = null      where speaker_profile_id = any (v_profile);
  update hospitality_booking set details = '{}'::jsonb, team_note = null where profile_id = any (v_profile);

  -- 8 · Reisekosten. Der Antrag bleibt als Buchung (§147 AO), die Bankdaten
  --     nicht: bezahlt ist bezahlt, und ein offener Antrag ist eine Hürde, die
  --     bis hierher gar nicht kommt.
  delete from vault.secrets
   where id in (select ec.bank_secret_id from expense_claim ec
                 where ec.profile_id = any (v_profile) and ec.bank_secret_id is not null);
  update expense_claim set bank_secret_id = null, bank_masked = null, bank_holder = null,
                           review_note = null
   where profile_id = any (v_profile);

  -- 9 · Der selbst geschriebene Grund ist Freitext von dieser Person und darf
  --     ihre Löschung nicht überleben. Status, Hürden und Zeitpunkt bleiben —
  --     das ist der Nachweis, und der trägt keinen Personenbezug.
  update profile_deletion_request set reason = null where person_id = p_person_id;

  -- 10 · ADM-036: Zusammenführungen, in denen diese Person die bleibende war,
  --      tragen im Protokoll die Daten der zweiten Person (für den Rückweg).
  --      Mit der Löschung gibt es keinen Rückweg mehr; die Zeile bleibt als
  --      Nachweis, dass zusammengeführt wurde.
  update person_merge_log set payload = null where surviving_person_id = p_person_id;

  -- 11 · ADM-077: der Hinweis an einer Side-Event-Einladung (Unverträglichkeit, Begleitung) ist Freitext von dieser Person und
  --      darf ihre Löschung nicht überleben; der Link aus der Einladungsmail wird tot. Stand, Zeitpunkte und Anzahl der Plätze
  --      bleiben — das ist die Zahl, auf der die Planung stand.
  update side_event_invite set note = null, token_hash = null where profile_id = any (v_profile);
end $$;;

create or replace function person_merge_core(p_survivor uuid, p_merged uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_s jsonb; v_m jsonb; v_fk record; v_pk_expr text; v_pks jsonb; v_pk jsonb; v_row jsonb;
  v_moved jsonb := '[]'; v_moved_rep jsonb := '[]'; v_deleted jsonb := '[]'; v_dedup_rep jsonb := '[]';
  v_conflicts jsonb := '[]'; v_blocking text[] := '{}'; v_roles_before jsonb := '[]';
  v_emails jsonb; v_fill jsonb := '{}'; v_cols text; v_key text;
  v_ok jsonb; v_del jsonb; v_conf integer; v_account uuid;
  -- Mengen ohne eigene Aussage: die doppelte Zeile der zweiten Person darf fallen.
  c_dedup constant text[] := array['person_interest', 'person_language', 'person_acquisition_channel',
                                   'role_assignment', 'speaker_portal_selection', 'org_membership'];
  -- Felder, die nie gefüllt werden: Identität, Konto, Zustand, Herkunft.
  c_keep constant text[] := array['id', 'auth_user_id', 'created_at', 'updated_at', 'deleted_at',
                                  'access_blocked_at', 'tier', 'source_first'];
begin
  if p_survivor is null or p_merged is null then raise exception 'person_not_found' using errcode = 'P0002'; end if;
  if p_survivor = p_merged then raise exception 'same_person' using errcode = '22023'; end if;

  select to_jsonb(p) into v_s from person p where p.id = p_survivor for update;
  select to_jsonb(p) into v_m from person p where p.id = p_merged for update;
  if v_s is null or v_m is null then raise exception 'person_not_found' using errcode = 'P0002'; end if;
  if v_s->>'deleted_at' is not null or v_m->>'deleted_at' is not null then
    raise exception 'person_deleted' using errcode = '22023';
  end if;

  -- Konto: höchstens eines, und kein gesperrtes umziehen.
  if v_m->>'auth_user_id' is not null then
    if v_s->>'auth_user_id' is not null then
      v_blocking := array_append(v_blocking, 'both_accounts');
    elsif v_m->>'access_blocked_at' is not null then
      v_blocking := array_append(v_blocking, 'account_blocked');
    else
      v_account := (v_m->>'auth_user_id')::uuid;
    end if;
  end if;

  -- E-Mail-Adressen: die zweite Person bringt ihre als weitere Adressen mit.
  select coalesce(jsonb_agg(jsonb_build_object('id', pe.id, 'primary', pe.is_primary)), '[]')
    into v_emails from person_email pe where pe.person_id = p_merged;
  update person_email set is_primary = false where person_id = p_merged and is_primary;
  update person_email set person_id = p_survivor where person_id = p_merged;

  -- Dublettenpaare der zweiten Person: fallen (gesichert); die Suche findet
  -- neue Paare der ersten Person beim nächsten Lauf.
  select coalesce(jsonb_agg(to_jsonb(d)), '[]') into v_row
    from potential_duplicate d where p_merged in (d.person_id_a, d.person_id_b);
  if jsonb_array_length(v_row) > 0 then
    delete from potential_duplicate d where p_merged in (d.person_id_a, d.person_id_b);
    v_deleted := v_deleted || jsonb_build_object('t', 'potential_duplicate', 'rows', v_row);
  end if;

  -- Alle übrigen Fremdschlüssel auf person(id), aus dem Katalog gelesen.
  for v_fk in
    select c.conrelid as rel, c.conrelid::regclass::text as tbl, r.relname as base, a.attname as col
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.person'::regclass and array_length(c.conkey, 1) = 1
       and not (c.conrelid = 'public.person'::regclass)
       and not (c.conrelid = 'public.person_email'::regclass)
       and not (c.conrelid = 'public.potential_duplicate'::regclass)
     order by 2, 4
  loop
    -- Zeilenschlüssel: der Primärschlüssel, sonst die ganze Zeile.
    select 'jsonb_build_object(' || string_agg(quote_literal(pa.attname) || ', t.' || quote_ident(pa.attname), ', ' order by k.ord) || ')'
      into v_pk_expr
      from pg_index i
      cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
      join pg_attribute pa on pa.attrelid = i.indrelid and pa.attnum = k.attnum
     where i.indrelid = v_fk.rel and i.indisprimary;
    v_pk_expr := coalesce(v_pk_expr, 'to_jsonb(t)');

    execute format('select coalesce(jsonb_agg(%s), ''[]'') from %s t where t.%I = $1', v_pk_expr, v_fk.tbl, v_fk.col)
      into v_pks using p_merged;
    continue when jsonb_array_length(v_pks) = 0;

    v_ok := '[]'; v_del := '[]'; v_conf := 0;
    begin
      execute format('update %s set %I = $1 where %I = $2', v_fk.tbl, v_fk.col, v_fk.col) using p_survivor, p_merged;
      -- Für den Rückweg ohne die umgehängte Spalte selbst: steckt sie im
      -- Primärschlüssel (Interessen, Sprachen, Session-Speaker), trüge der
      -- Schlüssel sonst die alte Person und fände die Zeile nicht wieder.
      select jsonb_agg(e.value - v_fk.col::text) into v_ok from jsonb_array_elements(v_pks) e;
    exception when unique_violation then
      -- Zeilenweise: welche Zeile kollidiert, und darf sie fallen?
      for v_pk in select value from jsonb_array_elements(v_pks) loop
        begin
          execute format('update %s t set %I = $1 where t.%I = $2 and to_jsonb(t) @> $3', v_fk.tbl, v_fk.col, v_fk.col)
            using p_survivor, p_merged, v_pk;
          v_ok := v_ok || jsonb_build_array(v_pk - v_fk.col::text);
        exception when unique_violation then
          if v_fk.base = any (c_dedup) and v_fk.tbl not like '%.%' then
            if v_fk.base = 'org_membership' then
              -- Dieselbe Organisation: Rollen vereinigen, Vorher-Stand sichern.
              select v_roles_before || coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'roles', to_jsonb(s.roles))), '[]')
                into v_roles_before
                from org_membership s join org_membership m on m.org_id = s.org_id
               where s.person_id = p_survivor and m.person_id = p_merged and to_jsonb(m) @> v_pk;
              update org_membership s
                 set roles = (select array_agg(distinct x order by x) from unnest(s.roles || m.roles) x)
                from org_membership m
               where m.org_id = s.org_id and s.person_id = p_survivor and m.person_id = p_merged and to_jsonb(m) @> v_pk;
            end if;
            execute format('delete from %s t where t.%I = $1 and to_jsonb(t) @> $2 returning to_jsonb(t)', v_fk.tbl, v_fk.col)
              into v_row using p_merged, v_pk;
            v_del := v_del || jsonb_build_array(v_row);
          else
            v_conf := v_conf + 1;
          end if;
        end;
      end loop;
    end;

    if jsonb_array_length(v_ok) > 0 then
      v_moved := v_moved || jsonb_build_object('t', v_fk.tbl, 'c', v_fk.col, 'pk', v_ok);
      v_moved_rep := v_moved_rep || jsonb_build_object('table', v_fk.tbl, 'column', v_fk.col, 'rows', jsonb_array_length(v_ok));
    end if;
    if jsonb_array_length(v_del) > 0 then
      v_deleted := v_deleted || jsonb_build_object('t', v_fk.tbl, 'rows', v_del);
      v_dedup_rep := v_dedup_rep || jsonb_build_object('table', v_fk.tbl, 'rows', jsonb_array_length(v_del));
    end if;
    if v_conf > 0 then
      v_conflicts := v_conflicts || jsonb_build_object('table', v_fk.tbl, 'column', v_fk.col, 'rows', v_conf);
    end if;
  end loop;
  if jsonb_array_length(v_conflicts) > 0 then v_blocking := array_append(v_blocking, 'conflicts'); end if;

  -- Leere Felder der ersten Person aus der zweiten füllen — nie überschreiben.
  select coalesce(jsonb_object_agg(a.attname, v_m->a.attname), '{}') into v_fill
    from pg_attribute a
   where a.attrelid = 'public.person'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
     and a.attname <> all (c_keep)
     and jsonb_typeof(coalesce(v_s->a.attname, 'null'::jsonb)) = 'null'
     and jsonb_typeof(coalesce(v_m->a.attname, 'null'::jsonb)) <> 'null';
  if v_fill <> '{}' then
    select string_agg(format('%I = r.%I', k, k), ', ') into v_cols from jsonb_object_keys(v_fill) k;
    execute format('update person p set %s from jsonb_populate_record(null::person, $1) r where p.id = $2', v_cols)
      using v_m, p_survivor;
  end if;

  -- Konto umziehen und die zweite Person löschen — nur ohne Hindernis. Mit
  -- Hindernis bliebe sonst über `on delete cascade` genau das auf der Strecke,
  -- was den Konflikt ausmacht.
  if cardinality(v_blocking) = 0 then
    if v_account is not null then
      update person set auth_user_id = null where id = p_merged;
      update person set auth_user_id = v_account where id = p_survivor;
    end if;
    delete from person where id = p_merged;
  end if;

  return jsonb_build_object(
    'report', jsonb_build_object(
      'survivor_id', p_survivor, 'merged_id', p_merged,
      'moved', v_moved_rep, 'deduplicated', v_dedup_rep, 'conflicts', v_conflicts,
      'filled', (select coalesce(jsonb_agg(k order by k), '[]') from jsonb_object_keys(v_fill) k),
      'emails', jsonb_array_length(v_emails),
      'account_moved', v_account is not null and cardinality(v_blocking) = 0,
      'blocking', to_jsonb(v_blocking)),
    'undo', jsonb_build_object(
      'survivor_id', p_survivor, 'merged_row', v_m, 'survivor_before', v_s,
      'moved', v_moved, 'deleted', v_deleted, 'roles_before', v_roles_before,
      'emails', v_emails, 'filled', v_fill, 'account', v_account));
end $$;;

alter table person drop column invite_code, drop column referred_by_person_id, drop column is_ambassador, drop column engagement_score;

select harden_definer_functions();
