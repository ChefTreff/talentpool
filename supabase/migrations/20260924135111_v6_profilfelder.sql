-- 0161 · Welle 6 · Profilfelder Teilnehmer-Portal (TAL-013): Vokabular, Spalten, person_language, Lebenslauf-Bucket person-cv, set_my_cv, Vokabular-Wächter
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924135111.
-- 00NN · Profilfelder Teilnehmer-Portal (TAL-013): Spalten, Vokabular, Sprachen, Lebenslauf.
--
-- Anlass: Feldvorschlag `docs/talent-felder-vorschlag.md`, Konrads Antworten §5 (24.09.2026):
-- A1–A10, B2–B5, C1 (abgespeckt) und C2 annehmen; Funktionsbereich Einfachauswahl; alles
-- optional außer Berufserfahrung; Werte aus A5–A8 gehen nur mit `consent_share` in
-- Bewerbungen an Partner, nie als Liste.
--
-- Diese Migration trägt das Datenmodell für:
--   A3 `person.job_title` (Freitext) · A4 `person.study_program_label` (Studiengang Ebene 3,
--   entschieden 08.09.) · A5 Karrieremöglichkeiten (`person_interest`, Vokabular liegt) ·
--   A6 `person.job_openness` · A7 `person.function_area` (Einfachauswahl) · A8 Ziele für den
--   Summit (`person_interest`) · B3 Lebenslauf als **Datei** (`person.cv_path`, privater Bucket
--   `person-cv`, lesen: Person, Team, gastgebender Partner einer Bewerbung mit `consent_share`)
--   · B4 Sprachen mit Niveau (`person_language`) · B5 `person.graduation_year` · C1 Skills
--   (15 Werte, `person_interest`) · C2 `person.availability`, Arbeitsweise (`person_interest`),
--   `person.mobility`.
-- A1, A2, A9 und B2 sind reine Oberfläche (Spalten und Einwilligungsarten liegen).
--
-- Regeln:
--   * Neue Vokabular-Spalten prüft ein Trigger (`is_vocab_key`), aber nur, wenn sich der Wert
--     ändert — ein später deaktivierter Begriff blockiert sonst jedes weitere Speichern.
--     Fehler 22023 `invalid_vocab_value` (detail = Spalte).
--   * Schreiben per Spalten-Grant wie die übrigen Profilfelder; `cv_path` nur über
--     `set_my_cv` (Pfad und Objekt geprüft, altes Dokument in die Löschliste).
--   * `person.cv_url` (offene URL, 0001) bleibt unberührt und wird nicht verwendet — sie
--     kann mit der Pronomen-Spalte fallen (Architektur-Session).
--   * `anonymize_person` (Basis: Snapshot nach 20260924101125): Lebenslauf anmelden,
--     `person_language` löschen, `job_title`, `study_program_label`, `cv_path` leeren. Grobe
--     Merkmale (Funktionsbereich, Abschlussjahr, Verfügbarkeit …) bleiben wie Status und
--     Level für die Statistik.
-- Fehlerschlüssel neu: `invalid_vocab_value` (lib/rpc-error.ts + Wörterbücher im selben PR).
-- Test: supabase/tests/v6_profilfelder.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Vokabular

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active)
select v.* from (values
  -- A6 Offen für Jobangebote
  ('job_openness', 'active',   'Ich suche aktiv',          'Actively looking',  1, true),
  ('job_openness', 'open',     'Offen für Angebote',       'Open to offers',    2, true),
  ('job_openness', 'not_open', 'Aktuell nicht offen',      'Not open right now', 3, true),
  -- A7 Funktionsbereich (Meeting-Paket Teil B §5, 16 Werte)
  ('function_area', 'consulting_strategy', 'Consulting & Strategie',      'Consulting & strategy',       1, true),
  ('function_area', 'finance_investment',  'Finance & Investment',        'Finance & investment',        2, true),
  ('function_area', 'product_project',     'Produkt- & Projektmanagement', 'Product & project management', 3, true),
  ('function_area', 'software_it',         'Software-Entwicklung & IT',   'Software engineering & IT',   4, true),
  ('function_area', 'data_ai',             'Data & AI',                   'Data & AI',                   5, true),
  ('function_area', 'marketing_brand',     'Marketing & Brand',           'Marketing & brand',           6, true),
  ('function_area', 'sales_bizdev',        'Sales & Business Development', 'Sales & business development', 7, true),
  ('function_area', 'operations',          'Operations',                  'Operations',                  8, true),
  ('function_area', 'hr_people',           'HR & People',                 'HR & people',                 9, true),
  ('function_area', 'design_creative',     'Design & Kreation',           'Design & creative',          10, true),
  ('function_area', 'entrepreneurship',    'Gründung & Entrepreneurship', 'Entrepreneurship',           11, true),
  ('function_area', 'legal',               'Recht',                       'Legal',                      12, true),
  ('function_area', 'sustainability',      'Nachhaltigkeit',              'Sustainability',             13, true),
  ('function_area', 'research',            'Forschung',                   'Research',                   14, true),
  ('function_area', 'general_management',  'General Management',          'General management',         15, true),
  ('function_area', 'other',               'Sonstiges',                   'Other',                      16, true),
  -- A8 Ziele für den Summit
  ('summit_goal', 'network',    'Netzwerk aufbauen',       'Build my network',    1, true),
  ('summit_goal', 'job',        'Job oder Praktikum finden', 'Find a job or internship', 2, true),
  ('summit_goal', 'learn',      'Lernen und Inspiration',  'Learn and get inspired', 3, true),
  ('summit_goal', 'investors',  'Investoren treffen',      'Meet investors',      4, true),
  ('summit_goal', 'customers',  'Kunden und Partner finden', 'Find customers and partners', 5, true),
  ('summit_goal', 'other',      'Sonstiges',               'Other',               6, true),
  -- C1 Skills, abgespeckt (Konrad: nächstes Jahr erweitern)
  ('skill', 'strategy',         'Strategie',               'Strategy',            1, true),
  ('skill', 'finance',          'Finanzen & Controlling',  'Finance & controlling', 2, true),
  ('skill', 'data_analysis',    'Datenanalyse',            'Data analysis',       3, true),
  ('skill', 'programming',      'Programmierung',          'Programming',         4, true),
  ('skill', 'ai_ml',            'KI & Machine Learning',   'AI & machine learning', 5, true),
  ('skill', 'product',          'Produktentwicklung',      'Product development', 6, true),
  ('skill', 'project',          'Projektmanagement',       'Project management',  7, true),
  ('skill', 'marketing',        'Marketing & Social Media', 'Marketing & social media', 8, true),
  ('skill', 'sales',            'Vertrieb & Verhandlung',  'Sales & negotiation', 9, true),
  ('skill', 'design',           'Design & UX',             'Design & UX',        10, true),
  ('skill', 'communication',    'Kommunikation & Präsentation', 'Communication & presenting', 11, true),
  ('skill', 'leadership',       'Führung',                 'Leadership',         12, true),
  ('skill', 'operations',       'Prozesse & Operations',   'Processes & operations', 13, true),
  ('skill', 'legal',            'Recht & Compliance',      'Legal & compliance', 14, true),
  ('skill', 'research',         'Forschung & Wissenschaft', 'Research & science', 15, true),
  -- C2 Verfügbarkeit, Arbeitsweise, Mobilität
  ('availability', 'now',        'Sofort',                 'Immediately',         1, true),
  ('availability', 'm1_3',       'In 1–3 Monaten',         'In 1–3 months',       2, true),
  ('availability', 'm3_6',       'In 3–6 Monaten',         'In 3–6 months',       3, true),
  ('availability', 'm6_plus',    'In mehr als 6 Monaten',  'In more than 6 months', 4, true),
  ('availability', 'info_only',  'Nur zur Information',    'Just for information', 5, true),
  ('work_mode', 'remote',        'Remote',                 'Remote',              1, true),
  ('work_mode', 'hybrid',        'Hybrid',                 'Hybrid',              2, true),
  ('work_mode', 'onsite',        'Vor Ort',                'On site',             3, true),
  ('work_mode', 'flexible',      'Flexibel',               'Flexible',            4, true),
  ('mobility', 'none',           'Kein Umzug',             'Not willing to relocate', 1, true),
  ('mobility', 'germany',        'Innerhalb Deutschlands', 'Within Germany',      2, true),
  ('mobility', 'europe',         'Innerhalb Europas',      'Within Europe',       3, true),
  ('mobility', 'worldwide',      'Weltweit',               'Worldwide',           4, true),
  -- B4 Sprachen und Niveau
  ('spoken_language', 'de', 'Deutsch',       'German',     1, true),
  ('spoken_language', 'en', 'Englisch',      'English',    2, true),
  ('spoken_language', 'fr', 'Französisch',   'French',     3, true),
  ('spoken_language', 'es', 'Spanisch',      'Spanish',    4, true),
  ('spoken_language', 'it', 'Italienisch',   'Italian',    5, true),
  ('spoken_language', 'pt', 'Portugiesisch', 'Portuguese', 6, true),
  ('spoken_language', 'nl', 'Niederländisch', 'Dutch',     7, true),
  ('spoken_language', 'pl', 'Polnisch',      'Polish',     8, true),
  ('spoken_language', 'tr', 'Türkisch',      'Turkish',    9, true),
  ('spoken_language', 'ar', 'Arabisch',      'Arabic',    10, true),
  ('spoken_language', 'ru', 'Russisch',      'Russian',   11, true),
  ('spoken_language', 'zh', 'Chinesisch',    'Chinese',   12, true),
  ('spoken_language', 'other', 'Weitere',    'Other',     13, true),
  ('language_level', 'native', 'Muttersprache',            'Native',                1, true),
  ('language_level', 'c',      'Sehr gut (C1–C2)',         'Fluent (C1–C2)',        2, true),
  ('language_level', 'b',      'Gut (B1–B2)',              'Good (B1–B2)',          3, true),
  ('language_level', 'a',      'Grundkenntnisse (A1–A2)',  'Basic (A1–A2)',         4, true)
) as v(vocabulary, key, label_de, label_en, sort_order, active)
where not exists (select 1 from vocab_term t where t.vocabulary = v.vocabulary and t.key = v.key);

