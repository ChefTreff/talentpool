create or replace function partner_mail_cc(p_mail_id bigint, p_org_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_empf uuid; v_ids jsonb; v_n integer;
begin
  if p_mail_id is null or p_org_id is null then return 0; end if;
  -- Nur an eine wartende Mail: eine unterdrückte oder schon verschickte bekommt nichts angehängt.
  select person_id into v_empf from mail_log where id = p_mail_id and status = 'queued';
  if not found then return 0; end if;
  select coalesce(jsonb_agg(x.person_id order by x.person_id), '[]'::jsonb), count(*)::integer into v_ids, v_n
    from (select distinct om.person_id
            from org_membership om
            join person p on p.id = om.person_id and p.deleted_at is null
            join person_email pe on pe.person_id = p.id and pe.is_primary
           where om.org_id = p_org_id
             and om.roles @> '{cc}'
             and not (om.roles && '{primary_ops,additional}'::text[])
             and om.person_id is distinct from v_empf
             and not is_suppressed(pe.email::text)) x;
  if v_n = 0 then return 0; end if;
  update mail_log set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('cc_person_ids', v_ids), updated_at = now()
   where id = p_mail_id;
  return v_n;
end $$;
