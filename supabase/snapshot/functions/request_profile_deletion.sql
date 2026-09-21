create or replace function request_profile_deletion(p_reason text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_b text[]; v_id uuid; v_admin uuid; v_name text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from profile_deletion_request r where r.person_id = v_me and r.status = 'pending') then
    raise exception 'already_requested' using errcode = 'P0001';
  end if;
  v_b := my_deletion_blockers();

  insert into profile_deletion_request (person_id, reason, blockers, status)
  values (v_me, nullif(btrim(coalesce(p_reason, '')), ''), v_b,
          case when cardinality(v_b) = 0 then 'done' else 'pending' end)
  returning id into v_id;

  if cardinality(v_b) = 0 then
    -- Selbst gelöscht: der Vorgang gilt als erledigt, erledigt hat ihn die
    -- Person selbst.
    update profile_deletion_request set handled_by = v_me, handled_at = now() where id = v_id;
    perform anonymize_person(v_me);
    return 'done';
  end if;

  -- Antrag: die Person bekommt eine Bestätigung, das Team eine Nachricht.
  select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
    into v_name from person p where p.id = v_me;
  perform queue_mail('deletion_requested', v_me, '{}'::jsonb, 'deletion_request', v_id);
  for v_admin in
    select distinct ra.person_id from role_assignment ra
     where ra.role = 'admin' and ra.valid_from <= now()
       and (ra.valid_to is null or ra.valid_to > now())
  loop
    -- **Ohne Bezug.** `queue_mail` unterdrückt einen zweiten Auftrag zur
    -- gleichen Vorlage und demselben Objekt — mit `v_id` als Bezug bekäme nur
    -- die erste Admin-Person die Nachricht, und niemand merkte es.
    perform queue_mail('deletion_request_team', v_admin,
                       jsonb_build_object('person_name', coalesce(v_name, '—'),
                                          'blockers', array_to_string(v_b, ', ')));
  end loop;

  perform log_audit('profile.delete_requested', 'person', v_me::text, null,
                    jsonb_build_object('request_id', v_id, 'blockers', to_jsonb(v_b)));
  return 'pending';
end $$;
