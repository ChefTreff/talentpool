create or replace function set_pass_type_choice(p_org_id uuid, p_choice text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; v_choice text; v_n integer;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_choice := nullif(btrim(coalesce(p_choice, '')), '');
  if v_choice is not null and v_choice not in ('talent', 'startup') then
    raise exception 'invalid_pass_type_choice' using errcode = '22023', detail = v_choice;
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;

  update org_edition set pass_type_choice = v_choice where id = v_oe.id;

  select count(*)::integer into v_n from org_ticket_allocation a
   where a.org_id = p_org_id and a.event_id = v_oe.edition_id;

  perform log_audit('partner.pass_type_choice', 'org_edition', v_oe.id::text,
                    jsonb_build_object('pass_type_choice', v_oe.pass_type_choice),
                    jsonb_build_object('pass_type_choice', v_choice));
  return jsonb_build_object('pass_type_choice', v_choice, 'allocations', v_n);
end $$;