-- ---------------------------------------------------------------- 2 · Spalten an person

alter table person
  add column if not exists job_title           text,
  add column if not exists study_program_label text,
  add column if not exists job_openness        text,
  add column if not exists function_area       text,
  add column if not exists graduation_year     smallint,
  add column if not exists availability        text,
  add column if not exists mobility            text,
  add column if not exists cv_path             text;

alter table person drop constraint if exists person_graduation_year_chk;
alter table person add constraint person_graduation_year_chk
  check (graduation_year is null or graduation_year between 1950 and 2100);

comment on column person.job_title           is 'Position/Jobtitel, Freitext, nur Anzeige (TAL-013 A3). Speaker-Editionen führen ihren eigenen Stand in speaker_profile.job_title.';
comment on column person.study_program_label is 'Exakte Studiengangsbezeichnung, Freitext, nur Anzeige (Ebene 3, Entscheidung 08.09.).';
comment on column person.job_openness        is 'vocab job_openness (A6).';
comment on column person.function_area       is 'vocab function_area, Einfachauswahl (A7, Konrad 24.09.).';
comment on column person.graduation_year     is 'Abschlussjahr (B5).';
comment on column person.availability        is 'vocab availability (C2).';
comment on column person.mobility            is 'vocab mobility (C2).';
comment on column person.cv_path             is 'Lebenslauf im privaten Bucket person-cv (<person_id>/<datei>); gesetzt nur über set_my_cv (B3).';

