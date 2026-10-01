create or replace function open_deletion_request(p_person_id uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_b text[]; v_id uuid; v_deleted timestamptz; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;

  select p.deleted_at into v_deleted from person p where p.id = p_person_id;
  if not found then
    raise exception 'person_not_found' using errcode = 'P0002', detail = coalesce(p_person_id::text, 'null');
  end if;
  if v_deleted is not null then
    raise exception 'person_already_deleted' using errcode = 'P0001', detail = v_deleted::text;
  end if;
  if exists (select 1 from profile_deletion_request r where r.person_id = p_person_id and r.status = 'pending') then
    raise exception 'deletion_already_open' using errcode = 'P0001';
  end if;

  v_b := deletion_blockers(p_person_id);

  -- Immer `pending`: auch ohne Hürde bestätigt das Team die Löschung in der
  -- Warteschlange noch einmal ausdrücklich. Keine Mail an die Person — die
  -- Bitte kam über einen anderen Weg, und die Antwort geht denselben Weg.
  insert into profile_deletion_request (person_id, reason, blockers, status, opened_by)
  values (p_person_id, v_note, v_b, 'pending', current_person_id())
  returning id into v_id;

  perform log_audit('profile.delete_opened', 'person', p_person_id::text, null,
                    jsonb_build_object('request_id', v_id, 'blockers', to_jsonb(v_b)));
  return v_id;
end $$;
