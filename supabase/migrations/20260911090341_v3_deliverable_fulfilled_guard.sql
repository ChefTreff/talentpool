-- 0054 · Nachtrag zu 0053: Buchungs-Pflichten mit fulfilled_by_sku kann nur das Team manuell einreichen (P0001 fulfilled_by_order, detail = SKU) —
-- der Partner erledigt sie über die Bestellung im Messeshop. Automatisch erledigte Pflichten stehen auf accepted (die Bestellung ist der Beleg,
-- keine Team-Prüfung nötig) und werden beim Storno der letzten passenden Bestellung wieder geöffnet.
set search_path = public, extensions;

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
  if v_t.fulfilled_by_sku is not null and not is_partner_team() then
    raise exception 'fulfilled_by_order' using errcode = 'P0001', detail = v_t.fulfilled_by_sku;
  end if;
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
        update deliverable set status = 'accepted', submitted_at = now(), submitted_by = null, reviewed_at = now(), reviewed_by = null, review_note = null,
                               answers = jsonb_build_object('auto', true, 'order_id', v_order.id, 'order_no', v_order.order_no)
         where id = r.id;
        v_n := v_n + 1;
      end if;
    elsif r.status in ('submitted', 'accepted') and coalesce((r.answers->>'auto')::boolean, false) then
      update deliverable set status = 'open', submitted_at = null, submitted_by = null, reviewed_at = null, reviewed_by = null, answers = '{}'::jsonb where id = r.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function shop_sync_fulfilled_deliverables(uuid) from public, anon, authenticated;

select harden_definer_functions();
