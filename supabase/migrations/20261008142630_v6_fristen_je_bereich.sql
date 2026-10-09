-- 0286 · Fristen je Bereich: Abschnitte, eigene Fristen, sicheres Löschen (ADM-099)
-- Angewendet von der Architektur-Session am 08.10.2026 als 20261008142630.
-- 00NN · Fristen je Bereich: Rechte, eigene Fristen, Löschen, Übersicht (ADM-099)
--
-- Anlass: Konrad 08.10.2026 (Admin-Feedback Teil 1): „Fristen aufteilen auf Speaker, Partner und Volunteers … Partner-Manager legen
-- Partner-Fristen selbst an; unter System bleibt eine gesammelte Übersicht mit Tabs je Bereich; interne Schlüssel nicht anzeigen;
-- Erinnerung in Tagen.“ Datenmodell von Plan am 08.10.2026 freigegeben (docs/vorschlag-adm099-fristen-je-bereich.md, #404).
--
-- * **Rechte je Zielgruppe über Abschnitte** (ADM-053): `deadlinesSpeaker` (area_lead_speaker, programme_team), `deadlinesPartner`
--   (area_lead_partner, partner_team), `deadlinesVolunteers` (area_lead_volunteers, volunteers_team); `award`, `all` und jede andere
--   Zielgruppe ⇒ `deadlinesSystem` (nur admin). `can_edit_deadline(audience)` — fail closed. Der bestehende Abschnitt `deadlines`
--   bleibt die **Übersicht** (alle internen Rollen lesen). `upsert_deadline` prüfte bisher `is_staff()`: jedes Teammitglied durfte jede
--   Frist ändern — jetzt je Zielgruppe, beim Verschieben für **alt und neu**. Die Verschärfung ist gewollt.
-- * **`deadline.custom`:** Bestand = false = **Systemfristen** (Schlüssel und Zielgruppe fest, nicht löschbar — Code, Produktvorlagen und
--   Aufgaben hängen daran). Eigene Fristen (`custom = true`) legt ein Bereich nur mit Beschriftung DE/EN, Datum und Erinnerung an; die
--   Funktion erzeugt den Schlüssel `custom_<slug>` (eindeutig je Edition, nirgends sichtbar). Ein Schlüssel von aussen gibt es nur für
--   `admin` (Abschnitt `deadlinesSystem`): so entsteht eine Systemfrist, auf die Code verweisen soll.
-- * **Ändern über die Id:** `upsert_deadline` nimmt neben (Edition, Schlüssel) auch `id` — die Oberfläche kennt den Schlüssel nicht.
-- * **`delete_deadline(id)`:** nur `custom` und **nicht in Gebrauch** (Verweis in `deliverable_template.due_rule` oder `speaker_task.deadline_key`
--   der Edition); sonst P0001 `deadline_in_use` mit der Zahl der Verweise, bei einer Systemfrist P0001 `deadline_is_system`.
-- * **Erinnerung in Tagen:** `reminder_days` (0–90) rechnet die Funktion mal 24; gespeichert bleibt `reminder_lead_hours`
--   (die Erinnerungsjobs rechnen damit). Das alte `reminder_lead_hours` im Aufruf gilt weiter (0–2160), `reminder_days` gewinnt.
-- * **`deadlines_overview(p_edition)`:** die Übersicht — je Frist Beschriftung, Datum, Erinnerung in Tagen, Systemfrist ja/nein, **ob die
--   Person sie ändern darf** und wie oft sie in Gebrauch ist — **ohne Schlüssel**.
-- Fehlerschlüssel: 42501 · 22023 `fields_required` (Edition, Beschriftung, Datum, Schlüsselform), `invalid_reminder` ·
-- P0001 `deadline_in_use`, `deadline_is_system` · P0002 `deadline_not_found`, `edition_not_found`.
set search_path = public, extensions;

alter table deadline add column if not exists custom boolean not null default false;
comment on column deadline.custom is
  'ADM-099: eigene Frist eines Bereichs (Schluessel custom_<slug>, loeschbar solange ungenutzt). false = Systemfrist: Schluessel und Zielgruppe fest, Code und Vorlagen verweisen darauf.';

insert into admin_section_role (section, role) values
  ('deadlinesSpeaker', 'admin'), ('deadlinesSpeaker', 'area_lead_speaker'), ('deadlinesSpeaker', 'programme_team'),
  ('deadlinesPartner', 'admin'), ('deadlinesPartner', 'area_lead_partner'), ('deadlinesPartner', 'partner_team'),
  ('deadlinesVolunteers', 'admin'), ('deadlinesVolunteers', 'area_lead_volunteers'), ('deadlinesVolunteers', 'volunteers_team'),
  ('deadlinesSystem', 'admin')
on conflict do nothing;

create or replace function deadline_section(p_audience text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select case coalesce(p_audience, '')
           when 'speaker' then 'deadlinesSpeaker'
           when 'partner' then 'deadlinesPartner'
           when 'volunteer' then 'deadlinesVolunteers'
           else 'deadlinesSystem' end
$$;

create or replace function can_edit_deadline(p_audience text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select has_admin_section(deadline_section(p_audience))
$$;

-- Die Frist in Gebrauch: Vorlagen für Pflichten (global) und Speaker-Aufgaben (je Edition) zeigen mit dem Schlüssel darauf.
create or replace function deadline_usage_count(p_edition_id uuid, p_key text)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select (select count(*) from deliverable_template t where t.due_rule ->> 'deadline_key' = p_key)::integer
       + (select count(*) from speaker_task s where s.edition_id = p_edition_id and s.deadline_key = p_key)::integer
$$;

create or replace function upsert_deadline(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_edition uuid := nullif(p_data->>'edition_id', '')::uuid;
  v_key text := nullif(btrim(coalesce(p_data->>'key', '')), '');
  v_aud text := coalesce(nullif(btrim(coalesce(p_data->>'audience', '')), ''), 'all');
  v_de text := nullif(btrim(coalesce(p_data->>'label_de', '')), '');
  v_en text := nullif(btrim(coalesce(p_data->>'label_en', '')), '');
  v_due timestamptz := nullif(p_data->>'due_at', '')::timestamptz;
  v_id_in uuid := nullif(p_data->>'id', '')::uuid;
  v_hours integer; v_tage integer; v_old deadline%rowtype; v_neu deadline%rowtype; v_id uuid; v_basis text; v_n integer := 1;
begin
  -- Ändern **über die Id**: der Schlüssel ist eine Code-Schnittstelle und steht nirgends in der Oberfläche, die Zeile kennt nur die Id.
  if v_id_in is not null then
    select * into v_old from deadline d where d.id = v_id_in;
    if not found then raise exception 'deadline_not_found' using errcode = 'P0002', detail = v_id_in::text; end if;
    v_edition := v_old.edition_id;
    v_key := v_old.key;
  end if;
  if v_edition is null then raise exception 'fields_required' using errcode = '22023', detail = 'edition_id'; end if;
  if not exists (select 1 from event e where e.id = v_edition and e.is_edition) then
    raise exception 'edition_not_found' using errcode = 'P0002', detail = v_edition::text;
  end if;
  if v_due is null then raise exception 'fields_required' using errcode = '22023', detail = 'due_at'; end if;

  -- Erinnerung: Tage gewinnen vor Stunden; ungültig ist ein Fehler, kein stilles Zurechtbiegen.
  if p_data ? 'reminder_days' and nullif(p_data->>'reminder_days', '') is not null then
    v_tage := (p_data->>'reminder_days')::integer;
    if v_tage < 0 or v_tage > 90 then raise exception 'invalid_reminder' using errcode = '22023', detail = v_tage::text; end if;
    v_hours := v_tage * 24;
  elsif p_data ? 'reminder_lead_hours' and nullif(p_data->>'reminder_lead_hours', '') is not null then
    v_hours := (p_data->>'reminder_lead_hours')::integer;
    if v_hours < 0 or v_hours > 2160 then raise exception 'invalid_reminder' using errcode = '22023', detail = v_hours::text; end if;
  end if;

  if v_key is not null then
    select * into v_old from deadline d where d.edition_id = v_edition and d.key = v_key;
  end if;

  if v_old.id is not null then
    if not can_edit_deadline(v_old.audience) then raise exception 'not allowed' using errcode = '42501'; end if;
    if v_aud <> v_old.audience then
      -- Die Zielgruppe einer Systemfrist ist fest: Portale und Jobs lesen sie.
      if not v_old.custom then raise exception 'deadline_is_system' using errcode = 'P0001', detail = v_old.audience; end if;
      if not can_edit_deadline(v_aud) then raise exception 'not allowed' using errcode = '42501'; end if;
    end if;
    update deadline set
      audience = v_aud, due_at = v_due,
      label_de = coalesce(v_de, label_de), label_en = coalesce(v_en, label_en),
      description_de = case when p_data ? 'description_de' then nullif(p_data->>'description_de', '') else description_de end,
      description_en = case when p_data ? 'description_en' then nullif(p_data->>'description_en', '') else description_en end,
      reminder_lead_hours = coalesce(v_hours, reminder_lead_hours),
      updated_at = now()
     where id = v_old.id returning * into v_neu;
  else
    if not can_edit_deadline(v_aud) then raise exception 'not allowed' using errcode = '42501'; end if;
    if v_de is null then raise exception 'fields_required' using errcode = '22023', detail = 'label_de'; end if;
    if v_en is null then raise exception 'fields_required' using errcode = '22023', detail = 'label_en'; end if;
    if v_key is not null then
      -- Ein Schlüssel von aussen ist eine Systemfrist, auf die Code verweisen soll — das legt nur admin an.
      if not has_admin_section('deadlinesSystem') then raise exception 'not allowed' using errcode = '42501'; end if;
      if v_key !~ '^[a-z][a-z0-9_]{2,60}$' then raise exception 'fields_required' using errcode = '22023', detail = 'key'; end if;
    else
      v_basis := trim(both '_' from regexp_replace(lower(translate(replace(v_de, 'ß', 'ss'), 'äöüÄÖÜ', 'aouAOU')), '[^a-z0-9]+', '_', 'g'));
      v_basis := 'custom_' || coalesce(nullif(left(v_basis, 40), ''), 'frist');
      v_key := v_basis;
      while exists (select 1 from deadline d where d.edition_id = v_edition and d.key = v_key) loop
        v_n := v_n + 1;
        v_key := v_basis || '_' || v_n;
      end loop;
    end if;
    insert into deadline (edition_id, key, audience, due_at, label_de, label_en, description_de, description_en, reminder_lead_hours, custom)
    values (v_edition, v_key, v_aud, v_due, v_de, v_en, nullif(p_data->>'description_de', ''), nullif(p_data->>'description_en', ''),
            coalesce(v_hours, 48), coalesce(nullif(p_data->>'key', '') is null, false))
    returning * into v_neu;
  end if;

  perform log_audit('deadline.upsert', 'deadline', v_neu.id::text,
                    case when v_old.id is null then null else
                      jsonb_build_object('audience', v_old.audience, 'due_at', v_old.due_at, 'label_de', v_old.label_de, 'label_en', v_old.label_en,
                                         'reminder_lead_hours', v_old.reminder_lead_hours) end,
                    jsonb_build_object('key', v_neu.key, 'audience', v_neu.audience, 'due_at', v_neu.due_at, 'label_de', v_neu.label_de,
                                       'label_en', v_neu.label_en, 'reminder_lead_hours', v_neu.reminder_lead_hours, 'custom', v_neu.custom));
  return v_neu.id;
end $$;

create or replace function delete_deadline(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v deadline%rowtype; v_n integer;
begin
  select * into v from deadline d where d.id = p_id for update;
  if not found then raise exception 'deadline_not_found' using errcode = 'P0002', detail = coalesce(p_id::text, ''); end if;
  if not can_edit_deadline(v.audience) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not v.custom then raise exception 'deadline_is_system' using errcode = 'P0001'; end if;
  v_n := deadline_usage_count(v.edition_id, v.key);
  if v_n > 0 then raise exception 'deadline_in_use' using errcode = 'P0001', detail = v_n::text; end if;
  delete from deadline where id = p_id;
  perform log_audit('deadline.delete', 'deadline', p_id::text,
                    jsonb_build_object('key', v.key, 'audience', v.audience, 'due_at', v.due_at, 'label_de', v.label_de, 'label_en', v.label_en), null);
end $$;

create or replace function deadlines_overview(p_edition uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, edition_id uuid, audience text, due_at timestamp with time zone, label_de text, label_en text,
               description_de text, description_en text, reminder_days integer, reminder_hours integer, custom boolean,
               can_edit boolean, usage_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_admin_section('deadlines') or has_admin_section('deadlinesSpeaker') or has_admin_section('deadlinesPartner')
          or has_admin_section('deadlinesVolunteers') or has_admin_section('deadlinesSystem')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select d.id, d.edition_id, d.audience, d.due_at, d.label_de, d.label_en, d.description_de, d.description_en,
           d.reminder_lead_hours / 24, d.reminder_lead_hours, d.custom,
           can_edit_deadline(d.audience),
           case when d.custom then deadline_usage_count(d.edition_id, d.key) else 0 end
      from deadline d
     where p_edition is null or d.edition_id = p_edition
     order by d.due_at, d.label_de;
end $$;

select harden_definer_functions();
