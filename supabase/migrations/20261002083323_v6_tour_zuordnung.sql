-- 0248 · Company-Tour-Zuordnung im Admin: Tour-Typen, Partner je Tour zuordnen und tauschen, Abschnitt tourAssignment (ADM-045)
-- Angewendet von der Architektur-Session am 02.10.2026 als 20261002083323.
-- Company Tours zuordnen: Tour-Typen als Vokabular, Touren je Edition, Partner je Tour, Tauschen, Stand je Tour (ADM-045)
--
-- Zweck: Verkauft wird ein Company-Tour-Slot; **welche** Tour (Consulting,
-- Engineering, Finance, Logistik, Sales) ein Partner bekommt, legt das Team
-- danach gemeinsam fest, und teilweise wird getauscht (Konrad 22.09.: „Company
-- Tours sind Operations, nicht Verkauf"). Touren und Stopps gibt es seit 0134
-- (`company_tour`, `company_tour_stop`, Seite /admin/company-tours); es fehlte
-- die Arbeit dazwischen: wer hat gebucht und steht noch auf keiner Tour, wer
-- steht wo, und ein Tausch, der nicht in vier Einzelschritten passiert.
--
-- Umsetzung:
--   * Vokabular `company_tour_type` (die fünf Touren aus ADM-045) und Spalte
--     `company_tour.tour_type`; der Bestand wird über den Namen zugeordnet.
--     Die Tour „Marketing" aus 0134 (Konrad 18.09.: sechs Touren) steht nicht
--     in der Liste vom 22.09. und bleibt ohne Typ — nicht geraten.
--   * Abschnitt `tourAssignment` (dieselben Rollen wie `companyTours`).
--   * `tour_assignment_admin(edition)`: Touren mit Stopps, Partner und **Stand**
--     (Stopps besetzt, Angaben der Partner da, Tour Lead, Tag, Bewerbungs-Session)
--     und die Partner mit gebuchtem Company-Tour-Produkt samt ihren Touren —
--     wer gebucht hat und auf keiner Tour steht, fällt so auf.
--   * `ensure_company_tours(edition)`: legt je aktivem Tour-Typ die fehlende Tour
--     mit drei Stopps an (idempotent).
--   * `set_company_tour_type`, `assign_tour_stop` (Partner auf einen Stopp oder
--     herunter), `swap_tour_stops` (zwei Partner tauschen ihre Plätze) — jeweils
--     mit Audit.
--
-- **Tauschen heisst: die Plätze wandern, die Angaben bleiben beim Partner.**
-- Ein Stopp trägt zweierlei: die Position in der Tour (Tour, Reihenfolge,
-- Ankunft, Abfahrt) und was der Partner ausgefüllt hat (Adresse, Ansprechperson,
-- Zielgruppe, Fotos …). Getauscht werden die Positionen; die Zeile und damit
-- alles, was der Partner eingetragen hat, bleibt bei ihm — auch der Verweis aus
-- dem Partner-Portal (`partner_update_tour_stop(stop_id)`).
--
-- Fehlerschlüssel: 28000 · 42501 · 22023 `invalid_type` · P0002
-- `tour_not_found`, `stop_not_found`, `org_not_found` · P0001
-- `partner_already_on_tour` (ein Partner zweimal auf derselben Tour).
set search_path = public, extensions;

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('company_tour_type', 'consulting',  'Consulting',  'Consulting',  10, true),
  ('company_tour_type', 'engineering', 'Engineering', 'Engineering', 20, true),
  ('company_tour_type', 'finance',     'Finance',     'Finance',     30, true),
  ('company_tour_type', 'logistik',    'Logistik',    'Logistics',   40, true),
  ('company_tour_type', 'sales',       'Sales',       'Sales',       50, true)
on conflict (vocabulary, key) do nothing;

alter table company_tour add column tour_type text;
comment on column company_tour.tour_type is
  'ADM-045: welche Tour (Vokabular company_tour_type). Verkauft wird ein allgemeiner Slot; die Zuordnung macht das Team.';
create unique index company_tour_type_uidx on company_tour (edition_id, tour_type) where tour_type is not null;

update company_tour t set tour_type = v.key
  from vocab_term v
 where v.vocabulary = 'company_tour_type' and lower(btrim(t.name)) = lower(v.label_de) and t.tour_type is null;

insert into admin_section_role (section, role) values
  ('tourAssignment', 'admin'),
  ('tourAssignment', 'area_lead_partner'),
  ('tourAssignment', 'partner_team'),
  ('tourAssignment', 'programme_team'),
  ('tourAssignment', 'area_lead_production'),
  ('tourAssignment', 'production_team');

-- ---------------------------------------------------------------------------
create or replace function tour_assignment_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('tourAssignment') then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1));
  return jsonb_build_object(
    'edition_id', v_ed,
    'tours', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name, 'tour_type', t.tour_type, 'starts_at', t.starts_at,
               'has_day', t.event_day_id is not null, 'lead_name', ec.display_name,
               'session_title', coalesce(se.title_de, se.title_en),
               'stops', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', s.id, 'sort_order', s.sort_order, 'arrival_at', s.arrival_at,
                          'host_org_id', s.host_org_id,
                          'host_name', coalesce(nullif(btrim(o.communication_name), ''), o.legal_name),
                          'filled', s.filled_at is not null) order by s.sort_order)
                   from company_tour_stop s left join organization o on o.id = s.host_org_id
                  where s.tour_id = t.id), '[]'::jsonb),
               'stops_total', (select count(*) from company_tour_stop s where s.tour_id = t.id),
               'stops_assigned', (select count(*) from company_tour_stop s where s.tour_id = t.id and s.host_org_id is not null),
               'stops_filled', (select count(*) from company_tour_stop s where s.tour_id = t.id and s.filled_at is not null))
             order by tv.sort_order nulls last, t.starts_at nulls last, t.name)
        from company_tour t
        left join vocab_term tv on tv.vocabulary = 'company_tour_type' and tv.key = t.tour_type
        left join edition_contact ec on ec.id = t.lead_contact_id
        left join session se on se.id = t.session_id
       where t.edition_id = v_ed), '[]'::jsonb),
    'partners', coalesce((
      select jsonb_agg(jsonb_build_object(
               'org_id', b.org_id, 'name', b.name, 'products', b.products,
               'tours', coalesce((
                 select jsonb_agg(t.name order by t.name)
                   from company_tour_stop s join company_tour t on t.id = s.tour_id
                  where s.host_org_id = b.org_id and t.edition_id = v_ed), '[]'::jsonb))
             order by b.name)
        from (select oe.org_id, coalesce(nullif(btrim(o.communication_name), ''), o.legal_name) as name,
                     jsonb_agg(distinct pr.name_de) as products
                from org_edition oe
                join organization o on o.id = oe.org_id
                join org_product op on op.org_edition_id = oe.id and op.status = 'booked'
                join product pr on pr.sku = op.product_sku and pr.format_key = 'company_tour'
               where oe.edition_id = v_ed
               group by oe.org_id, o.communication_name, o.legal_name) b), '[]'::jsonb));
