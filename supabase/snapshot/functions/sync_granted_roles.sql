create or replace function sync_granted_roles(p_org_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; g record; v_n integer := 0; v_cnt integer; v_valid_to timestamptz;
begin
  for r in select oe.edition_id, oe.id as org_edition_id, e.end_date
           from org_edition oe join event e on e.id = oe.edition_id
           where oe.org_id = p_org_id and coalesce(e.end_date, current_date) >= current_date loop
    v_valid_to := case when r.end_date is not null then (r.end_date + 1)::timestamptz else null end;
    -- vergeben: je gebuchtem Produkt mit Rolle × Hauptkontakt (bestehende aktive Zuweisung, auch manuelle, bleibt)
    for g in select distinct pr.grants_role as role from org_product op join product pr on pr.sku = op.product_sku
             where op.org_edition_id = r.org_edition_id and op.status = 'booked' and pr.grants_role is not null loop
      insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_to, note)
      select om.person_id, g.role, 'org', p_org_id, r.edition_id, v_valid_to, 'auto:product'
      from org_membership om
      where om.org_id = p_org_id and om.roles @> '{primary_ops}'
        and not exists (select 1 from role_assignment ra where ra.person_id = om.person_id and ra.role = g.role and ra.scope_type = 'org' and ra.scope_id = p_org_id
                          and (ra.valid_to is null or ra.valid_to > now()));
      get diagnostics v_cnt = row_count; v_n := v_n + v_cnt;
    end loop;
    -- entziehen: automatisch vergebene Rollen, deren Produkt nicht mehr gebucht ist oder deren Person nicht mehr Hauptkontakt ist
    update role_assignment ra set valid_to = now()
     where ra.scope_type = 'org' and ra.scope_id = p_org_id and coalesce(ra.edition_id, r.edition_id) = r.edition_id
       and ra.note in ('auto:product', 'hubspot') and (ra.valid_to is null or ra.valid_to > now()) and ra.valid_from < now()
       and (not exists (select 1 from org_product op join product pr on pr.sku = op.product_sku
                         where op.org_edition_id = r.org_edition_id and op.status = 'booked' and pr.grants_role = ra.role)
            or not exists (select 1 from org_membership om where om.org_id = p_org_id and om.person_id = ra.person_id and om.roles @> '{primary_ops}'));
    get diagnostics v_cnt = row_count; v_n := v_n + v_cnt;
    delete from role_assignment ra
     where ra.scope_type = 'org' and ra.scope_id = p_org_id and coalesce(ra.edition_id, r.edition_id) = r.edition_id
       and ra.note in ('auto:product', 'hubspot') and ra.valid_from >= now()
       and (not exists (select 1 from org_product op join product pr on pr.sku = op.product_sku
                         where op.org_edition_id = r.org_edition_id and op.status = 'booked' and pr.grants_role = ra.role)
            or not exists (select 1 from org_membership om where om.org_id = p_org_id and om.person_id = ra.person_id and om.roles @> '{primary_ops}'));
    get diagnostics v_cnt = row_count; v_n := v_n + v_cnt;
  end loop;
  return v_n;
end $$;
