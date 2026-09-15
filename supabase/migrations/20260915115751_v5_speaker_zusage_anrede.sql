-- 0099 · Welle 5 · Zusage, Absage und Briefanrede (Abgleich 15.09., Punkte 3+4)
--
-- Angewendet von der Architektur-Session am 15.09.2026 nach Review.
--
-- **Zusage und Absage mit Zeitpunkt.** `pipeline_status` kannte `confirmed`
-- und `declined`, aber keinen Zeitstempel. Wir wussten also, *dass* jemand
-- zugesagt hat, nicht *wann* — und damit liessen sich zwei Alltagsfragen nicht
-- beantworten: „wie lange dauert bei uns eine Zusage" und „wer hat vor drei
-- Wochen zugesagt und noch kein Profil ausgefüllt". Der **Absagegrund** ist
-- für die Planung der nächsten Edition mehr wert als die Absage selbst.
--
-- Gesetzt wird beides im Statuswechsel, nicht von Hand: ein Datum, das jemand
-- nachträglich einträgt, ist keine Messung. `set_speaker_pipeline` bekommt
-- dafür einen dritten Parameter ⇒ Signaturwechsel, also drop + create
-- (db-konventionen §1). Dasselbe gilt für `manager_speakers`, das die neuen
-- Spalten herausgibt.
--
-- **Briefanrede an `person`, nicht am Speaker-Profil.** „Sehr geehrte Frau
-- Prof. Dr. Zehle" lässt sich aus Titel, Vor- und Nachname **nicht**
-- zuverlässig zusammensetzen — Doppeltitel, Namenszusätze, Personen ohne
-- Geschlechtsangabe, englische Anreden. Es ist ein redaktionelles Feld, kein
-- abgeleitetes. Und es gilt für jede Person, nicht nur für Speaker: eine
-- Partnerin bekommt dieselbe Serienmail.
--
-- Die **persönliche** Anrede („Liebe Pauli") führen wir bewusst nicht ein —
-- dafür steht `first_name` in den Vorlagen, und ein zweites Feld daneben wäre
-- eine zweite Wahrheit für denselben Satz.
--
-- Fehlerschlüssel: 42501 ohne Recht · 22023 `invalid_pipeline_status` /
-- `invalid_decline_reason` · P0002 `speaker_not_found` / `person_not_found`.

set search_path = public, extensions;

-- ------------------------------------------------- Zusage und Absage

alter table speaker_profile add column if not exists confirmed_at timestamptz;
alter table speaker_profile add column if not exists declined_at timestamptz;
alter table speaker_profile add column if not exists decline_reason text;

comment on column speaker_profile.confirmed_at is
  'Wann der Status zum ersten Mal auf „zugesagt" ging. Wird im Statuswechsel gesetzt, nicht von Hand.';
comment on column speaker_profile.decline_reason is
  'Schlüssel aus dem Vokabular `speaker_decline_reason`. Für die Planung der nächsten Edition.';

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('speaker_decline_reason', 'termin',      'Terminkonflikt',            'Scheduling conflict',   1, true),
  ('speaker_decline_reason', 'passung',     'Thema passt nicht',         'Topic does not fit',    2, true),
  ('speaker_decline_reason', 'honorar',     'Honorar',                   'Fee',                   3, true),
  ('speaker_decline_reason', 'reise',       'Anreise zu aufwendig',      'Travel too demanding',  4, true),
  ('speaker_decline_reason', 'intern',      'Intern nicht freigegeben',  'Not approved internally', 5, true),
  ('speaker_decline_reason', 'keine_antwort', 'Keine Rückmeldung',       'No response',           6, true),
  ('speaker_decline_reason', 'sonstiges',   'Anderer Grund',             'Other reason',          9, true)
on conflict (vocabulary, key) do nothing;

drop function if exists set_speaker_pipeline(uuid, text);

/**
 * Statuswechsel mit Zeitstempel und Grund.
 *
 * `confirmed_at` wird **nur beim ersten Mal** gesetzt: wer zwischen `confirmed`
 * und `ready` hin und her wechselt, soll nicht jedes Mal ein neues Zusagedatum
 * bekommen. `declined_at` dagegen zählt den aktuellen Vorgang — eine Absage
 * nach einer Zusage ist ein neues Ereignis.
 */
create or replace function set_speaker_pipeline(p_profile_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_old text; v_reason text;
begin
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not is_vocab_key('speaker_pipeline', p_status) then
    raise exception 'invalid_pipeline_status' using errcode = '22023', detail = p_status;
  end if;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is not null and not is_vocab_key('speaker_decline_reason', v_reason) then
    raise exception 'invalid_decline_reason' using errcode = '22023', detail = v_reason;
  end if;

  select pipeline_status into v_old from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  update speaker_profile set
    pipeline_status = p_status,
    confirmed_at = case when speaker_is_confirmed(p_status) then coalesce(confirmed_at, now()) else confirmed_at end,
    declined_at = case when p_status = 'declined' then now()
                       -- Zurück aus der Absage: das Datum verliert seine Bedeutung.
                       when v_old = 'declined' then null
                       else declined_at end,
    decline_reason = case when p_status = 'declined' then coalesce(v_reason, decline_reason)
                          when v_old = 'declined' then null
                          else decline_reason end
  where id = p_profile_id;

  perform log_audit('speaker.pipeline', 'speaker_profile', p_profile_id::text,
                    jsonb_build_object('status', v_old),
                    jsonb_build_object('status', p_status, 'reason', v_reason));
end $$;

-- ------------------------------------------------- Briefanrede

alter table person add column if not exists salutation_de text;
alter table person add column if not exists salutation_en text;

comment on column person.salutation_de is
  'Fertige Briefanrede, z. B. „Sehr geehrte Frau Prof. Dr. Zehle". Redaktionell gepflegt — aus Titel und Namen lässt sie sich nicht zuverlässig bauen.';

/**
 * Briefanrede pflegen. Team-Sache, nicht Selbstbedienung: niemand schreibt
 * sich selbst eine Anrede, und ein falsch zusammengesetzter Name ist die eine
 * Stelle, an der ein Portal peinlich wird.
 */
create or replace function set_person_salutation(p_person_id uuid, p_de text, p_en text) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_before jsonb;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select jsonb_build_object('de', salutation_de, 'en', salutation_en) into v_before
    from person where id = p_person_id;
  if v_before is null then raise exception 'person_not_found' using errcode = 'P0002', detail = p_person_id::text; end if;
  update person set
    salutation_de = nullif(btrim(coalesce(p_de, '')), ''),
    salutation_en = nullif(btrim(coalesce(p_en, '')), '')
   where id = p_person_id;
  perform log_audit('person.salutation', 'person', p_person_id::text, v_before,
                    jsonb_build_object('de', p_de, 'en', p_en));
end $$;

/**
 * Vorschlag für die Anrede — **Vorschlag**, nicht Wahrheit.
 *
 * Deckt den Normalfall ab und lässt die Redaktion den Rest machen. Ohne
 * Geschlechtsangabe gibt es keinen Vorschlag: „Sehr geehrte/r" ist keine
 * Anrede, sondern ein Formular.
 *
 * **Nur fürs Team.** Ohne die Prüfung wäre das eine Auskunft über jede
 * Person, deren UUID man kennt — Titel, Nachname und das aus dem Geschlecht
 * abgeleitete „Frau"/„Herr". Personen-UUIDs stehen für Partner zum Beispiel
 * in Bewerberlisten (Review 15.09.).
 */
create or replace function suggest_salutation(p_person_id uuid, p_locale text default 'de') returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_p person%rowtype;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_p from person where id = p_person_id;
  if not found or v_p.last_name is null or btrim(v_p.last_name) = '' then return null; end if;
  return case
    when p_locale = 'en' then 'Dear ' || coalesce(nullif(btrim(v_p.title), '') || ' ', '') || v_p.last_name
    when v_p.gender = 'weiblich' then 'Sehr geehrte Frau ' || coalesce(nullif(btrim(v_p.title), '') || ' ', '') || v_p.last_name
    when v_p.gender = 'maennlich' then 'Sehr geehrter Herr ' || coalesce(nullif(btrim(v_p.title), '') || ' ', '') || v_p.last_name
    else null end;
end $$;

-- ------------------------------------------------- Lead-Board sieht es

drop function if exists manager_speakers(uuid);

create or replace function manager_speakers(p_edition_id uuid default null)
returns table (
  id uuid, person_id uuid, first_name text, last_name text, title text, email text,
  job_title text, organization_name text, speaker_type text, pipeline_status text,
  owner_person_id uuid, owner_name text, reception_eligible boolean, travel_costs_covered boolean, travel_costs_approved boolean,
  hospitality_status text, hotel_tier text, pass_type text, lounge_access boolean, invited_at timestamptz,
  confirmed_at timestamptz, declined_at timestamptz, decline_reason text,
  assistant_name text, sessions jsonb, next_open jsonb, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not (has_role('speaker_manager') or has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select sp.id, sp.person_id, p.first_name, p.last_name, p.title,
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           sp.job_title, sp.organization_name, sp.speaker_type, sp.pipeline_status,
           sp.owner_person_id, (select btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')) from person o where o.id = sp.owner_person_id),
           sp.reception_eligible, sp.travel_costs_covered, (sp.travel_costs_approved_at is not null),
           sp.hospitality_status, sp.hotel_tier, sp.pass_type, sp.lounge_access, sp.invited_at,
           sp.confirmed_at, sp.declined_at, sp.decline_reason,
           (select btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')) from person a where a.id = sp.assistant_person_id),
           coalesce((select jsonb_agg(jsonb_build_object('session_id', se.id, 'title_de', se.title_de, 'title_en', se.title_en,
                                                          'publish_status', se.publish_status, 'start_at', sl.start_at, 'stage_name', st.name)
                                       order by sl.start_at nulls last)
                     from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                     left join slot sl on sl.id = se.slot_id left join stage st on st.id = sl.stage_id
                     where ss.person_id = sp.person_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)), '[]'::jsonb),
           speaker_next_steps(sp.id)->'open',
           sp.updated_at
    from speaker_profile sp
    join person p on p.id = sp.person_id
    left join vocab_term v on v.vocabulary = 'speaker_pipeline' and v.key = sp.pipeline_status
    where (p_edition_id is null or sp.edition_id = p_edition_id)
      and p.deleted_at is null
      and can_manage_speaker(sp.id)
    order by v.sort_order nulls last, p.last_name nulls last, p.first_name nulls last;
end $$;

select harden_definer_functions();
