-- 0000 · Wunschprofil je Hackathon-Challenge (HACK-015): Studienfelder, Skills, kurzer Freitext.
--
-- Anlass: Konrad im Call 24.09. (HACK-014-Abgleich): Partner sagen nicht, wen sie für ihre
-- Challenge suchen. Der Partner beschreibt das gewünschte Profil; Teilnehmende sehen es auf
-- /hackathon/challenges, das Hack-Team in der Auswahl neben den Profilmerkmalen (HACK-010).
--
-- Die Formular-Engine der Partner-Pflichten kennt keine Mehrfachauswahl — darum nicht im
-- Challenge-Formular, sondern nach der Freigabe als eigene Karte im Partner-Portal und im Admin
-- (wie der Datensatz, HACK-012).
--
-- Diese Migration:
--   1 `hack_challenge.target_study_fields` (vocab study_field), `target_skills` (vocab skill,
--     dieselben Begriffe wie im Profil, TAL-013), `target_profile` (Freitext ≤ 500); je Liste
--     höchstens 8 Begriffe. `vocab_binding` für beide Listen.
--   2 `set_hack_challenge_profile(…)`: Hack-Team oder wer die Organisation der Challenge
--     bearbeiten darf (`partner_can_edit`); jeder Begriff geprüft (22023 `invalid_vocab_value`,
--     detail = Liste), Audit `hack.challenge_profile`.
--   3 `hack_challenge_profiles(p_edition_id)`: Wunschprofile aller freigegebenen Challenges für
--     angemeldete Personen, dazu `can_edit` je Challenge. `hack_challenges` bleibt unberührt
--     (läuft parallel in #287).
-- Test: supabase/tests/v6_hack_wunschprofil.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Spalten

alter table hack_challenge
  add column if not exists target_study_fields text[] not null default '{}',
  add column if not exists target_skills text[] not null default '{}',
  add column if not exists target_profile text;
alter table hack_challenge drop constraint if exists hack_challenge_target_chk;
alter table hack_challenge add constraint hack_challenge_target_chk
  check (cardinality(target_study_fields) <= 8 and cardinality(target_skills) <= 8
         and (target_profile is null or length(target_profile) <= 500));
comment on column hack_challenge.target_study_fields is 'Wunschprofil (HACK-015): gesuchte Studienfelder, vocab study_field.';
comment on column hack_challenge.target_skills is 'Wunschprofil (HACK-015): gesuchte Skills, vocab skill (wie im Profil, TAL-013).';
comment on column hack_challenge.target_profile is 'Wunschprofil (HACK-015): „Wen sucht ihr?“, Freitext bis 500 Zeichen.';

insert into vocab_binding (vocabulary, table_name, column_name, is_array, note) values
  ('study_field', 'hack_challenge', 'target_study_fields', true, 'Wunschprofil je Challenge (HACK-015)'),
  ('skill', 'hack_challenge', 'target_skills', true, 'Wunschprofil je Challenge (HACK-015)')
on conflict (vocabulary, table_name, column_name) do nothing;

-- ---------------------------------------------------------------- 2 · Pflegen

create or replace function set_hack_challenge_profile(p_challenge_id uuid, p_study_fields text[], p_skills text[], p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_c hack_challenge; v_k text;
        v_fields text[] := coalesce((select array_agg(distinct btrim(x)) from unnest(p_study_fields) x where btrim(x) <> ''), '{}');
        v_skills text[] := coalesce((select array_agg(distinct btrim(x)) from unnest(p_skills) x where btrim(x) <> ''), '{}');
        v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_c from hack_challenge where id = p_challenge_id for update;
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
  if not (is_hack_team() or (v_c.org_id is not null and partner_can_edit(v_c.org_id))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  foreach v_k in array v_fields loop
    if not is_vocab_key('study_field', v_k) then raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'target_study_fields'; end if;
  end loop;
  foreach v_k in array v_skills loop
    if not is_vocab_key('skill', v_k) then raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'target_skills'; end if;
  end loop;
  if cardinality(v_fields) > 8 or cardinality(v_skills) > 8 then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'max 8';
  end if;
  if length(v_text) > 500 then raise exception 'too_long' using errcode = '22023', detail = '500'; end if;

  update hack_challenge
     set target_study_fields = v_fields, target_skills = v_skills, target_profile = v_text, updated_at = now()
   where id = p_challenge_id;
  perform log_audit('hack.challenge_profile', 'hack_challenge', p_challenge_id::text,
    jsonb_build_object('fields', v_c.target_study_fields, 'skills', v_c.target_skills, 'text', v_c.target_profile),
    jsonb_build_object('fields', v_fields, 'skills', v_skills, 'text', v_text));
end $$;

-- ---------------------------------------------------------------- 3 · Lesen

create or replace function hack_challenge_profiles(p_edition_id uuid default null, p_language text default 'en')
 RETURNS TABLE(challenge_id uuid, title text, org_name text, study_fields text[], skills text[], profile text, can_edit boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select c.id, hack_text(c.title_de, c.title_en, p_language), coalesce(o.communication_name, o.legal_name),
           c.target_study_fields, c.target_skills, c.target_profile,
           (is_hack_team() or (c.org_id is not null and partner_can_edit(c.org_id)))
      from hack_challenge c
      left join organization o on o.id = c.org_id
     where c.edition_id = hack_edition(p_edition_id) and c.status = 'published'
     order by c.sort_order, hack_text(c.title_de, c.title_en, p_language);
end $$;

select harden_definer_functions();
