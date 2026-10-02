create or replace function set_booth_review(p_org_edition_id uuid, p_item_key text, p_status text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_oe org_edition%rowtype;
  v_vorher booth_review%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_hash text;
begin
  if not has_admin_section('productionBooths') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('ok', 'problem', 'open') then
    raise exception 'invalid_status' using errcode = '22023', detail = coalesce(p_status, 'null');
  end if;
  if not is_vocab_key('booth_review_item', p_item_key) then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'booth_review_item';
  end if;
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'text_too_long' using errcode = '22023', detail = 'note';
  end if;
  select * into v_vorher from booth_review r where r.org_edition_id = p_org_edition_id and r.item_key = p_item_key;

  if p_status = 'open' then
    delete from booth_review where org_edition_id = p_org_edition_id and item_key = p_item_key;
    -- Nichts zurückzunehmen: auch nichts zu protokollieren.
    if v_vorher.id is null then return; end if;
  else
    if p_status = 'problem' and v_note is null then
      raise exception 'note_required' using errcode = '22023';
    end if;
    select h.basis_hash into v_hash from booth_basis_hash(v_oe.edition_id, v_oe.org_id) h
     where h.org_edition_id = p_org_edition_id;
    insert into booth_review (org_edition_id, item_key, status, note, basis_hash, checked_by, checked_at)
    values (p_org_edition_id, p_item_key, p_status, v_note, coalesce(v_hash, md5('')), current_person_id(), now())
    on conflict (org_edition_id, item_key)
      do update set status = excluded.status, note = excluded.note, basis_hash = excluded.basis_hash,
                    checked_by = excluded.checked_by, checked_at = excluded.checked_at;
  end if;

  perform log_audit('booth.review', 'org_edition', p_org_edition_id::text,
                    case when v_vorher.id is null then null
                         else jsonb_build_object('item', p_item_key, 'status', v_vorher.status, 'note', v_vorher.note) end,
                    jsonb_build_object('item', p_item_key, 'status', p_status, 'note', v_note));
end $$;
