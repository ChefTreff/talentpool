-- 0064 · Merch-Konfiguration serverseitig prüfen (S4, Entscheidung 14; Anlass: Vorbereitung Merch, Build-Session).
-- Das Schema steht am Produkt (`product.merch_config`), die Antwort an der Bestellzeile (`shop_order_line.merch_config`).
-- Bisher prüfte das niemand: eine Bestellung ohne Größenverteilung liess sich bestätigen. `shop_confirm` weist sie jetzt ab
-- (P0001 `merch_incomplete`, detail = `<sku>:<feldschlüssel>`), die Oberfläche sperrt denselben Knopf schon vorher.
-- Bewusst nur beim Bestätigen, nicht in `shop_upsert_line`: ein halb ausgefüllter Warenkorb darf stehen bleiben.
-- Abweichungen: keine. Schema und Antwort bleiben generisch — ein neues Produkt mit gepflegtem Schema genügt, ohne Code.
set search_path = public, extensions;

-- Feldliste eines Produkts: die Liste direkt oder `{ "fields": [...] }`; alles andere heißt „kein Merch-Artikel".
create or replace function merch_fields(p_config jsonb) returns jsonb
language sql immutable security definer set search_path = public, extensions as $$
  select case
           when jsonb_typeof(p_config) = 'array' then p_config
           when jsonb_typeof(p_config) = 'object' and jsonb_typeof(p_config->'fields') = 'array' then p_config->'fields'
           else '[]'::jsonb
         end
$$;
revoke execute on function merch_fields(jsonb) from public, anon, authenticated;

/**
 * Erster Verstoß einer Konfiguration gegen das Schema, sonst null.
 *
 * Gleiche Regeln wie `lib/partner/merch.ts`: Pflichtfelder müssen ausgefüllt
 * sein, ein Pflicht-Haken gesetzt, ein Auswahlwert aus der Liste kommen, ein
 * Text die Zeichengrenze halten — und eine Größenverteilung muss die
 * Bestellmenge genau treffen.
 */