end $$;

create or replace function ensure_company_tours(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v record; v_tour uuid; v_n integer := 0;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('tourAssignment') then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1));
  if v_ed is null then raise exception 'edition_not_found' using errcode = 'P0002'; end if;
  for v in select key, label_de from vocab_term where vocabulary = 'company_tour_type' and active order by sort_order loop
    continue when exists (select 1 from company_tour t where t.edition_id = v_ed and t.tour_type = v.key);
    -- Eine Tour gleichen Namens ohne Typ (Bestand) bekommt den Typ, statt verdoppelt zu werden.
    update company_tour set tour_type = v.key
     where edition_id = v_ed and tour_type is null and lower(btrim(name)) = lower(v.label_de)
    returning id into v_tour;
    if v_tour is null then
      insert into company_tour (edition_id, name, tour_type, meeting_point)
      values (v_ed, v.label_de, v.key, 'CCH, Congressplatz 1, 20355 Hamburg')
      returning id into v_tour;
      insert into company_tour_stop (tour_id, sort_order) select v_tour, g from generate_series(1, 3) g;
    end if;
    v_n := v_n + 1;
    v_tour := null;
  end loop;
  perform log_audit('tour.ensure', 'event', v_ed::text, null, jsonb_build_object('tours', v_n));
  return v_n;
