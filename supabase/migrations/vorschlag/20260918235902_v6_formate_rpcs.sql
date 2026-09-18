-- 0114 · Welle 6 A1, Teil 2: Partner-RPCs für „Eure Formate" (PART-034, PART-044–048).
--
-- **Setzt Teil 1 voraus** (`v6_formate_schema`: `session.partner_org_id`, `format_details`,
-- Bühnentypen, `session_question.requested_by/purpose`, `speaker_profile.created_by_org_id`).
--
-- Grundsatz aus dem Auftrag §C: **Ansprüche prüft die Datenbank, nicht die Oberfläche.** Jede
-- Funktion hier prüft die Mitgliedschaft, das Recht in der Organisation (`partner_can_edit`)
-- und den Anspruch aus `org_product`; Felder je Format sind Whitelists, keine freien Schlüssel.
--
-- **Konrads Entscheidungen vom 18.09. (Auftrag §D) sind eingearbeitet:**
--   * D1 Interview Tables: **beides** — der Partner legt beim Anlegen fest, ob Einzelgespräch
--     (eine Person je Slot) oder Gruppengespräch (Kapazität n): `format_details.interview_mode`.
--   * D2 Freigabe-Gate: **erst nach Freigabe durch das Team.** `session_needs_release` bleibt
--     als Funktion bestehen (umschaltbar), liefert aber jetzt die entschiedene Antwort; dazu
--     `release_partner_session` für den Partner-Admin, mit Audit wie bei Bewerbungen.
--   * D3 Export: alle Bewerbungsdaten, die der Partner ohnehin sieht, nur mit `consent_share`,
--     mit DSGVO-Hinweis in der Datei und Audit je Export.
--
-- **Company Tour steht nicht mehr hier.** Konrads Entscheidung D5 gibt ihr ein eigenes
-- Datenmodell (`company_tour` mit Stopps, Tour Lead, Sammelpunkt CCH) — ein Partner bucht
-- einen **Stopp**, nicht die Tour. Das ist ein eigener Baustein; die neun Angaben gehören
-- dann an den Stopp, nicht an `session.format_details`.

set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Anspruch

-- Wie viele Formate dieser Art darf die Organisation noch anlegen?
-- Gebucht minus vorhanden. `interview_table` zählt anders: dort ist die gebuchte Menge der
-- **Tisch**, nicht das einzelne Gespräch — die Zahl der Slots begrenzt der Kalender, nicht
-- der Anspruch (siehe `partner_create_session`).
create or replace function partner_entitlement(p_org_edition_id uuid, p_format text)
returns integer
language sql stable security definer set search_path = public, extensions as $$
  select greatest(
    coalesce((select sum(op.qty)::integer from org_product op join product p on p.sku = op.product_sku
               where op.org_edition_id = p_org_edition_id and op.status = 'booked' and p.format_key = p_format), 0)
    - coalesce((select count(*)::integer from session se
                 join org_edition oe on oe.id = p_org_edition_id
                 join event ev on ev.id = se.event_id
                where se.partner_org_id = oe.org_id and se.format = p_format
                  and se.publish_status <> 'cancelled'
                  and (ev.id = oe.edition_id or ev.edition_id = oe.edition_id)), 0),
    0)
$$;
revoke execute on function partner_entitlement(uuid, text) from public, anon, authenticated;

