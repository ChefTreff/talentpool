-- Vorschlag · Welle 6 · Company Tours als eigener Admin-Bereich (ADM-058, K-31) + ADM-052
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Konrad, 24.09.2026 — „Die Varianten stehen nicht im Katalog. Muessen aber dennoch im
-- Portal angelegt und zugeordnet werden koennen. Das ist dann ja nicht mehr Verkauf sondern
-- Operations. Dafuer braucht es einen eigenen dedizierten Admin Space." Dazu K-31 (25.09.): die
-- Tour wird mit ihrer **Session** verknuepft, damit Teilnehmende sich bewerben koennen
-- (`company_tour.session_id`, Spalte seit 0173).
--
-- **ADM-052 im selben Zug — ein echter Fehler, kein Schoenheitsfehler.** Die drei Funktionen
-- pruefen `is_partner_team() or is_programme_editor(null)`. `is_programme_editor` vergleicht
-- `ev.id = p_event_id`; mit `null` ist der Vergleich `null`, die Bedingung nie wahr, das `exists`
-- immer `false`. Das Programm-Team war also **ausgesperrt**, obwohl es ausdruecklich gemeint war —
-- und niemand merkte es, weil der Partner-Zweig die Funktionen fuer das Partner-Team offen hielt.
--
-- Statt die Rollenliste ein drittes Mal abzuschreiben, fragen alle drei jetzt
-- `has_admin_section('companyTours')` (PORT1b, 0186). Damit steht die Antwort an **einer** Stelle
-- — in `lib/admin-sections.ts`, gespiegelt in `admin_section_role` — und die Ausnahmen aus
-- `/admin/rollen` gelten hier wie ueberall sonst.
--
-- **Wer darf.** Bisher: `admin`, `area_lead_partner`, `partner_team` (aus `is_partner_team()`) und
-- gemeint, aber wirkungslos: `programme_team`. Neu zusaetzlich `area_lead_production` und
-- `production_team` — Konrads Begruendung „nicht mehr Verkauf, sondern Operations". Das ist eine
-- **Erweiterung**; sie ist gewollt, aber sie ist eine, und in den Stopps stehen dienstliche
-- Kontaktdaten der Gastgeber. Zu eng waere ueber `/admin/rollen` in einem Klick zu korrigieren,
-- zu weit nicht — deshalb steht sie hier ausdruecklich und nicht beilaeufig.
--
-- `partner_company_tour` (die Partner-Sicht) bleibt unberuehrt: sie beantwortet eine andere Frage
-- („was habe ich gebucht"), nicht den Zugang zum Admin-Bereich.
--
-- **Kein Loeschen von Stopps.** Ein Stopp kann von einem Partner gebucht sein; ihn wegzuraeumen
-- loeschte dessen Buchung mit, ohne dass es jemand sieht. Wer einen Stopp los werden will, macht
-- das bewusst und mit Sicht auf die Buchung — dafuer kommt ein eigener Schnitt.
--
-- Basis: `supabase/snapshot/functions/company_tours_admin.sql`, `upsert_company_tour.sql`,
-- `upsert_company_tour_stop.sql` (Konvention §1).
-- Test: `supabase/tests/v6_company_tours_admin.sql`.

-- 1 · Der Abschnitt (Spiegelung von lib/admin-sections.ts, PORT1b)
insert into admin_section_role (section, role) values
  ('companyTours', 'admin'),
  ('companyTours', 'area_lead_partner'),
  ('companyTours', 'partner_team'),
  ('companyTours', 'programme_team'),
  ('companyTours', 'area_lead_production'),
  ('companyTours', 'production_team')
on conflict (section, role) do nothing;

-- 2 · Die Liste. Rueckgabe erweitert (Session, Notiz, Tag, Begleitung als Kennung), deshalb
--     drop + create: eine geaenderte RETURNS TABLE laesst sich nicht ersetzen.
drop function if exists company_tours_admin(uuid);
create or replace function company_tours_admin(p_edition_id uuid default null::uuid)
 returns table(tour_id uuid, name text, track text, event_day_id uuid, meeting_point text,
               starts_at timestamp with time zone, ends_at timestamp with time zone,
               lead_contact_id uuid, lead_name text, capacity integer, notes text,
               session_id uuid, session_title text,
               stops integer, stops_filled integer)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
begin
  if not has_admin_section('companyTours') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select ct.id, ct.name, ct.track, ct.event_day_id, ct.meeting_point, ct.starts_at, ct.ends_at,
           ct.lead_contact_id, ec.display_name, ct.capacity, ct.notes,
           ct.session_id, coalesce(se.title_de, se.title_en),
           (select count(*)::integer from company_tour_stop s where s.tour_id = ct.id),
           (select count(*)::integer from company_tour_stop s where s.tour_id = ct.id and s.filled_at is not null)
      from company_tour ct
      left join edition_contact ec on ec.id = ct.lead_contact_id
      left join session se on se.id = ct.session_id
     where p_edition_id is null or ct.edition_id = p_edition_id
     order by ct.starts_at nulls last, ct.name;
end $$;

-- 3 · Die Stopps einer Tour
create or replace function company_tour_stops_admin(p_tour_id uuid)
 returns table(stop_id uuid, sort_order integer, arrival_at timestamp with time zone,
               departure_at timestamp with time zone, host_org_id uuid, host_org_name text,
               address text, contact_name text, time_note text, snacks boolean,
               notes_public text, filled_at timestamp with time zone)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
begin
  if not has_admin_section('companyTours') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select s.id, s.sort_order, s.arrival_at, s.departure_at, s.host_org_id,
           coalesce(nullif(btrim(o.communication_name), ''), o.legal_name),
           s.address, s.contact_name, s.time_note, s.snacks, s.notes_public, s.filled_at
      from company_tour_stop s
      left join organization o on o.id = s.host_org_id
     where s.tour_id = p_tour_id
     order by s.sort_order, s.arrival_at nulls last;
end $$;

-- 4 · Die Auswahllisten des Editors — eine Abfrage, ein Gate.
create or replace function company_tour_options(p_edition_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
declare v_ed uuid;
begin
  if not has_admin_section('companyTours') then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  return jsonb_build_object(
    'edition_id', v_ed,
    'days', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', d.id,
                            'label', coalesce(nullif(btrim(d.label_de), ''), to_char(d.day_date, 'DD.MM.YYYY')))
                          order by d.day_date)
                        from event_day d where d.event_id = v_ed), '[]'::jsonb),
    -- Nur Begleitpersonen vom Typ `tour_lead`: `check_edition_contact` laesst
    -- beim Speichern ohnehin nichts anderes zu, und eine Liste, aus der man
    -- Falsches waehlen kann, ist eine Falle.
    'leads', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.display_name) order by c.sort_order, c.display_name)
                         from edition_contact c where c.edition_id = v_ed and c.type = 'tour_lead'), '[]'::jsonb),
    -- Sessions im Format `company_tour` — **plus** jede, die schon an einer Tour
    -- haengt: sonst verschwaende eine bestehende Verknuepfung aus der Liste,
    -- sobald jemand das Format der Session aendert, und der Editor schriebe sie
    -- beim naechsten Speichern still weg.
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', se.id,
                            'title', coalesce(se.title_de, se.title_en, '(ohne Titel)'),
                            'format', se.format) order by coalesce(se.title_de, se.title_en))
                            from session se
                           where se.event_id = v_ed
                             and (se.format = 'company_tour'
                                  or exists (select 1 from company_tour t where t.session_id = se.id))), '[]'::jsonb),
    'orgs', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', coalesce(nullif(btrim(o.communication_name), ''), o.legal_name))
                        order by coalesce(nullif(btrim(o.communication_name), ''), o.legal_name))
                        from organization o where o.active), '[]'::jsonb));