end $$;

create or replace function set_company_tour_type(p_tour_id uuid, p_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alt text; v_neu text := nullif(btrim(coalesce(p_type, '')), '');
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('tourAssignment') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_neu is not null and not is_vocab_key('company_tour_type', v_neu) then
    raise exception 'invalid_type' using errcode = '22023', detail = v_neu;
  end if;
  select t.tour_type into v_alt from company_tour t where t.id = p_tour_id for update;
  if not found then raise exception 'tour_not_found' using errcode = 'P0002'; end if;
  begin
    update company_tour set tour_type = v_neu, updated_at = now() where id = p_tour_id;
  exception when unique_violation then
    -- Je Edition gibt es jede Tour einmal.
    raise exception 'invalid_type' using errcode = '22023', detail = 'exists';
  end;
  perform log_audit('tour.type', 'company_tour', p_tour_id::text,
                    jsonb_build_object('tour_type', v_alt), jsonb_build_object('tour_type', v_neu));
end $$;

-- Partner auf einen Stopp setzen (oder herunternehmen: p_org_id null).
create or replace function assign_tour_stop(p_stop_id uuid, p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alt uuid; v_tour uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('tourAssignment') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_org_id is not null and not exists (select 1 from organization o where o.id = p_org_id) then
    raise exception 'org_not_found' using errcode = 'P0002';
  end if;
  select s.host_org_id, s.tour_id into v_alt, v_tour from company_tour_stop s where s.id = p_stop_id for update;
  if not found then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  begin
    update company_tour_stop set host_org_id = p_org_id, updated_at = now() where id = p_stop_id;
  exception when unique_violation then
    raise exception 'partner_already_on_tour' using errcode = 'P0001';
  end;
  perform log_audit('tour.assign', 'company_tour_stop', p_stop_id::text,
                    jsonb_build_object('host_org_id', v_alt), jsonb_build_object('host_org_id', p_org_id, 'tour_id', v_tour));
end $$;

-- Zwei Plätze tauschen: Position (Tour, Reihenfolge, Zeiten) wandert, die
-- Zeile mit den Angaben des Partners bleibt bei ihm (Kopf).
create or replace function swap_tour_stops(p_stop_a uuid, p_stop_b uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare a company_tour_stop; b company_tour_stop;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('tourAssignment') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_stop_a = p_stop_b then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  -- Feste Reihenfolge beim Sperren, damit zwei gleichzeitige Tausche sich nicht verhaken.
  perform 1 from company_tour_stop where id in (p_stop_a, p_stop_b) order by id for update;
  select * into a from company_tour_stop where id = p_stop_a;
  select * into b from company_tour_stop where id = p_stop_b;
  if a.id is null or b.id is null then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  if (select edition_id from company_tour where id = a.tour_id) <> (select edition_id from company_tour where id = b.tour_id) then
    raise exception 'stop_not_found' using errcode = 'P0002', detail = 'edition';
  end if;
  begin
    -- Über einen freien Zwischenplatz, sonst stösst (tour_id, sort_order) an sich selbst.
    update company_tour_stop set sort_order = -1 where id = a.id;
    update company_tour_stop set tour_id = a.tour_id, sort_order = a.sort_order,
                                 arrival_at = a.arrival_at, departure_at = a.departure_at, updated_at = now()
     where id = b.id;
    update company_tour_stop set tour_id = b.tour_id, sort_order = b.sort_order,
                                 arrival_at = b.arrival_at, departure_at = b.departure_at, updated_at = now()
     where id = a.id;
  exception when unique_violation then
    raise exception 'partner_already_on_tour' using errcode = 'P0001';
  end;
  perform log_audit('tour.swap', 'company_tour_stop', a.id::text,
                    jsonb_build_object('a', jsonb_build_object('stop', a.id, 'tour', a.tour_id, 'sort', a.sort_order, 'org', a.host_org_id),
                                       'b', jsonb_build_object('stop', b.id, 'tour', b.tour_id, 'sort', b.sort_order, 'org', b.host_org_id)),
                    jsonb_build_object('a_tour', b.tour_id, 'b_tour', a.tour_id));
end $$;

select harden_definer_functions();
