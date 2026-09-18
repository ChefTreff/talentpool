create or replace function set_ticket_issued(p_ticket_id uuid, p_vivenu_ticket_id text, p_barcode text, p_vivenu_transaction_id text DEFAULT NULL::text, p_ticket_type_map_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype;
begin
  select * into v_t from ticket where id = p_ticket_id for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  if auth.uid() is not null and not is_speaker_team(v_sp.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_t.source not in ('speaker', 'speaker_companion') then raise exception 'not_a_free_ticket' using errcode = 'P0001', detail = v_t.source; end if;
  if v_t.source = 'speaker' and v_t.status <> 'requested' then raise exception 'not_pending' using errcode = 'P0001', detail = v_t.status; end if;
  if v_t.source = 'speaker_companion' and v_t.status <> 'approved' then raise exception 'not_approved' using errcode = 'P0001', detail = v_t.status; end if;
  if nullif(btrim(coalesce(p_barcode, '')), '') is null or nullif(btrim(coalesce(p_vivenu_ticket_id, '')), '') is null then
    raise exception 'barcode_required' using errcode = '22023';
  end if;
  update ticket set status = 'valid', barcode = btrim(p_barcode), vivenu_ticket_id = btrim(p_vivenu_ticket_id),
                    vivenu_transaction_id = coalesce(nullif(btrim(p_vivenu_transaction_id), ''), vivenu_transaction_id),
                    ticket_type_map_id = coalesce(p_ticket_type_map_id, ticket_type_map_id), purchased_at = now()
   where id = p_ticket_id;
  perform log_audit('ticket.issued', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                    jsonb_build_object('status', 'valid', 'source', v_t.source, 'vivenu_ticket_id', btrim(p_vivenu_ticket_id)));
end $$;
