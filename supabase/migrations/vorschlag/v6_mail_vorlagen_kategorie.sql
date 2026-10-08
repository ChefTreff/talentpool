-- 00NN · Mail-Vorlagen je Bereich: Kategorie, Anzeigename, Platzhalter, Rechte je Kategorie (ADM-102)
--
-- Anlass: Konrad 08.10.2026 (Admin-Feedback Teil 1): „Vorlagen unter Speaker, Partner und Teilnehmer … damit z. B. ein
-- Partner-Manager nur Partner-Mails bearbeitet — Kategorie am Template, Rechte je Bereich“, Anzeigename statt Systemname,
-- DE und EN zusammen je Vorlage. Datenmodell von Plan am 08.10.2026 freigegeben (docs/vorschlag-adm102-mail-vorlagen.md, #397).
--
-- * **Vokabular `mail_category`:** speaker, partner, participant (Teilnehmer), volunteer, system.
-- * **`mail_template_key`** (je Vorlage, nicht je Sprache): Kategorie, Anzeigename DE/EN, erlaubte Platzhalter, Reihenfolge.
--   RLS an, keine Policy, kein Grant — Lesen und Schreiben nur über die Funktionen. Bewusst **kein Fremdschlüssel** von
--   `mail_template.key`: Migrationen und offene PRs anderer Chats legen Vorlagen per `insert into mail_template` an. Eine
--   Vorlage **ohne** Eintrag gilt als Kategorie `system` (nur `admin`, fail closed); `tests/mail-vorlagen-kategorie.test.ts`
--   prüft, dass jede in Migrationen angelegte Vorlage hier zugeordnet ist. Wer im Code einen neuen Platzhalter einführt,
--   ergänzt ihn in `variables` (`set_mail_template_meta`).
-- * **Rechte über Abschnitte** (ADM-053): vier neue — mailSpeaker, mailPartner, mailParticipants, mailVolunteers; `system`
--   bleibt der Abschnitt `mail` (nur admin). Vorgabe-Rollen wie bei den Bereichsabschnitten. Eine Kategorie ohne Abschnitt
--   (neuer Vokabularbegriff) fällt auf `mail` zurück — sie öffnet nichts, bis jemand den Abschnitt dazu baut.
-- * **Funktionen** (Live-Fassungen aus dem Snapshot, nur das Rechte-Prädikat und die Form der Liste geändert):
--     mail_template_section(key), can_edit_mail_template(key) — neu;
--     mail_templates_admin(p_category) — **eine Zeile je Schlüssel** mit beiden Sprachen (`de`, `en` als jsonb), nur Kategorien,
--       die die Person bearbeiten darf; ohne Recht für irgendeine ⇒ 42501;
--     upsert_mail_template, mail_template_history, restore_mail_template — Recht je Schlüssel statt `has_role('admin')`;
--     upsert_mail_template_pair(key, de, en) — beide Sprachen in einer Transaktion, je Sprache eigene Version und eigener
--       Protokolleintrag (`mail_template.upsert`, wie bisher);
--     set_mail_template_meta(key, category, name_de, name_en, variables) — Kategorie und Platzhalter nur `admin`
--       (Abschnitt `mail`), Anzeigename auch der Bereich; Protokoll `mail_template.meta`.
-- Fehlerschlüssel: 42501 · 22023 `invalid_category`, `fields_required`, `invalid_locale` · P0002 `template_not_found`.
set search_path = public, extensions;

-- 1 · Vokabular -------------------------------------------------------------------------------------------------
insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('mail_category', 'speaker',     'Speaker',     'Speakers',     10, true),
  ('mail_category', 'partner',     'Partner',     'Partners',     20, true),
  ('mail_category', 'participant', 'Teilnehmer',  'Participants', 30, true),
  ('mail_category', 'volunteer',   'Volunteers',  'Volunteers',   40, true),
  ('mail_category', 'system',      'System',      'System',       90, true)
on conflict (vocabulary, key) do nothing;

-- 2 · Tabelle ---------------------------------------------------------------------------------------------------
create table if not exists mail_template_key (
  key         text primary key,
  category    text not null,
  name_de     text not null check (btrim(name_de) <> ''),
  name_en     text not null check (btrim(name_en) <> ''),
  variables   text[] not null default '{}',
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now()
);
comment on table mail_template_key is
  'ADM-102: je Mail-Vorlage (nicht je Sprache) Kategorie, Anzeigename und erlaubte Platzhalter. Kein Fremdschluessel von mail_template.key: eine Vorlage ohne Zeile gilt als Kategorie system (nur admin).';
comment on column mail_template_key.category is 'Vokabular mail_category.';
comment on column mail_template_key.variables is 'Erlaubte Platzhalter ohne Klammern ({{first_name}} ⇒ first_name); Grundlage für „Platzhalter einfügen“ im Editor.';
alter table mail_template_key enable row level security;
revoke all on mail_template_key from anon, authenticated;

insert into vocab_binding (vocabulary, table_name, column_name, is_array, vocabulary_column, note) values
  ('mail_category', 'mail_template_key', 'category', false, null, 'mail_template_key.category')
on conflict do nothing;

-- 3 · Zuordnung der Bestandsvorlagen -----------------------------------------------------------------------------
insert into mail_template_key (key, category, name_de, name_en, sort_order) values
  -- Speaker
  ('speaker_invite',             'speaker', 'Einladung ins Speaker-Portal',                   'Invitation to the speaker portal',            10),
  ('assistant_invite',           'speaker', 'Einladung einer Assistenz',                      'Invitation of an assistant',                  20),
  ('session_changed',            'speaker', 'Änderung an einer Session',                      'Change to a session',                         30),
  ('presentation_reminder',      'speaker', 'Erinnerung an die Präsentation',                 'Presentation reminder',                       40),
  ('stage_photos_ready',         'speaker', 'Bühnenfoto steht bereit',                        'Stage photo is ready',                        50),
  ('side_event_invitation',      'speaker', 'Einladung zu einem Side Event',                  'Invitation to a side event',                  60),
  ('ticket_final',               'speaker', 'Freiticket ausgestellt',                         'Free ticket issued',                          70),
  ('companion_ticket_requested', 'speaker', 'Begleitticket angefragt (intern)',               'Companion ticket requested (internal)',       80),
  ('companion_ticket_confirmed', 'speaker', 'Begleitticket bestätigt',                        'Companion ticket confirmed',                  90),
  ('companion_ticket_declined',  'speaker', 'Begleitticket abgelehnt',                        'Companion ticket declined',                  100),
  ('hospitality_confirmed',      'speaker', 'Hospitality-Buchung bestätigt',                  'Hospitality booking confirmed',              110),
  ('expense_submitted',          'speaker', 'Reisekostenantrag eingegangen (intern)',         'Expense claim submitted (internal)',         120),
  ('expense_approved',           'speaker', 'Reisekostenantrag freigegeben',                  'Expense claim approved',                     130),
  ('expense_rejected',           'speaker', 'Reisekostenantrag abgelehnt',                    'Expense claim rejected',                     140),
  -- Partner
  ('partner_contact_invite',       'partner', 'Einladung eines Partner-Kontakts',             'Invitation of a partner contact',             10),
  ('partner_speaker_contact',      'partner', 'Partner betreut einen Speaker',                'Partner looks after a speaker',               20),
  ('partner_deliverable_received', 'partner', 'Einreichung eingegangen',                      'Submission received',                         30),
  ('partner_deliverable_rejected', 'partner', 'Einreichung abgelehnt',                        'Submission rejected',                         40),
  ('partner_reminder_digest',      'partner', 'Wöchentliche Übersicht offener Pflichten',     'Weekly digest of open obligations',           50),
  ('partner_gate_failed',          'partner', 'Fehler beim HubSpot-Abgleich (intern)',        'HubSpot ingest failed (internal)',            60),
  ('session_changed_partner',      'partner', 'Änderung an einer Partner-Session',            'Change to a partner session',                 70),
  ('shop_request_received',        'partner', 'Shop-Anfrage eingegangen (intern)',            'Shop request received (internal)',            80),
  ('shop_order_confirmed',         'partner', 'Shop-Bestellung bestätigt',                    'Shop order confirmed',                        90),
  ('shop_order_completed',         'partner', 'Shop-Bestellung verbindlich',                  'Shop order binding',                         100),
  ('ticket_request_received',      'partner', 'Anfrage nach Zusatztickets (intern)',          'Request for additional tickets (internal)',  110),
  -- Teilnehmer
  ('welcome',                'participant', 'Willkommen nach dem ersten Login',      'Welcome after the first login',      10),
  ('registration_confirmed', 'participant', 'Anmeldung bestätigt',                   'Registration confirmed',             20),
  ('application_received',   'participant', 'Bewerbung eingegangen',                 'Application received',               30),
  ('application_accepted',   'participant', 'Zusage zur Bewerbung',                  'Application accepted',               40),
  ('application_waitlisted', 'participant', 'Warteliste',                            'Waiting list',                       50),
  ('application_promoted',   'participant', 'Nachgerückt von der Warteliste',        'Promoted from the waiting list',     60),
  ('application_declined',   'participant', 'Absage zur Bewerbung',                  'Application declined',               70),
  -- Volunteers
  ('volunteer_applied',         'volunteer', 'Bewerbung eingegangen',                'Application received',               10),
  ('volunteer_accepted',        'volunteer', 'Zusage zur Bewerbung',                 'Application accepted',               20),
  ('volunteer_declined',        'volunteer', 'Absage zur Bewerbung',                 'Application declined',               30),
  ('shift_assigned',            'volunteer', 'Schicht zugeteilt',                    'Shift assigned',                     40),
  ('shift_reminder',            'volunteer', 'Erinnerung an die Schicht',            'Shift reminder',                     50),
  ('volunteer_ticket_reminder', 'volunteer', 'Erinnerung ans Volunteer-Ticket',      'Volunteer ticket reminder',          60),
  -- System
  ('team_member_added',     'system', 'Teammitglied bekommt Rollen',                 'Team member given roles',            10),
  ('deletion_requested',    'system', 'Löschantrag eingegangen',                     'Deletion request received',          20),
  ('deletion_request_team', 'system', 'Löschantrag liegt vor (intern)',              'Deletion request pending (internal)',30),
  ('deletion_rejected',     'system', 'Löschantrag abgelehnt',                       'Deletion request rejected',          40),
  ('test',                  'system', 'Technischer Test',                            'Technical test',                     90)
on conflict (key) do nothing;

-- Erlaubte Platzhalter: die in den vorhandenen Texten (beider Sprachen) benutzten.
update mail_template_key k set variables = coalesce((
  select array_agg(distinct m[1] order by m[1])
    from mail_template t, regexp_matches(t.subject || ' ' || t.body_md, '\{\{\s*([a-z0-9_]+)\s*\}\}', 'gi') as m
   where t.key = k.key), '{}')
 where k.variables = '{}';

-- 4 · Abschnitte --------------------------------------------------------------------------------------------------
insert into admin_section_role (section, role) values
  ('mailSpeaker', 'admin'), ('mailSpeaker', 'area_lead_speaker'), ('mailSpeaker', 'programme_team'),
  ('mailPartner', 'admin'), ('mailPartner', 'area_lead_partner'), ('mailPartner', 'partner_team'),
  ('mailParticipants', 'admin'), ('mailParticipants', 'area_lead_talent'), ('mailParticipants', 'talent_team'), ('mailParticipants', 'marketing_team'),
  ('mailVolunteers', 'admin'), ('mailVolunteers', 'area_lead_volunteers'), ('mailVolunteers', 'volunteers_team')
on conflict do nothing;

-- 5 · Rechte-Helfer -----------------------------------------------------------------------------------------------
create or replace function mail_template_section(p_key text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select case coalesce((select k.category from mail_template_key k where k.key = p_key), 'system')
           when 'speaker' then 'mailSpeaker'
           when 'partner' then 'mailPartner'
           when 'participant' then 'mailParticipants'
           when 'volunteer' then 'mailVolunteers'
           else 'mail' end
$$;

create or replace function can_edit_mail_template(p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select has_admin_section(mail_template_section(p_key))
$$;

-- 6 · Liste: eine Zeile je Schlüssel, beide Sprachen ---------------------------------------------------------------
drop function if exists mail_templates_admin();

create function mail_templates_admin(p_category text DEFAULT NULL::text)
 RETURNS TABLE(key text, category text, name_de text, name_en text, variables text[], description text, de jsonb, en jsonb,
               queued integer, sent_30d integer, sort_order integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_cat text := nullif(btrim(coalesce(p_category, '')), '');
begin
  if v_cat is not null and not is_vocab_key('mail_category', v_cat) then
    raise exception 'invalid_category' using errcode = '22023', detail = v_cat;
  end if;
  if not (has_admin_section('mail') or has_admin_section('mailSpeaker') or has_admin_section('mailPartner')
          or has_admin_section('mailParticipants') or has_admin_section('mailVolunteers')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    with schluessel as (
      select t.key as k from mail_template t group by t.key
    )
    select s.k,
           coalesce(mk.category, 'system'),
           coalesce(mk.name_de, s.k), coalesce(mk.name_en, s.k),
           coalesce(mk.variables, '{}'),
           (select t.description from mail_template t where t.key = s.k order by (t.locale = 'de') desc limit 1),
           (select jsonb_build_object('subject', t.subject, 'body_md', t.body_md, 'active', t.active, 'version', t.version,
                                      'updated_at', t.updated_at,
                                      'updated_by_name', (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                                                            from person p where p.id = t.updated_by))
              from mail_template t where t.key = s.k and t.locale = 'de'),
           (select jsonb_build_object('subject', t.subject, 'body_md', t.body_md, 'active', t.active, 'version', t.version,
                                      'updated_at', t.updated_at,
                                      'updated_by_name', (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                                                            from person p where p.id = t.updated_by))
              from mail_template t where t.key = s.k and t.locale = 'en'),
           (select count(*)::integer from mail_log m where m.template_key = s.k and m.status = 'queued'),
           (select count(*)::integer from mail_log m
             where m.template_key = s.k and m.status in ('sent', 'delivered') and m.queued_at > now() - interval '30 days'),
           coalesce(mk.sort_order, 1000)
      from schluessel s
      left join mail_template_key mk on mk.key = s.k
     where can_edit_mail_template(s.k)
       and (v_cat is null or coalesce(mk.category, 'system') = v_cat)
     order by coalesce(mk.category, 'system'), coalesce(mk.sort_order, 1000), s.k;
end $$;

-- 7 · Schreiben: Recht je Schlüssel --------------------------------------------------------------------------------
create or replace function upsert_mail_template(p_data jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_key text := nullif(btrim(p_data->>'key'), '');
        v_locale text := nullif(p_data->>'locale', '');
        v_subject text := nullif(btrim(p_data->>'subject'), '');
        v_body text := nullif(btrim(p_data->>'body_md'), '');
        v_before jsonb; v_version integer;
begin
  if v_key is null then raise exception 'fields_required' using errcode = '22023', detail = 'key'; end if;
  if not can_edit_mail_template(v_key) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_locale not in ('de', 'en') then
    raise exception 'invalid_locale' using errcode = '22023', detail = coalesce(v_locale, 'null');
  end if;

  select to_jsonb(t) into v_before from mail_template t where t.key = v_key and t.locale = v_locale;

  if v_before is null then
    if v_subject is null or v_body is null then
      raise exception 'fields_required' using errcode = '22023', detail = 'subject/body_md';
    end if;
    insert into mail_template (key, locale, version, subject, body_md, description, active, updated_by)
    values (v_key, v_locale, 1, v_subject, v_body,
            nullif(btrim(p_data->>'description'), ''),
            coalesce((p_data->>'active')::boolean, true), current_person_id())
    returning version into v_version;
  else
    if (p_data ? 'subject' and v_subject is null) or (p_data ? 'body_md' and v_body is null) then
      raise exception 'fields_required' using errcode = '22023', detail = 'subject/body_md';
    end if;
    update mail_template set
      subject     = coalesce(v_subject, subject),
      body_md     = coalesce(v_body, body_md),
      description = case when p_data ? 'description' then nullif(btrim(p_data->>'description'), '') else description end,
      active      = coalesce((p_data->>'active')::boolean, active),
      version     = version + 1,
      updated_by  = current_person_id()
    where key = v_key and locale = v_locale
    returning version into v_version;
  end if;

  perform log_audit('mail_template.upsert', 'mail_template', v_key || '/' || v_locale, v_before,
                    jsonb_build_object('subject', coalesce(v_subject, v_before->>'subject'),
                                       'body_md', coalesce(v_body, v_before->>'body_md'),
                                       'version', v_version));
  return v_version;
end $$;

create or replace function mail_template_history(p_key text, p_locale text, p_limit integer DEFAULT 10)
 RETURNS TABLE(changed_at timestamp with time zone, changed_by text, subject_before text, body_before text, version_after integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not can_edit_mail_template(p_key) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.created_at,
           (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
              from person p where p.id = a.actor_person_id),
           a.before->>'subject', a.before->>'body_md', (a.after->>'version')::integer
      from audit_log a
     where a.action = 'mail_template.upsert'
       and a.object_id = p_key || '/' || p_locale
       and a.before is not null
     order by a.created_at desc, a.id desc
     limit greatest(1, least(coalesce(p_limit, 10), 50));
end $$;

create or replace function restore_mail_template(p_key text, p_locale text, p_subject text, p_body_md text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not can_edit_mail_template(p_key) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from mail_template t where t.key = p_key and t.locale = p_locale) then
    raise exception 'template_not_found' using errcode = 'P0002';
  end if;
  return upsert_mail_template(jsonb_build_object(
    'key', p_key, 'locale', p_locale, 'subject', p_subject, 'body_md', p_body_md));
end $$;

-- 8 · Beide Sprachen in einer Transaktion ---------------------------------------------------------------------------
create or replace function upsert_mail_template_pair(p_key text, p_de jsonb, p_en jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_de integer; v_en integer;
begin
  if nullif(btrim(coalesce(p_key, '')), '') is null then raise exception 'fields_required' using errcode = '22023', detail = 'key'; end if;
  if not can_edit_mail_template(p_key) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_de is null and p_en is null then raise exception 'fields_required' using errcode = '22023', detail = 'de/en'; end if;
  -- Je Sprache derselbe Weg wie bei einer einzelnen Vorlage (Version, Protokoll); ein Fehler in einer Sprache
  -- bricht die Funktion ab und mit ihr die Transaktion — es wird nie nur eine Sprache geschrieben.
  if p_de is not null then
    v_de := upsert_mail_template(p_de || jsonb_build_object('key', p_key, 'locale', 'de'));
  end if;
  if p_en is not null then
    v_en := upsert_mail_template(p_en || jsonb_build_object('key', p_key, 'locale', 'en'));
  end if;
  return jsonb_build_object('de', v_de, 'en', v_en);
end $$;

-- 9 · Kategorie, Anzeigename, Platzhalter -----------------------------------------------------------------------------
create or replace function set_mail_template_meta(p_key text, p_category text DEFAULT NULL::text, p_name_de text DEFAULT NULL::text,
                                                  p_name_en text DEFAULT NULL::text, p_variables text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alt mail_template_key%rowtype; v_cat text := nullif(btrim(coalesce(p_category, '')), '');
        v_de text := nullif(btrim(coalesce(p_name_de, '')), ''); v_en text := nullif(btrim(coalesce(p_name_en, '')), '');
        v_var text[]; v_neu mail_template_key%rowtype;
begin
  if nullif(btrim(coalesce(p_key, '')), '') is null then raise exception 'fields_required' using errcode = '22023', detail = 'key'; end if;
  if not can_edit_mail_template(p_key) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from mail_template t where t.key = p_key) then
    raise exception 'template_not_found' using errcode = 'P0002', detail = p_key;
  end if;
  -- Die Kategorie bestimmt, wer die Vorlage sieht — das entscheidet `admin`, nicht der Bereich. Dasselbe für die Platzhalter.
  if (v_cat is not null or p_variables is not null) and not has_admin_section('mail') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_cat is not null and not is_vocab_key('mail_category', v_cat) then
    raise exception 'invalid_category' using errcode = '22023', detail = v_cat;
  end if;
  if p_variables is not null then
    select coalesce(array_agg(distinct lower(btrim(x)) order by lower(btrim(x))), '{}') into v_var
      from unnest(p_variables) as x where btrim(x) ~ '^[A-Za-z0-9_]+$';
    if cardinality(v_var) <> (select count(distinct lower(btrim(x))) from unnest(p_variables) as x) then
      raise exception 'fields_required' using errcode = '22023', detail = 'variables';
    end if;
  end if;

  select * into v_alt from mail_template_key where key = p_key;
  if not found then
    insert into mail_template_key (key, category, name_de, name_en, variables)
      values (p_key, coalesce(v_cat, 'system'), coalesce(v_de, p_key), coalesce(v_en, p_key), coalesce(v_var, '{}'))
      returning * into v_neu;
  else
    update mail_template_key set
      category = coalesce(v_cat, category), name_de = coalesce(v_de, name_de), name_en = coalesce(v_en, name_en),
      variables = coalesce(v_var, variables), updated_at = now()
     where key = p_key returning * into v_neu;
  end if;
  if v_alt is not distinct from v_neu then return; end if;
  perform log_audit('mail_template.meta', 'mail_template', p_key,
                    case when v_alt.key is null then null
                         else jsonb_build_object('category', v_alt.category, 'name_de', v_alt.name_de, 'name_en', v_alt.name_en, 'variables', to_jsonb(v_alt.variables)) end,
                    jsonb_build_object('category', v_neu.category, 'name_de', v_neu.name_de, 'name_en', v_neu.name_en, 'variables', to_jsonb(v_neu.variables)));
end $$;

select harden_definer_functions();
