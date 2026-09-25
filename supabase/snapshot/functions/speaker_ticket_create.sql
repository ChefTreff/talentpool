create or replace function speaker_ticket_create(p_profile_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_p person%rowtype; v_email citext; v_id uuid; v_company text; v_complete boolean;
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  -- PART-081: Gäste kommen mit einem Ticket aus dem Partner-Kontingent, nicht mit einem Freiticket.
  if v_sp.stage_guest then raise exception 'not_eligible' using errcode = 'P0001', detail = 'stage_guest'; end if;
  if not speaker_is_confirmed(v_sp.pipeline_status) then raise exception 'not_eligible' using errcode = 'P0001', detail = v_sp.pipeline_status; end if;
  select t.id into v_id from ticket t where t.speaker_profile_id = p_profile_id and t.source = 'speaker' and t.status <> 'cancelled';
  if found then return v_id; end if;
  select * into v_p from person where id = v_sp.person_id;
  select pe.email into v_email from person_email pe where pe.person_id = v_sp.person_id and pe.is_primary limit 1;
  v_company := coalesce(nullif(btrim(v_sp.organization_name), ''),
                        (select coalesce(o.communication_name, o.legal_name) from organization o where o.id = v_sp.org_id));
  v_complete := coalesce(nullif(btrim(v_p.first_name), ''), '') <> '' and coalesce(nullif(btrim(v_p.last_name), ''), '') <> ''
                and coalesce(v_company, '') <> '' and coalesce(nullif(btrim(v_sp.job_title), ''), '') <> '';
  insert into ticket (event_id, person_id, speaker_profile_id, pass_type, lounge_access, holder_email, holder_first_name, holder_last_name,
                      holder_company, holder_position, status, personalization_status, price_cents, source, requested_by)
  values (v_sp.edition_id, v_sp.person_id, p_profile_id, v_sp.pass_type, v_sp.lounge_access, v_email, v_p.first_name, v_p.last_name,
          v_company, v_sp.job_title, 'requested', case when v_complete then 'complete' else 'partial' end, 0, 'speaker', current_person_id())
  returning id into v_id;
  perform log_audit('ticket.speaker_requested', 'ticket', v_id::text, null,
                    jsonb_build_object('profile_id', p_profile_id, 'pass_type', v_sp.pass_type, 'lounge_access', v_sp.lounge_access));
  return v_id;
end $$;
