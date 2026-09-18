-- =============================================================================
-- 0123 · Welle 6 · Rabattstufen je Kontingent (A3.3, ADM-022)
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
--
-- Initiativen bekommen Tickets als Gegenleistung, und nicht alle davon
-- kostenlos: die Hälfte der Plätze zum halben Preis ist eine übliche
-- Vereinbarung. Dafür braucht ein Kontingent einen Satz, und eine Organisation
-- braucht **zwei** Kontingente desselben Pass-Typs mit unterschiedlichem Satz.
--
-- **Die Eindeutigkeit musste sich ändern.** Bisher war ein Kontingent je
-- `(event, org, pass_type)` eindeutig — genau das verhinderte den zweiten Satz.
-- Neu ist `discount_percent` Teil des Schlüssels.
--
-- **Wer besitzt welche Zeile?** Das ist die eigentliche Entscheidung dieser
-- Migration, und ohne sie zerstört der nächste Abgleich die Handarbeit:
--
-- * **100 % gehört der Ableitung.** `sync_ticket_allocations` rechnet sie aus
--   den gebuchten Produkten und schreibt sie bei jedem Lauf neu. Das ist der
--   Normalfall für Partner: was im Deal steht, ist inklusive.
-- * **50 % gehört dem Team.** Diese Zeile entsteht von Hand über
--   `set_ticket_allocation_discount` und wird von der Ableitung **nicht
--   angefasst** — weder überschrieben noch gelöscht noch deaktiviert. Ohne die
--   Einschränkungen unten hätte der nächste Produktabgleich sie entfernt, weil
--   kein Produkt sie erklärt.
--
-- Deshalb tragen die Aufräum- und Schreibschritte in `sync_ticket_allocations`
-- jetzt `discount_percent = 100`.
--
-- **Grundlage sind die Live-Fassungen aus `supabase/snapshot/functions/`**
-- (Stand nach 0122). Geändert sind nur die genannten Zeilen; die beiden Leser
-- bekommen `discount_percent` in den Rückgabetyp, damit der vivenu-Lauf den
-- Satz kennt — dort ist `discountValue` ein Anteil (1 = 100 %), also 0.5 bei
-- 50 %.
--
-- **Ein Befund am Rand:** Nach den Migrationsdateien griffen **drei**
-- Funktionen auf die alte Eindeutigkeit zu. Live ist es nur noch **eine** — die
-- beiden anderen sind seit ihrer Einführung ersetzt worden und schreiben keine
-- Kontingente mehr. Der Funktions-Snapshot hat das in einem Blick gezeigt;
-- nach den Dateien hätte ich zwei Funktionen angefasst, die so nicht mehr
-- existieren.
--
-- Fehlerschlüssel: 42501 ohne Partner-Team · 22023 `invalid_discount` ·
-- 22023 `invalid_quantity` · P0001 `derived_allocation` (100 % gehört der
-- Ableitung) · P0002 `org_edition_not_found`.
--
-- Test: supabase/tests/v6_rabattstufen.sql
-- =============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------- Spalte

alter table org_ticket_allocation add column if not exists discount_percent integer not null default 100;
alter table org_ticket_allocation drop constraint if exists org_ticket_allocation_discount_chk;
alter table org_ticket_allocation add constraint org_ticket_allocation_discount_chk
  check (discount_percent in (50, 100));
comment on column org_ticket_allocation.discount_percent is
  'Rabattsatz des Kontingents in Prozent (0123): 100 = kostenlos, 50 = halber Preis. Die 100er-Zeile leitet sync_ticket_allocations aus den Produkten ab; die 50er setzt das Team von Hand, und die Ableitung fasst sie nicht an.';

-- Erst der neue Index, dann die alte Bedingung weg — in dieser Reihenfolge ist
-- die Tabelle keinen Moment ohne Eindeutigkeit.
create unique index if not exists org_ticket_allocation_satz_uidx
  on org_ticket_allocation (event_id, org_id, pass_type, discount_percent);
alter table org_ticket_allocation drop constraint if exists org_ticket_allocation_event_id_org_id_pass_type_key;

-- ------------------------------------------- Ableitung: nur die 100-%-Zeile

