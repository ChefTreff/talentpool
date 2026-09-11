-- 0053 · Nachträge aus dem B4-Review (PR #15): my_partner_assets (alle Fassungen je Org über RPC statt Direktzugriff auf partner_asset),
-- answers_schema für Formular-Pflichten (Feldliste; submit_deliverable prüft Pflichtfelder), fulfilled_by_sku: Buchungs-Pflichten wie das
-- Lunch-Paket gelten als eingereicht, sobald eine bestätigte Shop-Bestellung das Produkt enthält (Storno macht es rückgängig; Trigger).
set search_path = public, extensions;

alter table deliverable_template add column if not exists answers_schema jsonb;
alter table deliverable_template add column if not exists fulfilled_by_sku text references product (sku);
comment on column deliverable_template.answers_schema is 'Formular-Pflichten: [{key, label_de, label_en, type text|textarea|select|number|boolean|date, required, options[]}]; submit_deliverable prüft required.';
comment on column deliverable_template.fulfilled_by_sku is 'Buchungs-Pflicht gilt als eingereicht, sobald eine bestätigte Shop-Bestellung dieses Produkt enthält; Storno setzt sie zurück.';
update deliverable_template set fulfilled_by_sku = 'I-79520' where key = 'lunch_package' and fulfilled_by_sku is null;

-- 1) Alle Fassungen einer Org (Dateien-Hub)
create or replace function my_partner_assets(p_org_id uuid, p_edition_id uuid default null)
returns table (id uuid, deliverable_id uuid, deliverable_key text, label_de text, label_en text, kind text, storage_path text, filename text, mime text,
               size_bytes bigint, version integer, is_current boolean, status text, review_note text, reviewed_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select a.id, a.deliverable_id, d.key, t.label_de, t.label_en, a.kind, a.storage_path, a.filename, a.mime, a.size_bytes, a.version, a.is_current,
           a.status, a.review_note, a.reviewed_at, a.created_at
    from partner_asset a
    left join deliverable d on d.id = a.deliverable_id
    left join deliverable_template t on t.id = d.template_id
    where a.org_edition_id = v_oe.id
    order by a.created_at desc;
end $$;

-- 2) my_deliverables liefert answers_schema und fulfilled_by_sku (Rückgabetyp ändert sich ⇒ drop + create)
drop function if exists my_deliverables(uuid, uuid);
create function my_deliverables(p_org_id uuid, p_edition_id uuid default null)
returns table (id uuid, key text, type text, label_de text, label_en text, description_de text, description_en text, product_sku text,
               product_name_de text, product_name_en text, status text, due_at timestamptz, submitted_at timestamptz, review_note text,
               required boolean, file_rules jsonb, answers jsonb, assets jsonb, sort integer, answers_schema jsonb, fulfilled_by_sku text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select d.id, d.key, t.type, t.label_de, t.label_en, t.description_de, t.description_en, d.product_sku, pr.name_de, pr.name_en,
           d.status, d.due_at, d.submitted_at, d.review_note, t.required, t.file_rules, d.answers,
           coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'filename', a.filename, 'mime', a.mime, 'size_bytes', a.size_bytes, 'status', a.status,
                                                          'version', a.version, 'storage_path', a.storage_path, 'created_at', a.created_at) order by a.created_at desc)
                     from partner_asset a where a.deliverable_id = d.id and a.is_current), '[]'::jsonb),
           t.sort, t.answers_schema, t.fulfilled_by_sku
    from deliverable d
    join deliverable_template t on t.id = d.template_id
    left join product pr on pr.sku = d.product_sku
    where d.org_edition_id = v_oe.id and d.status <> 'not_required'
    order by t.sort, d.due_at nulls last, t.label_de;
end $$;

