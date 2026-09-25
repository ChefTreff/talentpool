-- Vorschlag · Welle 6 · Check-in-Sicht im Admin (ADM-051)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Admin-Vollstaendigkeitspruefung vom 24.09. — den Check-in gibt es nur als Kiosk
-- (`/checkin`, Geraetekonto). Im Admin sah niemand, was am Einlass passiert: keine Zahlen je Tag,
-- keine Suche, wenn jemand vor der Tuer steht und sein Ticket nicht funktioniert.
--
-- **Ein Befund vorweg, der die Aufgabe beschneidet: „unbekannt" gibt es nicht.** Der Zuschnitt nennt
-- „gescannt, abgewiesen, unbekannt". Die ersten beiden stehen in `checkin.result`
-- (`ok`, `duplicate`, `invalid`, `blocked`); **unbekannte Barcodes werden nicht gespeichert** — so
-- steht es seit 0071 am Spaltenkommentar. Diese Zahl laesst sich also nicht anzeigen, und sie zu
-- erfinden waere schlimmer als sie wegzulassen. Ob unbekannte Scans kuenftig festgehalten werden,
-- ist eine Datenschutzentscheidung (es waere ein Code einer Person, die wir nicht kennen) und keine
-- Bauentscheidung — sie liegt bei Konrad.
--
-- **Zur Rolle.** Der Zuschnitt nennt `checkin_operator`. Die Rolle steht in `EXTERNAL_ROLES`
-- (`lib/admin-sections.ts`): „ein Tablet am Eingang", das im Admin nichts zu suchen hat — genau
-- deshalb wurde sie am 24.09. aus `team_role_keys()` entfernt. Der Abschnitt bekommt deshalb die
-- Leitungen und Teams, die den Einlass verantworten (Volunteers und Produktion), **nicht** das
-- Geraetekonto. Soll ein Mensch mit Geraetekonto zusaetzlich in den Admin, geht das ueber eine
-- Ausnahme in `/admin/rollen` — sichtbar und einzeln, statt als stille Regel fuer jedes Tablet.
--
-- Zwei Lesefunktionen, beide `has_admin_section('checkin')`:
--   * `checkin_admin_days` — je Veranstaltungstag, was die Scanner gemeldet haben. Tage **ohne**
--     Scan stehen mit Nullen da: „noch nichts gescannt" ist eine Antwort, eine leere Liste nicht.
--   * `checkin_admin_search` — die Frage an der Tuer: wer ist das, und was ist mit dem Ticket?
--     Name und Adresse als Teiltreffer, **der Barcode nur genau**. Eine Teilsuche auf Barcodes waere
--     ein Weg, gueltige Codes zu erraten.
-- Test: `supabase/tests/v6_checkin_admin.sql`.

-- 1 · Der Abschnitt (Spiegelung von lib/admin-sections.ts, PORT1b)
insert into admin_section_role (section, role) values
  ('checkin', 'admin'),
  ('checkin', 'area_lead_volunteers'),
  ('checkin', 'volunteers_team'),
  ('checkin', 'area_lead_production'),
  ('checkin', 'production_team')
on conflict (section, role) do nothing;

-- 2 · Was je Tag passiert ist
create or replace function checkin_admin_days(p_edition_id uuid default null::uuid)
 returns table(tag date, label text, ok integer, duplicate integer, invalid integer, blocked integer,
               geraete integer, erster timestamp with time zone, letzter timestamp with time zone)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
declare v_ed uuid;
begin
  if not has_admin_section('checkin') then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  if v_ed is null then raise exception 'edition_not_found' using errcode = 'P0002'; end if;
  return query
    -- Tage der Veranstaltung **und** Tage, an denen gescannt wurde: ein Scan am
    -- Aufbautag gehoert in die Liste, auch wenn er in keinem Programm steht.
    with tage as (
      select d.day_date as tag, nullif(btrim(d.label_de), '') as label
        from event_day d join event e on e.id = d.event_id
       where coalesce(e.edition_id, e.id) = v_ed
      union
      select c.scan_day, null from checkin c where c.edition_id = v_ed
    )
    select t.tag, t.label,
           count(*) filter (where c.result = 'ok')::integer,
           count(*) filter (where c.result = 'duplicate')::integer,
           count(*) filter (where c.result = 'invalid')::integer,
           count(*) filter (where c.result = 'blocked')::integer,
           count(distinct c.device_id)::integer,
           min(c.scanned_at), max(c.scanned_at)
      from tage t
      left join checkin c on c.edition_id = v_ed and c.scan_day = t.tag
     group by t.tag, t.label
     order by t.tag;
end $$;

-- 3 · Die Frage an der Tuer
create or replace function checkin_admin_search(p_query text, p_edition_id uuid default null::uuid,
                                                p_limit integer default 25)
 returns table(ticket_id uuid, holder text, email text, pass_type text, status text, barcode text,
               scans integer, letzter_scan timestamp with time zone, letztes_ergebnis text)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
declare v_ed uuid; v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not has_admin_section('checkin') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_q is null or length(v_q) < 3 then
    -- Unter drei Zeichen kaeme die halbe Edition zurueck. Eine leere Antwort waere
    -- irrefuehrend, deshalb ein eigener Schluessel.
    raise exception 'query_too_short' using errcode = '22023', detail = '3';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  return query
    select t.id,
           nullif(btrim(coalesce(t.holder_first_name, '') || ' ' || coalesce(t.holder_last_name, '')), ''),
           t.holder_email::text, t.pass_type, t.status, t.barcode,
           (select count(*)::integer from checkin c where c.ticket_id = t.id),
           (select max(c.scanned_at) from checkin c where c.ticket_id = t.id),
           (select c.result from checkin c where c.ticket_id = t.id order by c.scanned_at desc limit 1)
      from ticket t
      join event e on e.id = t.event_id
     where coalesce(e.edition_id, e.id) = v_ed
       and (
            -- Name und Adresse als Teiltreffer: so sucht man an der Tuer.
            coalesce(t.holder_first_name, '') || ' ' || coalesce(t.holder_last_name, '') ilike '%' || v_q || '%'
         or t.holder_email::text ilike '%' || v_q || '%'
            -- **Der Barcode nur genau.** Eine Teilsuche darauf waere ein Weg,
            -- gueltige Codes zu erraten.
         or t.barcode = v_q
         or t.vivenu_ticket_id = v_q
       )
     order by t.holder_last_name nulls last, t.holder_first_name nulls last
     limit greatest(1, least(coalesce(p_limit, 25), 100));
end $$;

select harden_definer_functions();
