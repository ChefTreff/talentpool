create or replace function speaker_profile_tickets_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  -- PART-081: für Gäste kein Freiticket — die Anlage steht schon auf „zugesagt“.
  if not new.stage_guest and speaker_is_confirmed(new.pipeline_status) and (tg_op = 'INSERT' or not speaker_is_confirmed(old.pipeline_status)) then
    perform speaker_ticket_create(new.id);
  elsif tg_op = 'UPDATE' and speaker_is_confirmed(old.pipeline_status) and not speaker_is_confirmed(new.pipeline_status) then
    -- Absage/Rückstufung: noch nicht ausgestellte Freitickets zurückziehen; ausgestellte (valid) storniert das Team über vivenu
    update ticket set status = 'cancelled', team_note = coalesce(team_note, 'speaker_pipeline:' || new.pipeline_status)
     where speaker_profile_id = new.id and status in ('requested', 'approved');
    get diagnostics v_n = row_count;
    if v_n > 0 then
      perform log_audit('ticket.withdrawn', 'speaker_profile', new.id::text, jsonb_build_object('pipeline_status', old.pipeline_status),
                        jsonb_build_object('pipeline_status', new.pipeline_status, 'tickets', v_n));
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.pass_type is distinct from old.pass_type or new.lounge_access is distinct from old.lounge_access) then
    update ticket set pass_type = new.pass_type, lounge_access = new.lounge_access
     where speaker_profile_id = new.id and source = 'speaker' and status in ('requested', 'approved');
    update ticket set pass_type = new.pass_type
     where speaker_profile_id = new.id and source = 'speaker_companion' and status in ('requested', 'approved');
  end if;
  return new;
end $$;