create or replace function sync_ticket_allocations(p_org_edition_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; r record; v_n integer := 0;
begin
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then return 0; end if;
  for r in
    select effective_pass_type(pr.pass_type, v_oe.id) as pass_type, sum(op.qty)::integer as quantity
    from org_product op join product pr on pr.sku = op.product_sku
    where op.org_edition_id = v_oe.id and op.status = 'booked' and pr.pass_type is not null
    group by effective_pass_type(pr.pass_type, v_oe.id)
  loop
    insert into org_ticket_allocation (event_id, org_id, org_edition_id, pass_type, quantity, discount_percent)
    values (v_oe.edition_id, v_oe.org_id, v_oe.id, r.pass_type, r.quantity, 100)
    on conflict (event_id, org_id, pass_type, discount_percent) do update set
      quantity = excluded.quantity, org_edition_id = excluded.org_edition_id,
      status = case when org_ticket_allocation.status = 'disabled' then 'pending_vivenu' else org_ticket_allocation.status end,
      synced_at = case when org_ticket_allocation.quantity <> excluded.quantity or org_ticket_allocation.status = 'disabled' then null else org_ticket_allocation.synced_at end;
    v_n := v_n + 1;
  end loop;
  -- Kontingente ohne Produkt: noch nicht in vivenu ⇒ weg; sonst deaktivieren (die Route schaltet den Coupon ab)
  delete from org_ticket_allocation a
   where a.org_id = v_oe.org_id and a.event_id = v_oe.edition_id and a.status = 'pending_vivenu'
     and a.discount_percent = 100
     and not exists (select 1 from org_product op join product pr on pr.sku = op.product_sku
                     where op.org_edition_id = v_oe.id and op.status = 'booked' and pr.pass_type is not null and effective_pass_type(pr.pass_type, v_oe.id) = a.pass_type);
  update org_ticket_allocation a set status = 'disabled', quantity = 0, synced_at = null
   where a.org_id = v_oe.org_id and a.event_id = v_oe.edition_id and a.status in ('active', 'error')
     and a.discount_percent = 100
     and not exists (select 1 from org_product op join product pr on pr.sku = op.product_sku
                     where op.org_edition_id = v_oe.id and op.status = 'booked' and pr.pass_type is not null and effective_pass_type(pr.pass_type, v_oe.id) = a.pass_type);
  return v_n;
end $$;

-- ---------------------------------------------------------------- Von Hand

/**
 * Ein Kontingent mit Rabattsatz von Hand setzen.
 *
 * Nur für Sätze, die die Ableitung **nicht** kennt. Wer hier 100 setzen wollte,
 * schriebe in die Zeile, die `sync_ticket_allocations` beim nächsten Lauf
 * überschreibt — eine Änderung, die von allein wieder verschwindet, und das ist
 * die schlimmste Art von Fehler. Deshalb P0001 `derived_allocation`.
 *
 * `p_quantity = 0` löscht nicht, sondern deaktiviert: an einem Kontingent hängt
 * drüben ein Coupon, und den schaltet die Route ab.
 */
create or replace function set_ticket_allocation_discount(
  p_org_edition_id uuid, p_pass_type text, p_discount_percent integer, p_quantity integer)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_id uuid; v_vorher jsonb;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_discount_percent is null or p_discount_percent not in (50, 100) then
    raise exception 'invalid_discount' using errcode = '22023',
      detail = coalesce(p_discount_percent::text, 'null');
  end if;
  if p_discount_percent = 100 then
    raise exception 'derived_allocation' using errcode = 'P0001',
      detail = 'Die 100-Prozent-Zeile leitet sich aus den Produkten ab.';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'invalid_quantity' using errcode = '22023', detail = coalesce(p_quantity::text, 'null');
  end if;
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_edition_id::text;
  end if;

  select to_jsonb(a) - 'coupon_code' into v_vorher from org_ticket_allocation a
   where a.event_id = v_oe.edition_id and a.org_id = v_oe.org_id
     and a.pass_type = p_pass_type and a.discount_percent = p_discount_percent;

  insert into org_ticket_allocation (event_id, org_id, org_edition_id, pass_type,
                                     quantity, discount_percent, status)
  values (v_oe.edition_id, v_oe.org_id, v_oe.id, p_pass_type,
          p_quantity, p_discount_percent,
          case when p_quantity = 0 then 'disabled' else 'pending_vivenu' end)
  on conflict (event_id, org_id, pass_type, discount_percent) do update set
    quantity = excluded.quantity,
    org_edition_id = excluded.org_edition_id,
    status = case when excluded.quantity = 0 then 'disabled' else 'pending_vivenu' end,
    -- Menge geändert heisst: der Coupon drüben stimmt nicht mehr.
    synced_at = case when org_ticket_allocation.quantity <> excluded.quantity then null
                     else org_ticket_allocation.synced_at end
  returning id into v_id;

  perform log_audit('allocation.discount', 'org_edition', p_org_edition_id::text,
                    coalesce(v_vorher, 'null'::jsonb),
                    jsonb_build_object('pass_type', p_pass_type,
                                       'discount_percent', p_discount_percent,
                                       'quantity', p_quantity));
  return v_id;
end $$;
grant execute on function set_ticket_allocation_discount(uuid, text, integer, integer) to authenticated;

-- ------------------------------------------- Leser: der Satz geht mit hinaus

-- Der Rückgabetyp wächst um eine Spalte, und `create or replace` kann ihn nicht
-- ändern („cannot change return type of existing function"). Deshalb drop und
-- neu — beide Funktionen sind nur für `authenticated` freigegeben und werden
-- ausschliesslich vom vivenu-Lauf gerufen, es hängt kein View daran.
drop function if exists ticket_allocations_pending();
create or replace function ticket_allocations_pending()
 RETURNS TABLE(id uuid, org_id uuid, org_name text, org_slug text, edition_id uuid, edition_slug text, vivenu_event_id text, pass_type text, quantity integer, discount_percent integer, status text, coupon_code text, vivenu_coupon_id text, vivenu_undershop_id text, org_undershop_id text, ticket_type_ids text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.id, a.org_id, coalesce(o.communication_name, o.legal_name), o.slug, a.event_id, e.slug, e.vivenu_event_id, a.pass_type, a.quantity, a.discount_percent, a.status,
           a.coupon_code, a.vivenu_coupon_id, a.vivenu_undershop_id,
           (select b.vivenu_undershop_id from org_ticket_allocation b where b.org_id = a.org_id and b.event_id = a.event_id and b.vivenu_undershop_id is not null limit 1),
           coalesce((select array_agg(m.vivenu_ticket_type_id order by m.vivenu_ticket_type_id) from ticket_type_map m
                     where m.active and m.pass_type = a.pass_type and m.event_id in (select ev.id from event ev where ev.id = a.event_id or ev.edition_id = a.event_id)), '{}'::text[])
    from org_ticket_allocation a join organization o on o.id = a.org_id join event e on e.id = a.event_id
    where e.vivenu_event_id is not null and (a.status in ('pending_vivenu', 'error') or a.synced_at is null)
    order by e.vivenu_event_id, o.id, a.pass_type;
end $$;

drop function if exists ticket_allocations_of_orgs(uuid, uuid[]);
create or replace function ticket_allocations_of_orgs(p_event_id uuid, p_org_ids uuid[])
 RETURNS TABLE(id uuid, org_id uuid, org_name text, org_slug text, edition_id uuid, edition_slug text, vivenu_event_id text, pass_type text, quantity integer, discount_percent integer, status text, coupon_code text, vivenu_coupon_id text, vivenu_undershop_id text, org_undershop_id text, ticket_type_ids text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.id, a.org_id, coalesce(o.communication_name, o.legal_name), o.slug, a.event_id, e.slug, e.vivenu_event_id,
           a.pass_type, a.quantity, a.discount_percent, a.status, a.coupon_code, a.vivenu_coupon_id, a.vivenu_undershop_id,
           (select b.vivenu_undershop_id from org_ticket_allocation b
             where b.org_id = a.org_id and b.event_id = a.event_id and b.vivenu_undershop_id is not null limit 1),
           coalesce((select array_agg(m.vivenu_ticket_type_id order by m.vivenu_ticket_type_id) from ticket_type_map m
                     where m.active and m.pass_type = a.pass_type
                       and m.event_id in (select ev.id from event ev where ev.id = a.event_id or ev.edition_id = a.event_id)), '{}'::text[])
      from org_ticket_allocation a join organization o on o.id = a.org_id join event e on e.id = a.event_id
     where a.event_id = p_event_id and a.org_id = any(p_org_ids)
     order by o.id, a.pass_type;
end $$;

select harden_definer_functions();