grant update (job_title, study_program_label, job_openness, function_area, graduation_year,
              availability, mobility) on person to authenticated;

create or replace function person_vocab_guard()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.job_openness is not null and new.job_openness is distinct from old.job_openness
     and not is_vocab_key('job_openness', new.job_openness) then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'job_openness';
  end if;
  if new.function_area is not null and new.function_area is distinct from old.function_area
     and not is_vocab_key('function_area', new.function_area) then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'function_area';
  end if;
  if new.availability is not null and new.availability is distinct from old.availability
     and not is_vocab_key('availability', new.availability) then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'availability';
  end if;
  if new.mobility is not null and new.mobility is distinct from old.mobility
     and not is_vocab_key('mobility', new.mobility) then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'mobility';
  end if;
  return new;
end $$;
revoke execute on function person_vocab_guard() from public, anon, authenticated;

drop trigger if exists trg_person_vocab_guard on person;
create trigger trg_person_vocab_guard
  before update of job_openness, function_area, availability, mobility on person
  for each row execute function person_vocab_guard();

-- ---------------------------------------------------------------- 3 · Mehrfachauswahl

-- A5, A8, C1, C2 teilen sich `person_interest` (Fremdschlüssel aufs Vokabular liegt).
alter table person_interest drop constraint if exists person_interest_vocab_chk;
alter table person_interest add constraint person_interest_vocab_chk
  check (vocabulary in ('interests', 'interests_founder', 'career_opportunities',
                        'summit_goal', 'skill', 'work_mode'));

-- ---------------------------------------------------------------- 4 · Sprachen (B4)

