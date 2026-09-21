-- 0137 · Oberflächen zu 0123 (Rabattstufen) und 0124 (Stände tagesweise)
-- Zweck: Beide Bausteine haben funktionierende RPCs, aber keine Oberfläche —
-- ein 50-%-Kontingent und eine tagesweise Standbelegung liessen sich bisher nur
-- direkt in der Datenbank anlegen. Beim Bauen der Masken fehlten drei Angaben:
--   * `ticket_allocations_admin` gibt weder `discount_percent` noch
--     `org_edition_id` zurück — die 100er- und die 50er-Zeile derselben Org und
--     desselben Pass-Typs stehen in der Tabelle ununterscheidbar nebeneinander,
--     und `set_ticket_allocation_discount` braucht die Teilnahme-Kennung;
--   * `booth_day_plan` gibt keine `assignment_id` zurück, also lässt sich eine
--     Belegung aus der Oberfläche nicht lösen (`remove_booth_assignment`);
--   * es fehlt eine Liste der Stände, die **noch frei** sind — nach 0124 hängt
--     ein Stand ohne Belegung an keiner Edition mehr — und eine schmale
--     Auswahlliste der Teilnahmen für beide Formulare.
-- Dazu schliesst die Migration eine Lücke, die erst mit der Oberfläche auffiel:
-- `set_ticket_allocation` liess die **Menge** einer abgeleiteten 100-%-Zeile
-- ändern, obwohl `set_ticket_allocation_discount` genau das verweigert — der
-- nächste `sync_ticket_allocations` hätte die Handarbeit stillschweigend
-- überschrieben.
-- Anlass: Konrad, 21.09.2026 („bitte vorziehen, damit wir da sauber durchgehen
-- können"); Nummer und Sperre auf Zuruf der Architektur-Session.
-- Abweichungen: keine.

set search_path = public, extensions;

-- 1 · Kontingente: Rabattsatz und Teilnahme mitgeben ---------------------------
-- Basis: supabase/snapshot/functions/ticket_allocations_admin.sql. Neu sind zwei
-- Ausgabespalten; die bestehenden bleiben unverändert. Rückgabetyp ändert sich ⇒ droppen.

drop function if exists ticket_allocations_admin(uuid);
create or replace function ticket_allocations_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, org_id uuid, org_name text, org_edition_id uuid, edition_id uuid, pass_type text, discount_percent integer, quantity integer, used_count integer, coupon_code text, undershop_url text, status text, last_error text, synced_at timestamp with time zone, notes text, vivenu_coupon_id text, vivenu_undershop_id text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.id, a.org_id, coalesce(o.communication_name, o.legal_name), a.org_edition_id, a.event_id, a.pass_type,
           a.discount_percent, a.quantity, a.used_count, a.coupon_code, a.undershop_url, a.status,
           a.last_error, a.synced_at, a.notes, a.vivenu_coupon_id, a.vivenu_undershop_id, a.updated_at
    from org_ticket_allocation a join organization o on o.id = a.org_id
    where p_edition_id is null or a.event_id = p_edition_id
    order by case a.status when 'error' then 0 when 'pending_vivenu' then 1 when 'active' then 2 else 3 end,
             coalesce(o.communication_name, o.legal_name), a.pass_type, a.discount_percent desc;
end $$;

-- 2 · Die Menge der abgeleiteten Zeile gehört der Ableitung ---------------------
-- Basis: supabase/snapshot/functions/set_ticket_allocation.sql. Neu ist genau
-- eine Prüfung. Gesperrt ist nur die **Menge** einer 100-%-Zeile; Status,
-- Coupon-Felder und Notizen bleiben änderbar, sonst wäre der Reparaturweg für
-- den vivenu-Abgleich zu (Vorgabe der Architektur-Session, 21.09.).

create or replace function set_ticket_allocation(p_id uuid, p_quantity integer DEFAULT NULL::integer, p_coupon_code text DEFAULT NULL::text, p_undershop_url text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a org_ticket_allocation;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_a from org_ticket_allocation where id = p_id for update;
  if not found then raise exception 'allocation_not_found' using errcode = 'P0002'; end if;
  if p_quantity is not null and p_quantity < 0 then raise exception 'invalid_quantity' using errcode = '22023'; end if;
  -- Die 100er-Zeile leitet `sync_ticket_allocations` aus den gebuchten Produkten
  -- ab (0123). Eine Menge von Hand wäre beim nächsten Lauf wieder weg — und
  -- niemand sähe, dass sie verschwunden ist.
  if p_quantity is not null and p_quantity <> v_a.quantity and v_a.discount_percent = 100 then
    raise exception 'derived_allocation' using errcode = 'P0001',
      detail = 'Die Menge der 100-Prozent-Zeile kommt aus den gebuchten Produkten.';
  end if;
  if p_status is not null and p_status not in ('pending_vivenu', 'active', 'error', 'disabled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update org_ticket_allocation set
    quantity = coalesce(p_quantity, quantity),
    coupon_code = case when p_coupon_code is not null then nullif(btrim(p_coupon_code), '') else coupon_code end,
    undershop_url = case when p_undershop_url is not null then nullif(btrim(p_undershop_url), '') else undershop_url end,
    status = coalesce(p_status, status),
    notes = case when p_notes is not null then nullif(btrim(p_notes), '') else notes end,
    last_error = case when p_status = 'active' then null else last_error end,
    synced_at = case when p_quantity is not null and p_quantity <> v_a.quantity and v_a.vivenu_coupon_id is not null then null else synced_at end
  where id = p_id;
  perform log_audit('ticket.allocation_set', 'org_ticket_allocation', p_id::text,
                    jsonb_build_object('quantity', v_a.quantity, 'coupon_code', v_a.coupon_code, 'status', v_a.status),
                    jsonb_build_object('quantity', p_quantity, 'coupon_code', p_coupon_code, 'undershop_url', p_undershop_url, 'status', p_status, 'notes', p_notes));
end $$;

-- 3 · Standplan: Kennung der Belegung mitgeben ---------------------------------
-- Basis: supabase/snapshot/functions/booth_day_plan.sql. Neu ist die erste
-- Ausgabespalte `assignment_id`; ohne sie kann die Oberfläche nur anlegen,
-- nie lösen. Rückgabetyp ändert sich ⇒ droppen.

drop function if exists booth_day_plan(uuid);
create or replace function booth_day_plan(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(assignment_id uuid, event_day_id uuid, day_date date, day_label text, booth_id uuid, booth_number text, booth_type text, segment text, org_edition_id uuid, org_id uuid, org_name text, geteilt boolean, note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not (is_partner_team() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by e.start_date desc limit 1)) into v_ed;
  return query
    select ba.id, d.id, d.day_date, coalesce(d.label_de, to_char(d.day_date, 'DD.MM.')),
           b.id, b.booth_number, b.booth_type, b.segment,
           ba.org_edition_id, o.id, coalesce(nullif(btrim(o.communication_name), ''), o.legal_name),
           -- „Geteilt" heisst: an diesem Stand haengt mindestens eine
           -- Tagesbelegung. Genau die Staende will die Produktion sehen.
           exists (select 1 from booth_assignment x
                    where x.booth_id = b.id and x.event_day_id is not null),
           ba.note
      from event_day d
      join booth_assignment ba
        on (ba.event_day_id = d.id or ba.event_day_id is null)
      join booth b on b.id = ba.booth_id
      join org_edition oe on oe.id = ba.org_edition_id and oe.edition_id = v_ed
      join organization o on o.id = oe.org_id
     where d.event_id = v_ed
     order by d.day_date, b.booth_number nulls last, 11;
end $$;

-- 4 · Freie Stände -------------------------------------------------------------
-- Ein Stand ohne Belegung gehört seit 0124 keiner Edition mehr. „Frei" heisst
-- hier: für diese Edition gibt es keine Belegung „beide Tage" — dann ist
-- mindestens ein Tag noch zu vergeben. `belegte_tage` sagt, wie viele
-- Tagesbelegungen schon daran hängen.

create or replace function booths_free(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(booth_id uuid, booth_number text, booth_type text, segment text, belegte_tage integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not (is_partner_team() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by e.start_date desc limit 1)) into v_ed;
  return query
    select b.id, b.booth_number, b.booth_type, b.segment,
           (select count(*)::integer from booth_assignment x
              join org_edition xoe on xoe.id = x.org_edition_id and xoe.edition_id = v_ed
             where x.booth_id = b.id)
      from booth b
     where not exists (
       select 1 from booth_assignment a
         join org_edition aoe on aoe.id = a.org_edition_id and aoe.edition_id = v_ed
        where a.booth_id = b.id and a.event_day_id is null)
     order by b.booth_number nulls last, b.created_at;
end $$;

-- 5 · Auswahlliste der Teilnahmen ----------------------------------------------
-- Beide Formulare brauchen die `org_edition_id`; `partner_admin_overview`
-- liefert nur `org_id` und `edition_id` und dazu zwei Dutzend Spalten, die eine
-- Auswahlliste nicht braucht. Nur Name, Art und Stand der Teilnahme — keine
-- Kontaktdaten (Auflage der Architektur-Session).

create or replace function org_editions_picker(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_edition_id uuid, org_id uuid, org_name text, org_type text, onboarding_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not (is_partner_team() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by e.start_date desc limit 1)) into v_ed;
  return query
    select oe.id, o.id, coalesce(nullif(btrim(o.communication_name), ''), o.legal_name), o.type, oe.onboarding_status
      from org_edition oe
      join organization o on o.id = oe.org_id
     where oe.edition_id = v_ed and o.active
     order by coalesce(nullif(btrim(o.communication_name), ''), o.legal_name);
end $$;

select harden_definer_functions();
