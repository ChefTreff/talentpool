create or replace function set_org_customer_number(p_org_id uuid, p_customer_number text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alt text; v_neu text := nullif(btrim(coalesce(p_customer_number, '')), '');
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_neu is not null and length(v_neu) > 40 then raise exception 'too_long' using errcode = '22023', detail = '40'; end if;
  select customer_number into v_alt from organization where id = p_org_id for update;
  if not found then raise exception 'org_not_found' using errcode = 'P0002'; end if;
  if v_alt is not distinct from v_neu then return; end if;
  -- Eindeutig über alle Organisationen (Teilindex): ein eigener Schlüssel statt „gibt es schon",
  -- damit das Team weiss, dass die Nummer schon an einer anderen Firma hängt.
  begin
    update organization set customer_number = v_neu where id = p_org_id;
  exception when unique_violation then
    raise exception 'customer_number_taken' using errcode = 'P0001';
  end;
  perform log_audit('partner.customer_number', 'organization', p_org_id::text,
                    jsonb_build_object('customer_number', v_alt), jsonb_build_object('customer_number', v_neu));
end $$;
