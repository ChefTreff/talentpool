-- 0000 · Portfolio-Links in der Hackathon-Bewerbung (HACK-007).
--
-- Anlass: HACK-007 (Konrad 24.09., Feldvorschlag TAL-013 Punkt C3: „nur beim Hackathon“) —
-- GitHub, Website, Behance werden **nur** in der Hackathon-Bewerbung erhoben, nicht im
-- allgemeinen Teilnehmer-Profil.
--
--   * `hack_application.github_url`, `website_url`, `behance_url` (text, optional, CHECK https).
--   * `apply_hackathon` (Basis: Snapshot): liest die drei Felder, prüft je Feld den Dienst
--     (github.com, behance.net; Website beliebig, https, max. 300 Zeichen); Fehler 22023
--     `invalid_url` (detail = Feld, Schlüssel besteht).
--   * `my_hack` (Basis: Snapshot): gibt die drei Felder in `application` zurück.
--   * `anonymize_person` (Basis: Snapshot): leert die drei Felder beim Profil-Löschen.
-- Die Sicht für das Team (Bewerbungen auswählen) kommt mit ADM-055 in den Admin.
-- Test: supabase/tests/v6_hack_portfolio.sql
set search_path = public, extensions;

alter table hack_application
  add column if not exists github_url  text,
  add column if not exists website_url text,
  add column if not exists behance_url text;
alter table hack_application drop constraint if exists hack_application_portfolio_https_chk;
alter table hack_application add constraint hack_application_portfolio_https_chk check (
  (github_url is null or github_url ~* '^https://') and
  (website_url is null or website_url ~* '^https://') and
  (behance_url is null or behance_url ~* '^https://'));
comment on column hack_application.github_url is 'GitHub-Profil (HACK-007), nur in der Hackathon-Bewerbung.';

create or replace function apply_hackathon(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid; v_id uuid; v_skill text;
        v_github text; v_website text; v_behance text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := hack_edition(nullif(p_data->>'edition_id', '')::uuid);
  if v_ed is null then raise exception 'edition_not_found' using errcode = 'P0002'; end if;

  foreach v_skill in array coalesce(
    (select array_agg(value::text) from jsonb_array_elements_text(p_data->'skills') as t(value)), '{}') loop
    if not is_vocab_key('hack_skill', v_skill) then
      raise exception 'invalid_skill' using errcode = '22023', detail = v_skill;
    end if;
  end loop;

  -- Portfolio-Links (HACK-007): nur https, je Feld der erwartete Dienst; leer = nicht gesetzt.
  v_github := nullif(btrim(p_data->>'github_url'), '');
  v_website := nullif(btrim(p_data->>'website_url'), '');
  v_behance := nullif(btrim(p_data->>'behance_url'), '');
  if v_github is not null and v_github !~* '^https://(www\.)?github\.com/[^\s]+$' then
    raise exception 'invalid_url' using errcode = '22023', detail = 'github_url';
  end if;
  if v_website is not null and (v_website !~* '^https://[^\s/]+\.[^\s]+$' or length(v_website) > 300) then
    raise exception 'invalid_url' using errcode = '22023', detail = 'website_url';
  end if;
  if v_behance is not null and v_behance !~* '^https://(www\.)?behance\.net/[^\s]+$' then
    raise exception 'invalid_url' using errcode = '22023', detail = 'behance_url';
  end if;

  insert into hack_application (person_id, edition_id, skills, motivation, team_pref, github_url, website_url, behance_url)
  values (v_me, v_ed,
          coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_data->'skills') as t(value)), '{}'),
          nullif(btrim(p_data->>'motivation'), ''), nullif(btrim(p_data->>'team_pref'), ''),
          v_github, v_website, v_behance)
  on conflict (person_id, edition_id) do update set
    skills = excluded.skills, motivation = excluded.motivation, team_pref = excluded.team_pref,
    github_url = excluded.github_url, website_url = excluded.website_url, behance_url = excluded.behance_url,
    status = case when hack_application.status = 'withdrawn' then 'applied' else hack_application.status end
  returning id into v_id;

  perform log_audit('hack.applied', 'hack_application', v_id::text, null, null);
  return v_id;
end $$;

create or replace function my_hack(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid; v_app hack_application; v_team hack_team;
        v_sub hack_submission; v_ch hack_challenge;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := hack_edition(p_edition_id);
  select * into v_app from hack_application where person_id = v_me and edition_id = v_ed;
  select t.* into v_team from hack_team t join hack_team_member m on m.team_id = t.id
   where m.person_id = v_me and t.edition_id = v_ed;
  if v_team.id is not null then
    select * into v_sub from hack_submission where team_id = v_team.id;
    select * into v_ch from hack_challenge where id = v_team.challenge_id;
  end if;

  return jsonb_build_object(
    'edition_id', v_ed,
    'application', case when v_app.id is null then null else jsonb_build_object(
      'id', v_app.id, 'status', v_app.status, 'skills', to_jsonb(v_app.skills),
      'motivation', v_app.motivation, 'team_pref', v_app.team_pref, 'applied_at', v_app.applied_at,
      'github_url', v_app.github_url, 'website_url', v_app.website_url, 'behance_url', v_app.behance_url) end,
    'team', case when v_team.id is null then null else jsonb_build_object(
      'id', v_team.id, 'name', v_team.name, 'status', v_team.status,
      -- Den Beitrittscode sieht nur, wer schon drin ist.
      'join_code', v_team.join_code, 'discord_url', v_team.discord_url,
      'members', (select coalesce(jsonb_agg(jsonb_build_object(
                    'person_id', p.id, 'name', nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
                    'is_captain', m.is_captain) order by m.joined_at), '[]'::jsonb)
                  from hack_team_member m join person p on p.id = m.person_id where m.team_id = v_team.id)) end,
    'challenge', case when v_ch.id is null then null else jsonb_build_object(
      'id', v_ch.id, 'title', hack_text(v_ch.title_de, v_ch.title_en, p_language),
      'description', hack_text(v_ch.description_de, v_ch.description_en, p_language),
      'prizes', v_ch.prizes, 'resources', v_ch.resources, 'criteria', v_ch.criteria) end,
    'submission', case when v_sub.id is null then null else jsonb_build_object(
      'url', v_sub.url, 'repo_url', v_sub.repo_url, 'notes', v_sub.notes,
      'submitted_at', v_sub.submitted_at) end);
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
    nationality = null, invite_code = null, auth_user_id = null,
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
end $$;

select harden_definer_functions();
