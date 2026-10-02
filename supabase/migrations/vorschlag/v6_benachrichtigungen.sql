-- 0000 · „Worüber möchtest du informiert werden?“ (TAL-009): Themen als Einschränkung der
-- Newsletter-Einwilligung, Admin-Abschnitt mit Zählern und Export.
--
-- Anlass: Konzept docs/talent-konzepte-009-011.md, Konrads Antworten K-43 (02.10.):
-- (1) Themenliste angenommen, Academy und Bootcamp als zwei getrennte Themen; (2) Themen
-- schränken die Newsletter-Einwilligung nur ein — keine eigene Einwilligung je Thema;
-- (3) ActiveCampaign-Sync als eigener Baustein vor dem 01.11. (Schlüssel legt Konrad an), bis
-- dahin zeigt der Admin „Verbindung fehlt“ und bietet den CSV-Export.
--
-- Diese Migration:
--   1 Vokabular `notification_topic` (7 Begriffe), `person_interest` darf es führen (Prüfsatz
--     erweitert), `vocab_binding`. Die Person schreibt ihre Themen wie die übrigen Interessen
--     selbst (RLS von person_interest, unverändert).
--   2 Admin-Abschnitt `notifications` (admin, area_lead_talent, talent_team, marketing_team).
--   3 `notification_topic_stats()`: je Thema gewählt / anschreibbar. **Anschreibbar** =
--     aktuelle Einwilligung `newsletter` erteilt, Profil nicht gelöscht, primäre Adresse nicht
--     auf der Sperrliste (`suppression`).
--   4 `notification_topic_export(p_topic)`: nur anschreibbare Personen (Vorname, Nachname,
--     primäre E-Mail, Sprache) — Audit `export.notification_topic` mit Anzahl, ohne Adressen.
-- Fehlerschlüssel: keine neuen (42501, invalid_vocab_value).
-- Test: supabase/tests/v6_benachrichtigungen.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Vokabular

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active)
select v.* from (values
  ('notification_topic', 'summit',            'Summit',                           'Summit',                         1, true),
  ('notification_topic', 'community_events',  'Community-Events',                 'Community events',               2, true),
  ('notification_topic', 'masterclass_tour',  'Masterclasses & Company Tours',    'Masterclasses & company tours',  3, true),
  ('notification_topic', 'bootcamp',          'Bootcamp',                         'Bootcamp',                       4, true),
  ('notification_topic', 'academy',           'Academy',                          'Academy',                        5, true),
  ('notification_topic', 'jobs',              'Jobs & Karriere bei Partnern',     'Jobs & careers with partners',   6, true),
  ('notification_topic', 'hackathon',         'Hackathon',                        'Hackathon',                      7, true)
) as v(vocabulary, key, label_de, label_en, sort_order, active)
where not exists (select 1 from vocab_term t where t.vocabulary = v.vocabulary and t.key = v.key);

alter table person_interest drop constraint if exists person_interest_vocab_chk;
alter table person_interest add constraint person_interest_vocab_chk
  check (vocabulary in ('interests', 'interests_founder', 'career_opportunities',
                        'summit_goal', 'skill', 'work_mode', 'notification_topic'));

insert into vocab_binding (vocabulary, table_name, column_name, is_array, vocabulary_column, note)
values ('notification_topic', 'person_interest', 'term_key', false, 'vocabulary', 'Benachrichtigungs-Themen (TAL-009)')
on conflict (vocabulary, table_name, column_name) do nothing;

-- ---------------------------------------------------------------- 2 · Admin-Abschnitt

insert into admin_section_role (section, role) values
  ('notifications', 'admin'),
  ('notifications', 'area_lead_talent'),
  ('notifications', 'talent_team'),
  ('notifications', 'marketing_team')
on conflict do nothing;

-- ---------------------------------------------------------------- 3 · Zähler

create or replace function notification_reachable(p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (select 1 from consent_current c
                  where c.person_id = p_person_id and c.consent_type = 'newsletter' and c.granted)
     and exists (select 1 from person p where p.id = p_person_id and p.deleted_at is null)
     and not exists (select 1 from person_email e join suppression s on s.email_hash = email_hash(e.email::text)
                      where e.person_id = p_person_id and e.is_primary)
$$;
revoke all on function notification_reachable(uuid) from public, anon, authenticated;

create or replace function notification_topic_stats()
 RETURNS TABLE(topic text, chosen integer, reachable integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not coalesce(has_admin_section('notifications'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.key,
           (select count(*)::integer from person_interest i where i.vocabulary = 'notification_topic' and i.term_key = t.key),
           (select count(*)::integer from person_interest i
             where i.vocabulary = 'notification_topic' and i.term_key = t.key and notification_reachable(i.person_id))
      from vocab_term t
     where t.vocabulary = 'notification_topic'
     order by t.sort_order;
end $$;

-- ---------------------------------------------------------------- 4 · Export

create or replace function notification_topic_export(p_topic text)
 RETURNS TABLE(first_name text, last_name text, email text, preferred_language text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  if not coalesce(has_admin_section('notifications'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from vocab_term where vocabulary = 'notification_topic' and key = p_topic) then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'topic';
  end if;
  select count(*) into v_n from person_interest i
   where i.vocabulary = 'notification_topic' and i.term_key = p_topic and notification_reachable(i.person_id);
  perform log_audit('export.notification_topic', 'vocab_term', p_topic, null, jsonb_build_object('rows', v_n));
  return query
    select p.first_name, p.last_name, e.email::text, p.preferred_language
      from person_interest i
      join person p on p.id = i.person_id
      join person_email e on e.person_id = p.id and e.is_primary
     where i.vocabulary = 'notification_topic' and i.term_key = p_topic and notification_reachable(p.id)
     order by p.last_name, p.first_name;
end $$;

select harden_definer_functions();