-- Braucht ein partner-angelegtes Format die Freigabe des Teams? (§D2, Vorgabe ja.)
-- Als Funktion statt als Konstante, damit die Antwort ohne Codeänderung umschaltbar ist,
-- sobald Konrad entschieden hat.
create or replace function session_needs_release(p_edition_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select true
$$;
comment on function session_needs_release(uuid) is
  'Freigabe-Gate für partner-angelegte Formate. **Entschieden (Konrad, 18.09., §D2): ja** — ein Side-Event oder Interview-Slot bleibt bis zur Freigabe durch das Team unveröffentlicht. Bleibt eine Funktion statt einer Konstante, damit eine spätere Lockerung je Edition ohne Änderung an den Aufrufern geht.';
revoke execute on function session_needs_release(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 2) Felder je Format

-- Die Whitelist. Ein Schlüssel, der hier nicht steht, wird abgewiesen — nicht ignoriert:
-- stillschweigend verworfene Eingaben sind der Grund, warum Formulare „nicht speichern".
create or replace function format_detail_keys(p_format text) returns text[]
language sql immutable set search_path = public, extensions as $$
  select case p_format
    when 'side_event' then array['location_text', 'image_asset_id']
    when 'interview_table' then array['job_title', 'job_posting_text', 'job_posting_url',
                                      'target_profile', 'interview_mode']
    -- `company_tour` fehlt mit Absicht: seit Konrads Entscheidung D5 (18.09.) hat sie ein
    -- eigenes Datenmodell mit Touren und Stopps; die Angaben des Partners gehören an seinen
    -- Stopp, nicht an die Session.
    else array[]::text[] end
$$;
revoke execute on function format_detail_keys(text) from public, anon, authenticated;

-- Prüft Schlüssel, Längen und Vokabular. Gibt den bereinigten Wert zurück (getrimmt, leere
-- Texte als NULL entfernt), damit nicht jede Aufruferin dasselbe noch einmal tut.
create or replace function check_format_details(p_format text, p_details jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_allowed text[] := format_detail_keys(p_format);
  v_out jsonb := '{}'::jsonb;
  k text; v_txt text; v_prof jsonb; v_key text; v_el text;
begin
  if p_details is null or p_details = '{}'::jsonb then return '{}'::jsonb; end if;
  if jsonb_typeof(p_details) <> 'object' then
    raise exception 'invalid_format_details' using errcode = '22023', detail = 'object_required';
  end if;

  for k in select jsonb_object_keys(p_details) loop
    if not (k = any(v_allowed)) then
      raise exception 'invalid_format_details' using errcode = '22023', detail = k;
    end if;
  end loop;

  -- Texte: trimmen, Längen prüfen. Leerer Text heißt „nicht gesetzt".
  for k, v_txt in
    select key, nullif(btrim(value #>> '{}'), '')
      from jsonb_each(p_details)
     where key in ('location_text','job_title','job_posting_text','job_posting_url')
  loop
    if v_txt is null then continue; end if;
    if k = 'location_text' and length(v_txt) > 200 then raise exception 'too_long' using errcode = '22023', detail = k; end if;
    if k = 'job_title' and length(v_txt) > 120 then raise exception 'too_long' using errcode = '22023', detail = k; end if;
    if k = 'job_posting_text' and length(v_txt) > 2000 then raise exception 'too_long' using errcode = '22023', detail = k; end if;
    if k = 'job_posting_url' and v_txt !~ '^https://' then
      raise exception 'invalid_url' using errcode = '22023', detail = k;
    end if;
    v_out := v_out || jsonb_build_object(k, v_txt);
  end loop;

  -- Einzel- oder Gruppengespräch (Konrad, D1): der Partner legt es je Tisch fest. Die
  -- Kapazität steht an der Session, hier nur die Art — sonst stünde „Gruppe" bei Kapazität 1.
  if p_details ? 'interview_mode' then
    if (p_details->>'interview_mode') not in ('single', 'group') then
      raise exception 'invalid_format_details' using errcode = '22023', detail = 'interview_mode';
    end if;
    v_out := v_out || jsonb_build_object('interview_mode', p_details->>'interview_mode');
  end if;

  -- Gesuchte Profile: dieselben Vokabular-Schlüssel wie im Teilnehmerprofil, damit die
  -- Auswahl auf beiden Seiten dasselbe bedeutet. Kein Freitext.
  if p_details ? 'target_profile' then
    v_prof := p_details->'target_profile';
    if jsonb_typeof(v_prof) <> 'object' then
      raise exception 'invalid_format_details' using errcode = '22023', detail = 'target_profile:object';
    end if;
    for v_key in select jsonb_object_keys(v_prof) loop
      if not (v_key = any(array['occupation_status','career_level','study_field'])) then
        raise exception 'invalid_format_details' using errcode = '22023', detail = 'target_profile.' || v_key;
      end if;
      if jsonb_typeof(v_prof->v_key) <> 'array' then
        raise exception 'invalid_format_details' using errcode = '22023', detail = 'target_profile.' || v_key || ':array';
      end if;
      for v_el in select jsonb_array_elements_text(v_prof->v_key) loop
        if not is_vocab_key(v_key, v_el) then
          raise exception 'invalid_vocab' using errcode = '22023', detail = v_key || ':' || v_el;
        end if;
      end loop;
    end loop;
    v_out := v_out || jsonb_build_object('target_profile', v_prof);
  end if;

  -- Hintergrundbild: eine Datei **dieser** Organisation, sonst zeigte ein Programmpunkt auf
  -- den Upload eines fremden Partners.
  if p_details ? 'image_asset_id' then
    v_out := v_out || jsonb_build_object('image_asset_id', p_details->>'image_asset_id');
  end if;
  return v_out;
end $$;
revoke execute on function check_format_details(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3) Lesen

-- Was dieser Partner an Formaten hat — für die Seiten unter „Eure Formate".
create or replace function partner_format_sessions(p_org_id uuid, p_format text default null, p_edition_id uuid default null)
returns table (id uuid, format text, title_de text, title_en text, description_de text, description_en text,
               language text, access_mode text, capacity integer, publish_status text, format_details jsonb,
               starts_at timestamptz, ends_at timestamptz, stage_name text, day_label_de text,
               applications_total integer, applications_accepted integer, is_host boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select se.id, se.format, se.title_de, se.title_en, se.description_de, se.description_en,
           se.language, se.access_mode, se.capacity, se.publish_status, se.format_details,
           sl.start_at, sl.end_at, st.name, ed.label_de,
           (select count(*)::integer from application a where a.session_id = se.id),
           (select count(*)::integer from application a where a.session_id = se.id and a.status in ('accepted','confirmed')),
           (se.host_org_id = p_org_id)
      from session se
      join event ev on ev.id = se.event_id
      left join slot sl on sl.id = se.slot_id
      left join stage st on st.id = sl.stage_id
      left join event_day ed on ed.id = sl.event_day_id
     where se.partner_org_id = p_org_id
       and (ev.id = v_oe.edition_id or ev.edition_id = v_oe.edition_id)
       and se.publish_status <> 'cancelled'
       and (p_format is null or se.format = p_format)
     order by sl.start_at nulls last, se.title_de;
end $$;

-- ---------------------------------------------------------------- 4) Anlegen (Side-Event, Interview Table)

-- Nur diese zwei Formate legt der Partner selbst an. Masterclass und Company Tour bekommen
-- einen festen Slot vom Team; der Partner **füllt** sie (siehe `partner_update_session`).
create or replace function partner_create_session(
  p_org_id uuid, p_format text, p_stage_id uuid, p_day_id uuid,
  p_start timestamptz, p_end timestamptz, p_title_de text,
  p_capacity integer default 1, p_details jsonb default '{}'::jsonb, p_edition_id uuid default null)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_me uuid := current_person_id(); v_slot uuid; v_id uuid;
        v_stage stage; v_day event_day; v_details jsonb; v_free integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_format not in ('side_event', 'interview_table') then
    raise exception 'invalid_format' using errcode = '22023', detail = coalesce(p_format, 'null');
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  if nullif(btrim(coalesce(p_title_de, '')), '') is null then
    raise exception 'title_required' using errcode = '22023';
  end if;
  if p_end is null or p_start is null or p_end <= p_start then
    raise exception 'invalid_time' using errcode = '22023', detail = 'end_after_start';
  end if;

  -- Die Fläche gehört dieser Organisation und ist vom richtigen Typ.
  select * into v_stage from stage where id = p_stage_id and active;
  if not found then raise exception 'stage_not_found' using errcode = 'P0002'; end if;
  if v_stage.partner_org_id is distinct from p_org_id then
    raise exception 'not allowed' using errcode = '42501', detail = 'stage_not_yours';
  end if;
  if v_stage.type <> (case p_format when 'interview_table' then 'interview_table' else 'side_event_venue' end) then
    raise exception 'invalid_format' using errcode = '22023', detail = 'stage_type';
  end if;
  select * into v_day from event_day where id = p_day_id and event_id = v_stage.event_id;
  if not found then raise exception 'day_not_found' using errcode = 'P0002'; end if;

  -- Anspruch: beim Side-Event zählt jedes Stück, beim Interview Table der Tisch — die Fläche
  -- existiert dann bereits, und wie viele Gespräche daraufpassen, entscheidet der Kalender.
  if p_format = 'side_event' then
    v_free := partner_entitlement(v_oe.id, 'side_event');
    if v_free <= 0 then raise exception 'no_entitlement' using errcode = 'P0001', detail = p_format; end if;
  end if;

  v_details := check_format_details(p_format, p_details);

  -- Zeiten am Slot (Weg A, Konrad 18.09.): der Ausschluss-Constraint `slot_no_overlap`
  -- verhindert zwei Gespräche zur selben Zeit an derselben Fläche — ohne eigene Prüfung.
  begin
    -- Status aus dem Vokabular `slot_status`: solange das Team freigeben muss, ist der Slot
    -- **angefragt**, nicht final — sonst stünde im Board eine Zusage, die niemand gegeben hat.
    insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status, source_ref, created_by)
    values (p_stage_id, p_day_id, p_start, p_end, 'partner_block',
            case when session_needs_release(v_oe.edition_id) then 'requested' else 'final' end,
            'partner:' || p_org_id::text, v_me)
    returning id into v_slot;
  exception when exclusion_violation then
    raise exception 'slot_overlap' using errcode = 'P0001', detail = p_start::text;
  end;

  insert into session (event_id, slot_id, format, title_de, language, access_mode, capacity,
                       partner_org_id, host_org_id, format_details, publish_status, created_by, updated_by)
  values (v_stage.event_id, v_slot, p_format, btrim(p_title_de), 'de', 'application',
          -- Einzelgespräch heißt eine Person je Slot; beim Gruppengespräch entscheidet der
          -- Partner (Konrad, D1). Ohne Angabe gilt Einzelgespräch.
          case when p_format = 'interview_table'
               then case when coalesce(v_details->>'interview_mode', 'single') = 'single'
                         then 1 else coalesce(p_capacity, 1) end
               else p_capacity end,
          p_org_id, p_org_id, v_details,
          case when session_needs_release(v_oe.edition_id) then 'review' else 'draft' end,
          v_me, v_me)
  returning id into v_id;

  perform log_audit('partner.session_create', 'session', v_id::text, null,
                    jsonb_build_object('org_id', p_org_id, 'format', p_format, 'slot_id', v_slot));
  return v_id;
end $$;

-- ---------------------------------------------------------------- 5) Füllen (alle vier Formate)

-- Whitelist der Felder, die ein Partner an seiner Session ändern darf. **Nie** Zeiten, Bühne,
-- Kapazität, Status oder die Organisation — das entscheidet das Programm.
create or replace function partner_update_session(p_session_id uuid, p_fields jsonb)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_se session; v_org uuid; v_details jsonb; v_bad text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  v_org := v_se.partner_org_id;
  if v_org is null or not partner_can_edit(v_org) then raise exception 'not allowed' using errcode = '42501'; end if;

  select string_agg(k, ',') into v_bad from jsonb_object_keys(p_fields) k
   where k not in ('title_de','title_en','description_de','description_en','language','format_details');
  if v_bad is not null then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_bad;
  end if;
  if p_fields ? 'language' and (p_fields->>'language') not in ('de','en','mixed') then
    raise exception 'invalid_language' using errcode = '22023', detail = p_fields->>'language';
  end if;

  v_details := case when p_fields ? 'format_details'
                    then check_format_details(v_se.format, p_fields->'format_details')
                    else v_se.format_details end;

  update session set
    title_de = case when p_fields ? 'title_de' then nullif(btrim(p_fields->>'title_de'), '') else title_de end,
    title_en = case when p_fields ? 'title_en' then nullif(btrim(p_fields->>'title_en'), '') else title_en end,
    description_de = case when p_fields ? 'description_de' then nullif(btrim(p_fields->>'description_de'), '') else description_de end,
    description_en = case when p_fields ? 'description_en' then nullif(btrim(p_fields->>'description_en'), '') else description_en end,
    language = case when p_fields ? 'language' then p_fields->>'language' else language end,
    format_details = v_details,
    updated_by = current_person_id()
  where id = p_session_id;

  perform log_audit('partner.session_update', 'session', p_session_id::text,
                    jsonb_build_object('format_details', v_se.format_details),
                    jsonb_build_object('fields', (select array_agg(k) from jsonb_object_keys(p_fields) k)));
end $$;

-- ---------------------------------------------------------------- 6) Löschen (nur ohne Zusagen)

create or replace function partner_delete_session(p_session_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_se session; v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if v_se.partner_org_id is null or not partner_can_edit(v_se.partner_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_se.format not in ('side_event', 'interview_table') then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_se.format;
  end if;
  -- Wer zugesagt hat, hat sich den Termin eingetragen. Ab da ist es keine Planung mehr.
  select count(*)::integer into v_n from application a
   where a.session_id = p_session_id and a.status in ('accepted', 'confirmed');
  if v_n > 0 then raise exception 'slot_locked' using errcode = 'P0001', detail = v_n::text; end if;

  update session set publish_status = 'cancelled', updated_by = current_person_id() where id = p_session_id;
  delete from slot where id = v_se.slot_id;
  perform log_audit('partner.session_delete', 'session', p_session_id::text,
                    jsonb_build_object('format', v_se.format), null);
end $$;

-- ---------------------------------------------------------------- 7) Bewerbungsfragen

-- Katalogfragen wählen — nur die, die das Team dafür freigegeben hat.
create or replace function partner_set_session_questions(p_session_id uuid, p_question_ids uuid[])
returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_se session; v_bad uuid; v_n integer := 0; q uuid; i integer := 0;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if v_se.partner_org_id is null or not partner_can_edit(v_se.partner_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select qc.id into v_bad from question_catalog qc
   where qc.id = any(coalesce(p_question_ids, '{}'::uuid[])) and not (qc.partner_selectable and qc.active)
   limit 1;
  if v_bad is not null then
    raise exception 'question_not_selectable' using errcode = 'P0001', detail = v_bad::text;
  end if;

  -- Eigene (beantragte) Fragen bleiben stehen: sie gehören nicht zur Katalogauswahl.
  delete from session_question where session_id = p_session_id and question_id is not null;
  foreach q in array coalesce(p_question_ids, '{}'::uuid[]) loop
    i := i + 1;
    insert into session_question (session_id, question_id, sort_order) values (p_session_id, q, i);
    v_n := v_n + 1;
  end loop;
  perform log_audit('partner.session_questions', 'session', p_session_id::text, null,
                    jsonb_build_object('count', v_n));
  return v_n;
end $$;

-- Eine neue Frage beantragen. Sie zählt erst nach der Freigabe durch das Team
-- (`approved_at`) — bis dahin sieht sie niemand im Bewerbungsformular.
create or replace function partner_request_question(
  p_session_id uuid, p_label_de text, p_label_en text, p_type text, p_purpose text, p_options jsonb default null)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_se session; v_id uuid; v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if v_se.partner_org_id is null or not partner_can_edit(v_se.partner_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_label_de, '')), '') is null then raise exception 'fields_required' using errcode = '22023', detail = 'label_de'; end if;
  -- Ohne Zweck keine Freigabe: die Stelle, an der begründet wird, wozu eine Frage dient.
  if nullif(btrim(coalesce(p_purpose, '')), '') is null then raise exception 'fields_required' using errcode = '22023', detail = 'purpose'; end if;
  if p_type not in ('text','textarea','select','multiselect','boolean','url','number') then
    raise exception 'invalid_type' using errcode = '22023', detail = coalesce(p_type, 'null');
  end if;

  -- Höchstens zwei eigene Fragen je Session (Antwort C, seit Welle 1).
  select count(*)::integer into v_n from session_question
   where session_id = p_session_id and question_id is null;
  if v_n >= 2 then raise exception 'too_many_questions' using errcode = 'P0001', detail = v_n::text; end if;

  insert into session_question (session_id, label_de, label_en, type, options, required, sort_order, requested_by, purpose)
  values (p_session_id, btrim(p_label_de), nullif(btrim(coalesce(p_label_en, '')), ''), p_type, p_options, false, 90,
          current_person_id(), btrim(p_purpose))
  returning id into v_id;
  perform log_audit('partner.question_request', 'session_question', v_id::text, null,
                    jsonb_build_object('session_id', p_session_id, 'purpose', btrim(p_purpose)));
  return v_id;
end $$;

-- ---------------------------------------------------------------- 8) Talk: Speaker eintragen

