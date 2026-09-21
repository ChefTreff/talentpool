create or replace function resolve_deletion_request(p_id uuid, p_action text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_r profile_deletion_request%rowtype; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_action not in ('delete', 'reject') then
    raise exception 'invalid_action' using errcode = '22023', detail = coalesce(p_action, 'null');
  end if;
  select * into v_r from profile_deletion_request where id = p_id and status = 'pending';
  if not found then raise exception 'request_not_found' using errcode = 'P0002', detail = p_id::text; end if;
  if p_action = 'reject' and v_note is null then
    raise exception 'note_required' using errcode = '22023';
  end if;

  if p_action = 'reject' then
    -- Erst die Antwort einreihen, dann schliessen: die Adresse lebt noch.
    perform queue_mail('deletion_rejected', v_r.person_id,
                       jsonb_build_object('note', v_note), 'deletion_request', v_r.id);
  end if;

  update profile_deletion_request
     set status = case when p_action = 'delete' then 'done' else 'rejected' end,
         handled_by = current_person_id(), handled_at = now(), handled_note = v_note
   where id = p_id;

  if p_action = 'delete' then perform anonymize_person(v_r.person_id); end if;

  perform log_audit('profile.delete_resolved', 'person', v_r.person_id::text,
                    jsonb_build_object('request_id', v_r.id, 'blockers', to_jsonb(v_r.blockers)),
                    jsonb_build_object('action', p_action, 'note', v_note));
end $$;