-- 3) submit_deliverable prüft Pflichtfelder des Formulars
create or replace function submit_deliverable(p_deliverable_id uuid, p_asset_ids uuid[] default '{}'::uuid[], p_answers jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_d deliverable; v_oe org_edition; v_t deliverable_template; v_org_name text; v_primary uuid; v_locale text; r record; f jsonb;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_d from deliverable where id = p_deliverable_id for update;
  if not found then raise exception 'deliverable_not_found' using errcode = 'P0002'; end if;
  select * into v_oe from org_edition where id = v_d.org_edition_id;
  if not partner_can_edit(v_oe.org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_d.status not in ('open', 'rejected', 'overdue') then raise exception 'not_editable' using errcode = 'P0001', detail = v_d.status; end if;
  select * into v_t from deliverable_template where id = v_d.template_id;
  if v_t.type = 'upload' then
    if p_asset_ids is null or cardinality(p_asset_ids) = 0 then raise exception 'asset_required' using errcode = '22023'; end if;
    if exists (select 1 from unnest(p_asset_ids) x where not exists (select 1 from partner_asset a where a.id = x and a.org_edition_id = v_oe.id)) then
      raise exception 'asset_not_found' using errcode = 'P0002';
    end if;
    update partner_asset set deliverable_id = p_deliverable_id where id = any(p_asset_ids) and deliverable_id is null;
  elsif v_t.type = 'form' then
    if p_answers is null or p_answers = '{}'::jsonb then raise exception 'answers_required' using errcode = '22023'; end if;
    if v_t.answers_schema is not null and jsonb_typeof(v_t.answers_schema) = 'array' then
      for f in select * from jsonb_array_elements(v_t.answers_schema) loop
        if coalesce((f->>'required')::boolean, false) and nullif(btrim(coalesce(p_answers->>(f->>'key'), '')), '') is null then
          raise exception 'answers_incomplete' using errcode = 'P0001', detail = f->>'key';
        end if;
      end loop;
    end if;
  end if;
  update deliverable set status = 'submitted', submitted_at = now(), submitted_by = v_me, asset_ids = coalesce(p_asset_ids, '{}'),
                         answers = coalesce(p_answers, '{}'::jsonb), review_note = null
   where id = p_deliverable_id;
  select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = v_oe.org_id;
  select om.person_id into v_primary from org_membership om where om.org_id = v_oe.org_id and om.roles @> '{primary_ops}';
  for r in select distinct x as pid from unnest(array_remove(array[v_me, v_primary], null)) x loop
    select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = r.pid;
    perform queue_mail('partner_deliverable_received', r.pid,
                       jsonb_build_object('org_name', v_org_name, 'deliverable', case when v_locale = 'en' then v_t.label_en else v_t.label_de end),
                       'deliverable', p_deliverable_id);
  end loop;
  perform log_audit('partner.deliverable_submit', 'organization', v_oe.org_id::text, null, jsonb_build_object('deliverable_id', p_deliverable_id, 'key', v_d.key, 'assets', cardinality(coalesce(p_asset_ids, '{}'))));
end $$;

-- 4) Vorlagenpflege kennt die neuen Felder
create or replace function upsert_deliverable_template(p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_data ? 'fulfilled_by_sku' and nullif(p_data->>'fulfilled_by_sku', '') is not null and not exists (select 1 from product where sku = p_data->>'fulfilled_by_sku') then
    raise exception 'unknown_sku' using errcode = '22023', detail = p_data->>'fulfilled_by_sku';
  end if;
  if v_id is null then
    if nullif(p_data->>'key', '') is null or nullif(p_data->>'type', '') is null or nullif(p_data->>'label_de', '') is null or nullif(p_data->>'label_en', '') is null then
      raise exception 'fields_required' using errcode = '22023';
    end if;
    insert into deliverable_template (key, product_sku, category, type, label_de, label_en, description_de, description_en, due_rule, file_rules, required, audience_roles, sort, active, answers_schema, fulfilled_by_sku)
    values (p_data->>'key', nullif(p_data->>'product_sku', ''), nullif(p_data->>'category', ''), p_data->>'type', p_data->>'label_de', p_data->>'label_en',
            nullif(p_data->>'description_de', ''), nullif(p_data->>'description_en', ''), coalesce(p_data->'due_rule', '{}'::jsonb), p_data->'file_rules',
            coalesce((p_data->>'required')::boolean, true), coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'audience_roles') x), '{primary_ops,additional}'),
            coalesce((p_data->>'sort')::integer, 100), coalesce((p_data->>'active')::boolean, true), p_data->'answers_schema', nullif(p_data->>'fulfilled_by_sku', ''))
    returning id into v_id;
  else
    update deliverable_template set
      label_de = coalesce(nullif(p_data->>'label_de', ''), label_de), label_en = coalesce(nullif(p_data->>'label_en', ''), label_en),
      description_de = case when p_data ? 'description_de' then nullif(p_data->>'description_de', '') else description_de end,
      description_en = case when p_data ? 'description_en' then nullif(p_data->>'description_en', '') else description_en end,
      due_rule = case when p_data ? 'due_rule' then p_data->'due_rule' else due_rule end,
      file_rules = case when p_data ? 'file_rules' then p_data->'file_rules' else file_rules end,
      required = case when p_data ? 'required' then (p_data->>'required')::boolean else required end,
      sort = case when p_data ? 'sort' then (p_data->>'sort')::integer else sort end,
      active = case when p_data ? 'active' then (p_data->>'active')::boolean else active end,
      answers_schema = case when p_data ? 'answers_schema' then p_data->'answers_schema' else answers_schema end,
      fulfilled_by_sku = case when p_data ? 'fulfilled_by_sku' then nullif(p_data->>'fulfilled_by_sku', '') else fulfilled_by_sku end
    where id = v_id;
    if not found then raise exception 'template_not_found' using errcode = 'P0002'; end if;
  end if;
  perform log_audit('partner.template', 'deliverable_template', v_id::text, null, p_data);
  return v_id;
