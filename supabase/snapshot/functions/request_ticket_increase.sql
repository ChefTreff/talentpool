create or replace function request_ticket_increase(p_org_id uuid, p_pass_type text, p_additional integer, p_text text DEFAULT NULL::text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_sku text; v_id uuid; v_org_name text; v_label text;
        v_label_de text; v_label_en text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(p_additional, 0) <= 0 then raise exception 'quantity_required' using errcode = '22023'; end if;
  if p_pass_type not in ('partner', 'talent', 'startup', 'investor') then raise exception 'invalid_pass_type' using errcode = '22023'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  select pr.sku into v_sku from product pr where pr.pass_type = case when p_pass_type = 'startup' then 'talent' else p_pass_type end and pr.active order by pr.sku limit 1;
  v_label := format('Tickets %s (+%s)', p_pass_type, p_additional);
  -- Die Bezeichnung aus dem Vokabular, damit in der Mail „Partner Pass" steht und nicht der
  -- interne Schlüssel „partner". Fehlt der Eintrag, bleibt der Schlüssel stehen.
  select coalesce(t.label_de, p_pass_type), coalesce(t.label_en, p_pass_type) into v_label_de, v_label_en
    from vocab_term t where t.vocabulary = 'ticket_type' and t.key = p_pass_type;
  insert into shop_request (org_edition_id, product_sku, text, created_by, pass_type, quantity)
  values (v_oe.id, v_sku, format('%s zusätzliche Tickets (%s).%s', p_additional, p_pass_type, case when nullif(btrim(coalesce(p_text, '')), '') is null then '' else ' ' || btrim(p_text) end), v_me,
          p_pass_type, p_additional)
  returning id into v_id;
  select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = p_org_id;
  perform notify_partner_leads('ticket_request_received',
    jsonb_build_object('org_name', v_org_name, 'product', v_label, 'quantity', p_additional,
                       'pass_type_de', coalesce(v_label_de, p_pass_type), 'pass_type_en', coalesce(v_label_en, p_pass_type),
                       'text', coalesce(nullif(btrim(coalesce(p_text, '')), ''), '–')),
    'shop_request', v_id);
  perform log_audit('ticket.request_increase', 'shop_request', v_id::text, null, jsonb_build_object('org_id', p_org_id, 'pass_type', p_pass_type, 'additional', p_additional));
  return v_id;
end $$;