-- Der Partner trägt selbst einen Speaker ein (PART-044) — wie ein Stage Lead. Die Person
-- bekommt das normale Speaker-Onboarding; der Partner darf ihre Angaben pflegen, **bis sie
-- sich selbst anmeldet** (Trigger aus Teil 1).
create or replace function partner_add_speaker(
  p_session_id uuid, p_email text, p_first_name text, p_last_name text)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_se session; v_oe org_edition; v_person uuid; v_prof uuid; v_email citext; v_n integer; v_owner uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if v_se.partner_org_id is null or not partner_can_edit(v_se.partner_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_se.format not in ('keynote', 'panel', 'talk', 'impulse', 'fireside_chat', 'masterclass') then
    raise exception 'invalid_format' using errcode = '22023', detail = v_se.format;
  end if;
  v_email := nullif(btrim(coalesce(p_email, '')), '')::citext;
  if v_email is null or v_email::text !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023', detail = coalesce(p_email, 'null');
  end if;

  -- Ein bestätigter Speaker in dieser Rolle bleibt, wo er ist.
  select count(*)::integer into v_n from session_speaker ss
   where ss.session_id = p_session_id and ss.role = 'speaker' and ss.confirmed;
  if v_n > 0 then raise exception 'slot_locked' using errcode = 'P0001', detail = 'speaker_confirmed'; end if;

  -- Person über die Mailadresse finden oder anlegen (Dublettenregel wie im Partner-Ingest).
  select pe.person_id into v_person from person_email pe where pe.email = v_email limit 1;
  if v_person is null then
    insert into person (first_name, last_name) values (nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''))
      returning id into v_person;
    insert into person_email (person_id, email, is_primary) values (v_person, v_email, true);
  end if;

  select oe.* into v_oe from org_edition oe where oe.org_id = v_se.partner_org_id
     and oe.edition_id in (select coalesce(ev.edition_id, ev.id) from event ev where ev.id = v_se.event_id)
   limit 1;

  -- Betreuung: die Leitung der Bühne, sonst bleibt es offen und das Team teilt zu.
  select st.stage_lead_person_id into v_owner
    from slot sl join stage st on st.id = sl.stage_id where sl.id = v_se.slot_id;

  select sp.id into v_prof from speaker_profile sp
   where sp.person_id = v_person and sp.edition_id = coalesce(v_oe.edition_id, v_se.event_id);
  if v_prof is null then
    insert into speaker_profile (person_id, edition_id, pipeline_status, owner_person_id,
                                 created_by_org_id, partner_editable_until_login)
    values (v_person, coalesce(v_oe.edition_id, v_se.event_id), 'invited', v_owner,
            v_se.partner_org_id, true)
    returning id into v_prof;
  end if;

  insert into session_speaker (session_id, person_id, role)
  values (p_session_id, v_person, 'speaker')
  on conflict do nothing;

  perform log_audit('partner.add_speaker', 'session', p_session_id::text, null,
                    jsonb_build_object('org_id', v_se.partner_org_id, 'person_id', v_person, 'profile_id', v_prof));
  return v_prof;