create table if not exists person_language (
  person_id  uuid not null references person (id) on delete cascade,
  language   text not null,
  level      text not null,
  created_at timestamptz not null default now(),
  primary key (person_id, language),
  language_vocabulary text not null default 'spoken_language' check (language_vocabulary = 'spoken_language'),
  level_vocabulary    text not null default 'language_level'  check (level_vocabulary = 'language_level'),
  constraint person_language_language_fk foreign key (language_vocabulary, language)
    references vocab_term (vocabulary, key) on delete restrict,
  constraint person_language_level_fk foreign key (level_vocabulary, level)
    references vocab_term (vocabulary, key) on delete restrict
);
comment on table person_language is 'Sprachkenntnisse je Person mit Niveau (TAL-013 B4). Pflege durch die Person selbst.';
alter table person_language enable row level security;
drop policy if exists pl_self_sel on person_language;
drop policy if exists pl_self_ins on person_language;
drop policy if exists pl_self_del on person_language;
create policy pl_self_sel on person_language for select to authenticated
  using (person_id = current_person_id() or coalesce(is_staff(), false));
create policy pl_self_ins on person_language for insert to authenticated
  with check (person_id = current_person_id());
create policy pl_self_del on person_language for delete to authenticated
  using (person_id = current_person_id());
revoke all on person_language from anon;
revoke update on person_language from authenticated;
grant select, insert, delete on person_language to authenticated;
grant all on person_language to service_role;

-- ---------------------------------------------------------------- 5 · Lebenslauf (B3)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('person-cv', 'person-cv', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

/**
 * Lesen: die Person selbst, das Team, und der gastgebende Partner einer Session, bei der
 * sich die Person mit `consent_share` beworben hat (Konrad 24.09.: nur im Rahmen von
 * Bewerbungen, nie als Liste). Schreiben und Löschen: nur die Person.
 */
create or replace function person_cv_path_allowed(p_name text, p_write boolean)
returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_owner uuid;
begin
  if v_me is null or p_name is null then return false; end if;
  if split_part(p_name, '/', 2) = '' or split_part(p_name, '/', 3) <> '' then return false; end if;
  begin
    v_owner := split_part(p_name, '/', 1)::uuid;
  exception when others then return false; end;
  if v_owner = v_me then return true; end if;
  if p_write then return false; end if;
  if coalesce(is_staff(), false) then return true; end if;
  return coalesce(exists (
    select 1 from application a join session s on s.id = a.session_id
     where a.person_id = v_owner and a.consent_share
       and s.host_org_id is not null and is_partner_of(s.host_org_id)
  ), false);
end $$;

drop policy if exists "person cv read"   on storage.objects;
drop policy if exists "person cv insert" on storage.objects;
drop policy if exists "person cv update" on storage.objects;
drop policy if exists "person cv delete" on storage.objects;
create policy "person cv read"   on storage.objects for select to authenticated
  using (bucket_id = 'person-cv' and person_cv_path_allowed(name, false));
create policy "person cv insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'person-cv' and person_cv_path_allowed(name, true));
create policy "person cv update" on storage.objects for update to authenticated
  using (bucket_id = 'person-cv' and person_cv_path_allowed(name, true))
  with check (bucket_id = 'person-cv' and person_cv_path_allowed(name, true));
create policy "person cv delete" on storage.objects for delete to authenticated
  using (bucket_id = 'person-cv' and person_cv_path_allowed(name, true));

create or replace function set_my_cv(p_path text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_path text := nullif(btrim(p_path), ''); v_old text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_path is not null then
    if v_path not like v_me::text || '/%' or split_part(v_path, '/', 3) <> '' then
      raise exception 'path_mismatch' using errcode = '22023';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'person-cv' and o.name = v_path) then
      raise exception 'object_not_found' using errcode = 'P0002';
    end if;
  end if;

  select p.cv_path into v_old from person p where p.id = v_me;
  if v_old is not distinct from v_path then return; end if;

  update person set cv_path = v_path where id = v_me;
  if v_old is not null then
    insert into storage_purge_queue (bucket, path, reason)
    values ('person-cv', v_old, 'cv_replaced')
    on conflict (bucket, path) do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------- 6 · Profil löschen

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
    linkedin_url = null, linkedin_normalized = null, cv_url = null,
    employer_name = null, university = null, title = null, city = null, pronouns = null,
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
  update hack_application set motivation = null, team_pref = null, note = null where person_id = p_person_id;
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
    contact_phone = null, contact_kind = null, contact_consent_at = null
   where person_id = p_person_id;
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
