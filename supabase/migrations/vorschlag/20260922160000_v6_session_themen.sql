-- ???? · Welle 6 · Themen als gepflegte Liste statt Freitext (SPK-027)
--
-- **Nummer offen.** Vorschlag der Build-Session Speaker-Domäne; Anwenden,
-- Umbenennen und der Eintrag ins Entscheidungslog gehören der
-- Architektur-/Security-Session.
--
-- Anlass: `session_submission.topics` ist ein `text[]` ohne jede Bindung —
-- jeder Speaker schreibt hinein, was ihm einfällt, und hinterher lässt sich
-- nichts danach filtern oder in die Event-App geben. Konrad am 21.09.:
-- „Themen sollten ein Multi-Select, keine Texteingabe sein. Identisch mit den
-- Themen, die wir für die Talks setzen."
--
-- **Die Liste kommt von Konrad** (22.09., Airtable-Ansicht „All Topics" der
-- Basis `appGv7ZYysgs2krlb`): die 17 Themen des Summit 26, in ihrer dortigen
-- Reihenfolge.
--
-- **Die Labels sind in beiden Sprachen gleich.** Das sind Kategorien, die auf
-- der Website, in Swapcard und im Marketing englisch stehen; eine deutsche
-- Übersetzung wäre eine zweite Wahrheit. Wer sie später doch übersetzt haben
-- will, ändert `label_de` im Vokabular-Admin — dafür ist es da.
--
-- **Bestehende Einreichungen bleiben, wie sie sind.** Geprüft wird beim
-- Schreiben, nicht rückwirkend; alte Freitexte stehen weiter in ihren Zeilen.

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order) values
  ('session_topic', 'finance_banking',          'Finance & Banking',          'Finance & Banking',           1),
  ('session_topic', 'impact_sustainability',    'Impact & Sustainability',    'Impact & Sustainability',     2),
  ('session_topic', 'strategy_consulting',      'Strategy & Consulting',      'Strategy & Consulting',       3),
  ('session_topic', 'marketing_brand',          'Marketing & Brand',          'Marketing & Brand',           4),
  ('session_topic', 'venture_capital',          'Venture Capital',            'Venture Capital',             5),
  ('session_topic', 'startup_entrepreneurship', 'Startup & Entrepreneurship', 'Startup & Entrepreneurship',  6),
  ('session_topic', 'sciencepreneurship',       'Sciencepreneurship',         'Sciencepreneurship',          7),
  ('session_topic', 'tech_ai',                  'Tech & AI',                  'Tech & AI',                   8),
  ('session_topic', 'career_skills',            'Career & Skills',            'Career & Skills',             9),
  ('session_topic', 'female',                   'Female',                     'Female',                     10),
  ('session_topic', 'mindset_personal_growth',  'Mindset & Personal Growth',  'Mindset & Personal Growth',  11),
  ('session_topic', 'leadership_management',    'Leadership & Management',    'Leadership & Management',    12),
  ('session_topic', 'research_science',         'Research & Science',         'Research & Science',         13),
  ('session_topic', 'deep_tech',                'Deep Tech',                  'Deep Tech',                  14),
  ('session_topic', 'industry_insights',        'Industry Insights',          'Industry Insights',          15),
  ('session_topic', 'politics_society',         'Politics & Society',         'Politics & Society',         16),
  ('session_topic', 'defense_democracy',        'Defense & Democracy',        'Defense & Democracy',        17)
on conflict (vocabulary, key) do nothing;

-- Aus dem Snapshot übernommen; neu ist allein die Prüfung der Themen.
create or replace function submit_session_content(p_session_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_sp uuid; v_id uuid;
  v_lang text := nullif(p_data->>'language', '');
  v_topics text[];
  v_topic text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not is_speaker_side_of(p_session_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_lang is not null and v_lang not in ('de', 'en', 'mixed') then raise exception 'invalid_language' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_data->>'title', '')), '') is null then raise exception 'title_required' using errcode = '22023'; end if;

  v_topics := coalesce(
    (select array_agg(x) from jsonb_array_elements_text(coalesce(p_data->'topics', '[]'::jsonb)) x), '{}');

  -- Jedes Thema muss im Vokabular stehen (SPK-027). Ohne diese Schleife
  -- bliebe `topics` ein Freitextfeld mit Auswahlknöpfen davor: die Oberfläche
  -- böte eine Liste an, die Datenbank nähme trotzdem alles entgegen.
  foreach v_topic in array v_topics loop
    if not is_vocab_key('session_topic', v_topic) then
      raise exception 'invalid_topic' using errcode = '22023', detail = v_topic;
    end if;
  end loop;

  select sp.id into v_sp
    from speaker_profile sp
    join session_speaker ss on ss.person_id = sp.person_id and ss.session_id = p_session_id
    join session se on se.id = p_session_id
    join event e on e.id = se.event_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)
   where sp.person_id = v_me or sp.assistant_person_id = v_me
   order by (sp.person_id = v_me) desc limit 1;
  update session_submission set status = 'superseded' where session_id = p_session_id and status = 'submitted';
  insert into session_submission (session_id, speaker_profile_id, submitted_by, title, description, topics, language, notes)
  values (p_session_id, v_sp, v_me, btrim(p_data->>'title'), nullif(btrim(p_data->>'description'), ''),
          v_topics, v_lang, nullif(btrim(p_data->>'notes'), ''))
  returning id into v_id;
  perform log_audit('session.submission', 'session', p_session_id::text, null, jsonb_build_object('submission_id', v_id, 'speaker_profile_id', v_sp));
  return v_id;
end $$;

select harden_definer_functions();