end $$;

-- 5) Buchungs-Pflichten folgen den Shop-Bestellungen (bestätigt/verbindlich ⇒ eingereicht; keine passende Bestellung mehr ⇒ wieder offen, nur bei automatischer Einreichung)
create or replace function shop_sync_fulfilled_deliverables(p_org_edition_id uuid) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare r record; v_order record; v_n integer := 0;
begin
  for r in
    select d.id, d.status, d.answers, t.fulfilled_by_sku
    from deliverable d join deliverable_template t on t.id = d.template_id
    where d.org_edition_id = p_org_edition_id and t.fulfilled_by_sku is not null
  loop
    select o.id, o.order_no into v_order
    from shop_order o join shop_order_line sl on sl.order_id = o.id
    where o.org_edition_id = p_org_edition_id and o.status in ('pending', 'editing', 'completed') and sl.product_sku = r.fulfilled_by_sku
    order by o.confirmed_at desc nulls last limit 1;
    if found then
      if r.status in ('open', 'overdue', 'rejected') then
        update deliverable set status = 'submitted', submitted_at = now(), submitted_by = null, review_note = null,
                               answers = jsonb_build_object('auto', true, 'order_id', v_order.id, 'order_no', v_order.order_no)
         where id = r.id;
        v_n := v_n + 1;
      end if;
    elsif r.status = 'submitted' and coalesce((r.answers->>'auto')::boolean, false) then
      update deliverable set status = 'open', submitted_at = null, submitted_by = null, answers = '{}'::jsonb where id = r.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function shop_sync_fulfilled_deliverables(uuid) from public, anon, authenticated;

create or replace function trg_shop_order_fulfil() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform shop_sync_fulfilled_deliverables(coalesce(new.org_edition_id, old.org_edition_id));
  return coalesce(new, old);
end $$;
revoke execute on function trg_shop_order_fulfil() from public, anon, authenticated;
drop trigger if exists trg_shop_order_fulfil on shop_order;
create trigger trg_shop_order_fulfil after insert or update of status or delete on shop_order for each row execute function trg_shop_order_fulfil();

create or replace function trg_shop_order_line_fulfil() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare v_oe uuid;
begin
  select o.org_edition_id into v_oe from shop_order o where o.id = coalesce(new.order_id, old.order_id);
  if v_oe is not null then perform shop_sync_fulfilled_deliverables(v_oe); end if;
  return coalesce(new, old);
end $$;
revoke execute on function trg_shop_order_line_fulfil() from public, anon, authenticated;
drop trigger if exists trg_shop_order_line_fulfil on shop_order_line;
create trigger trg_shop_order_line_fulfil after insert or update or delete on shop_order_line for each row execute function trg_shop_order_line_fulfil();

select harden_definer_functions();
