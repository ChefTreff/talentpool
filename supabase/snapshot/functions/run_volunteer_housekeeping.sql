create or replace function run_volunteer_housekeeping()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_reminders integer; v_promoted integer := 0; r record;
begin
  if not (auth.uid() is null or has_role('admin')) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_reminders := send_shift_reminders();
  for r in select s.id from shift s
            where s.active and s.end_at > now()
              and exists (select 1 from shift_assignment a where a.shift_id = s.id and a.status = 'waitlisted')
  loop
    v_promoted := v_promoted + promote_shift_waitlist(r.id);
  end loop;
  return jsonb_build_object('reminders', v_reminders, 'promoted', v_promoted);
end $$;