create or replace function merch_problem(p_schema jsonb, p_values jsonb, p_qty numeric) returns text
language plpgsql immutable security definer set search_path = public, extensions as $$
declare f jsonb; v_key text; v_type text; v_required boolean; v_raw jsonb; v_text text; v_sum numeric; v_max integer;
begin
  for f in select value from jsonb_array_elements(merch_fields(p_schema)) loop
    v_key := nullif(btrim(coalesce(f->>'key', '')), '');
    continue when v_key is null;
    v_type := coalesce(nullif(f->>'type', ''), 'text');
    -- Ohne Angabe ist ein Feld Pflicht; sonst rutscht eine halbe Konfiguration durch, weil jemand `required` vergaß.
    v_required := coalesce((f->>'required')::boolean, true);
    v_raw := coalesce(p_values, '{}'::jsonb) -> v_key;

    if v_type = 'sizes' then
      if jsonb_typeof(v_raw) = 'object' then
        select coalesce(sum(case when e.value ~ '^-?[0-9]+$' then e.value::numeric else 0 end), 0)
          into v_sum from jsonb_each_text(v_raw) e where e.value ~ '^-?[0-9]+$' and e.value::numeric > 0;
      else
        v_sum := 0;
      end if;
      if v_sum = 0 then
        if v_required then return v_key; end if;
      elsif v_sum <> p_qty then
        return v_key;
      end if;
      continue;
    end if;

    if v_type = 'boolean' then
      if v_required and coalesce(v_raw, 'false'::jsonb) <> 'true'::jsonb then return v_key; end if;
      continue;
    end if;

    v_text := case when v_raw is null or jsonb_typeof(v_raw) = 'null' then null else btrim(v_raw #>> '{}') end;
    if coalesce(v_text, '') = '' then
      if v_required then return v_key; end if;
      continue;
    end if;

    if v_type = 'select' and jsonb_typeof(f->'options') = 'array'
       and not exists (select 1 from jsonb_array_elements_text(f->'options') o where o = v_text) then
      return v_key;
    end if;

    v_max := nullif(f->>'max_length', '')::integer;
    if v_type in ('text', 'textarea') and v_max is not null and length(v_text) > v_max then
      return v_key;
    end if;
  end loop;
  return null;
end $$;
revoke execute on function merch_problem(jsonb, jsonb, numeric) from public, anon, authenticated;

/**
 * Bestätigen prüft jetzt zusätzlich die Merch-Konfiguration jeder Zeile.
 *
 * Die Prüfung sitzt hinter der Snapshot-Auffrischung: gilt am Produkt seit
 * gestern ein neues Schema, zählt das neue — sonst bestätigte jemand gegen
 * ein Schema, das die Produktion nicht mehr kennt.
 */
create or replace function shop_confirm(p_order_id uuid, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_o shop_order; v_org uuid; v_oe org_edition; v_phase jsonb; v_org_name text; v_primary uuid; r record; v_locale text;
        v_lines_de text; v_lines_en text; v_tot record; v_tz text; v_bad record;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  v_org := shop_order_org(p_order_id);
  if not partner_can_edit(v_org) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_o.status not in ('draft', 'editing') then raise exception 'not_editable' using errcode = 'P0001', detail = v_o.status; end if;
  select * into v_oe from org_edition where id = v_o.org_edition_id;
  v_phase := shop_phase(v_oe.edition_id);
  if (v_phase->>'phase')::integer <> v_o.phase then raise exception 'phase_closed' using errcode = 'P0001', detail = 'order phase ' || v_o.phase::text; end if;
  if not exists (select 1 from shop_order_line where order_id = p_order_id) then raise exception 'empty_order' using errcode = '22023'; end if;
  update shop_order_line l set price_net_cents = coalesce(p.net_price_cents, l.price_net_cents), vat_rate = p.vat_rate, name_de = p.name_de, name_en = p.name_en, unit = p.unit, category = p.category
    from product p where p.sku = l.product_sku and l.order_id = p_order_id;

  -- Merch (S4): jede Zeile mit Schema muss vollständig konfiguriert sein.
  select l.product_sku as sku, merch_problem(p.merch_config, l.merch_config, l.qty) as problem
    into v_bad
    from shop_order_line l join product p on p.sku = l.product_sku
   where l.order_id = p_order_id
     and jsonb_array_length(merch_fields(p.merch_config)) > 0
     and merch_problem(p.merch_config, l.merch_config, l.qty) is not null
   order by l.created_at limit 1;
  if v_bad.sku is not null then
    raise exception 'merch_incomplete' using errcode = 'P0001', detail = v_bad.sku || ':' || v_bad.problem;
  end if;

  perform shop_reconcile_ledger(p_order_id, false);
  update shop_order set status = 'pending', confirmed_at = now(), confirmed_by = v_me, note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note) where id = p_order_id;
  select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = v_org;
  select e.timezone into v_tz from event e where e.id = v_oe.edition_id;
  select string_agg(format('- %s × %s (%s)', trim(to_char(sl.qty, 'FM999999990.##')), sl.name_de, fmt_cents(sl.price_net_cents, 'de')), E'\n' order by sl.created_at),
         string_agg(format('- %s × %s (%s)', trim(to_char(sl.qty, 'FM999999990.##')), coalesce(sl.name_en, sl.name_de), fmt_cents(sl.price_net_cents, 'en')), E'\n' order by sl.created_at)
    into v_lines_de, v_lines_en from shop_order_line sl where sl.order_id = p_order_id;
  select * into v_tot from shop_order_totals(p_order_id);
  select om.person_id into v_primary from org_membership om where om.org_id = v_org and om.roles @> '{primary_ops}';
  for r in select distinct x as pid from unnest(array_remove(array[v_me, v_primary], null)) x loop
    select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = r.pid;
    perform queue_mail('shop_order_confirmed', r.pid,
                       jsonb_build_object('org_name', v_org_name, 'order_no', v_o.order_no, 'phase', v_o.phase,
                                          'lines', case when v_locale = 'en' then v_lines_en else v_lines_de end,
                                          'total_net', fmt_cents(v_tot.net_cents::integer, v_locale),
                                          'ends_at', mail_fmt_ts((v_phase->>'ends_at')::timestamptz, coalesce(v_tz, 'Europe/Berlin'), v_locale)),
                       'shop_order', p_order_id);
  end loop;
  perform log_audit('shop.confirm', 'shop_order', p_order_id::text, jsonb_build_object('status', v_o.status), jsonb_build_object('order_no', v_o.order_no, 'net_cents', v_tot.net_cents));
  return jsonb_build_object('order_id', p_order_id, 'order_no', v_o.order_no, 'net_cents', v_tot.net_cents, 'vat_cents', v_tot.vat_cents, 'gross_cents', v_tot.gross_cents);
end $$;

select harden_definer_functions();