end $$;

-- ---------------------------------------------------------------- 9) Freigabe (Konrad, D2)

-- Das Team gibt ein partner-angelegtes Format frei. Erst danach steht es im Programm.
-- Derselbe Umgang wie bei Bewerbungsentscheidungen: eine ausdrückliche Handlung mit Audit,
-- keine automatische Veröffentlichung.
create or replace function release_partner_session(p_session_id uuid, p_approved boolean, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_se session;
begin
  if not (is_partner_team() or is_programme_editor(null)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if v_se.partner_org_id is null then
    raise exception 'not_editable' using errcode = 'P0001', detail = 'not_a_partner_session';
  end if;
  if p_approved is false and nullif(btrim(coalesce(p_note, '')), '') is null then
    -- Eine Ablehnung ohne Grund kann der Partner nicht beheben.
    raise exception 'fields_required' using errcode = '22023', detail = 'note';
  end if;

  update session set
    publish_status = case when p_approved then 'published' else 'draft' end,
    updated_by = current_person_id()
  where id = p_session_id;
  -- Der Slot zieht mit: freigegeben heißt final, abgelehnt heißt wieder angefragt.
  update slot set status = case when p_approved then 'final' else 'requested' end
   where id = v_se.slot_id;

  perform log_audit(case when p_approved then 'partner.session_released' else 'partner.session_rejected' end,
                    'session', p_session_id::text,
                    jsonb_build_object('publish_status', v_se.publish_status),
                    jsonb_build_object('org_id', v_se.partner_org_id, 'note', nullif(btrim(coalesce(p_note, '')), '')));
end $$;

-- Was noch auf Freigabe wartet — für den Partner-Admin.
create or replace function partner_sessions_pending(p_edition_id uuid default null)
returns table (session_id uuid, org_id uuid, org_name text, format text, title_de text,
               starts_at timestamptz, stage_name text, format_details jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not (is_partner_team() or is_programme_editor(null)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select se.id, se.partner_org_id, coalesce(o.communication_name, o.legal_name), se.format, se.title_de,
           sl.start_at, st.name, se.format_details, se.created_at
      from session se
      join organization o on o.id = se.partner_org_id
      join event ev on ev.id = se.event_id
      left join slot sl on sl.id = se.slot_id
      left join stage st on st.id = sl.stage_id
     where se.publish_status = 'review'
       and se.format in ('side_event', 'interview_table')
       and (p_edition_id is null or ev.id = p_edition_id or ev.edition_id = p_edition_id)
     order by se.created_at;
end $$;

-- ---------------------------------------------------------------- 10) Export (Konrad, D3)

-- Der Partner exportiert die Bewerbungen seines Formats.
--
-- Konrads Entscheidung und die Auslegung der Architektur-Session: „alle Daten" heißt die
-- Bewerbung (Antworten, Datum, Status) plus die Felder, die der Partner **in der Liste ohnehin
-- sieht**. Nicht dabei: Art.-9-Felder (Ernährung, Gesundheit), Geburtsdatum, Geschlecht,
-- Telefon, interne Notizen — es sei denn, das Format fragt sie selbst ab, dann stehen sie in
-- den Antworten. Nur Bewerbungen mit `consent_share`; ohne Einwilligung keine Zeile.
--
-- Der Hinweistext gehört in die Datei, nicht nur in die Oberfläche: Die Tabelle wird
-- weitergereicht, die Oberfläche nicht.
create or replace function export_session_applications(p_session_id uuid)
returns table (bewerbung_id uuid, name text, email text, linkedin text, status text,
               beworben_am timestamptz, entschieden_am timestamptz, bestaetigt_am timestamptz,
               taetigkeit text, karrierestufe text, arbeitgeber text, hochschule text, studienfach text,
               stadt text, antworten jsonb)
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_se session; v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  -- Dieselbe Grenze wie in der Bewerberliste: wer entscheiden darf, darf exportieren.
  if not can_decide_session(p_session_id) then raise exception 'not allowed' using errcode = '42501'; end if;

  select count(*)::integer into v_n from application a
   where a.session_id = p_session_id and a.consent_share;
  -- Jeder Export steht im Protokoll: wer, wann, welches Format, wie viele Zeilen.
  perform log_audit('partner.application_export', 'session', p_session_id::text, null,
                    jsonb_build_object('org_id', v_se.partner_org_id, 'rows', v_n, 'format', v_se.format));

  return query
    select a.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           pe.email::text,
           p.linkedin_url,
           a.status, a.created_at, a.decided_at, a.confirmed_at,
           p.occupation_status, p.career_level, p.employer_name, p.university, p.study_field, p.city,
           a.answers
      from application a
      join person p on p.id = a.person_id
      left join person_email pe on pe.person_id = p.id and pe.is_primary
     where a.session_id = p_session_id
       and a.consent_share          -- ohne Einwilligung keine Zeile
     order by a.created_at;
end $$;

-- Der Hinweis, der in die Exportdatei gehört. Als Funktion, damit Oberfläche und spätere
-- Serverroute denselben Text nehmen und er an einer Stelle gepflegt wird.
create or replace function export_privacy_notice(p_language text default 'de') returns text
language sql immutable set search_path = public, extensions as $$
  select case when p_language = 'en' then
    'Personal data of applicants. You receive it solely to select participants for your format at Future Leader Summit 2027. You are the controller for this processing. Delete the data once the selection is complete, at the latest after the summit. Do not use it for any other purpose and do not pass it on. Only applicants who consented to sharing are included.'
  else
    'Personenbezogene Daten von Bewerberinnen und Bewerbern. Ihr erhaltet sie ausschließlich, um die Teilnehmenden eures Formats beim Future Leader Summit 2027 auszuwählen. Für diese Verarbeitung seid ihr verantwortlich. Löscht die Daten, sobald die Auswahl abgeschlossen ist, spätestens nach dem Summit. Nutzt sie für keinen anderen Zweck und gebt sie nicht weiter. Enthalten sind nur Bewerbungen, deren Einwilligung zur Weitergabe vorliegt.'
  end
$$;


select harden_definer_functions();