end $$;

-- 5 · Anlegen und pflegen, jetzt mit Session
create or replace function upsert_company_tour(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_ed uuid := nullif(p_data->>'edition_id', '')::uuid;
        v_session uuid;
begin
  if not has_admin_section('companyTours') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_id is null then
    if v_ed is null or nullif(btrim(coalesce(p_data->>'name', '')), '') is null then
      raise exception 'fields_required' using errcode = '22023', detail = 'edition_id,name';
    end if;
    insert into company_tour (edition_id, name, track, event_day_id, meeting_point, starts_at, ends_at, lead_contact_id, capacity, notes)
    values (v_ed, btrim(p_data->>'name'), nullif(p_data->>'track', ''), nullif(p_data->>'event_day_id','')::uuid,
            coalesce(nullif(btrim(coalesce(p_data->>'meeting_point','')), ''), 'CCH, Congressplatz 1, 20355 Hamburg'),
            nullif(p_data->>'starts_at','')::timestamptz, nullif(p_data->>'ends_at','')::timestamptz,
            nullif(p_data->>'lead_contact_id','')::uuid, nullif(p_data->>'capacity','')::integer,
            nullif(btrim(coalesce(p_data->>'notes','')), ''))
    returning id into v_id;
  else
    update company_tour set
      name = case when p_data ? 'name' then btrim(p_data->>'name') else name end,
      track = case when p_data ? 'track' then nullif(p_data->>'track','') else track end,
      event_day_id = case when p_data ? 'event_day_id' then nullif(p_data->>'event_day_id','')::uuid else event_day_id end,
      meeting_point = case when p_data ? 'meeting_point' then coalesce(nullif(btrim(p_data->>'meeting_point'),''), meeting_point) else meeting_point end,
      starts_at = case when p_data ? 'starts_at' then nullif(p_data->>'starts_at','')::timestamptz else starts_at end,
      ends_at = case when p_data ? 'ends_at' then nullif(p_data->>'ends_at','')::timestamptz else ends_at end,
      lead_contact_id = case when p_data ? 'lead_contact_id' then nullif(p_data->>'lead_contact_id','')::uuid else lead_contact_id end,
      capacity = case when p_data ? 'capacity' then nullif(p_data->>'capacity','')::integer else capacity end,
      notes = case when p_data ? 'notes' then nullif(btrim(p_data->>'notes'),'') else notes end
    where id = v_id;
    if not found then raise exception 'tour_not_found' using errcode = 'P0002'; end if;
  end if;
  -- K-31: die Session, auf die sich Teilnehmende bewerben. Nur Sessions **dieser
  -- Edition** — eine Tour, die auf das Programm eines anderen Jahres zeigt,
  -- faellt erst im Portal auf, und dann als leere Bewerbungsseite.
  if p_data ? 'session_id' then
    v_session := nullif(p_data->>'session_id','')::uuid;
    if v_session is not null and not exists (
         select 1 from session se
          where se.id = v_session
            and se.event_id = (select edition_id from company_tour where id = v_id)) then
      raise exception 'session_not_found' using errcode = 'P0002', detail = v_session::text;
    end if;
    update company_tour set session_id = v_session where id = v_id;
  end if;
  -- Die Begleitperson muss vom richtigen Typ und aus derselben Edition sein.
  if (select lead_contact_id from company_tour where id = v_id) is not null then
    perform check_edition_contact((select lead_contact_id from company_tour where id = v_id),
                                  (select edition_id from company_tour where id = v_id), 'tour_lead');
  end if;
  perform log_audit('tour.upsert', 'company_tour', v_id::text, null, p_data);
  return v_id;
end $$;

-- 6 · Stopps
create or replace function upsert_company_tour_stop(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_tour uuid := nullif(p_data->>'tour_id', '')::uuid;
begin
  if not has_admin_section('companyTours') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_id is null then
    if v_tour is null then raise exception 'fields_required' using errcode = '22023', detail = 'tour_id'; end if;
    insert into company_tour_stop (tour_id, sort_order, arrival_at, departure_at, host_org_id, address)
    values (v_tour, coalesce(nullif(p_data->>'sort_order','')::integer, 1),
            nullif(p_data->>'arrival_at','')::timestamptz, nullif(p_data->>'departure_at','')::timestamptz,
            nullif(p_data->>'host_org_id','')::uuid, nullif(btrim(coalesce(p_data->>'address','')), ''))
    returning id into v_id;
  else
    update company_tour_stop set
      sort_order = case when p_data ? 'sort_order' then (p_data->>'sort_order')::integer else sort_order end,
      arrival_at = case when p_data ? 'arrival_at' then nullif(p_data->>'arrival_at','')::timestamptz else arrival_at end,
      departure_at = case when p_data ? 'departure_at' then nullif(p_data->>'departure_at','')::timestamptz else departure_at end,
      host_org_id = case when p_data ? 'host_org_id' then nullif(p_data->>'host_org_id','')::uuid else host_org_id end,
      address = case when p_data ? 'address' then nullif(btrim(p_data->>'address'),'') else address end
    where id = v_id;
    if not found then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  end if;
  perform log_audit('tour.stop_upsert', 'company_tour_stop', v_id::text, null, p_data);
  return v_id;
end $$;

select harden_definer_functions();
