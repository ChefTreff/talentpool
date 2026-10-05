create or replace function my_speaker_tickets(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_self boolean;
begin
  select sp.* into v_sp from speaker_profile sp where sp.id = my_speaker_profile_id(p_edition_id);
  if not found then return null; end if;
  v_self := (v_sp.person_id = v_me);
  return jsonb_build_object(
    'eligible', speaker_is_confirmed(v_sp.pipeline_status),
    'pipeline_status', v_sp.pipeline_status,
    'pass_type', v_sp.pass_type,
    'lounge_access', v_sp.lounge_access,
    'is_assistant', not v_self,
    'own', (select to_jsonb(x) from (
              select t.id, t.status, t.pass_type, t.lounge_access,
                     case when v_self then t.barcode end as barcode, (t.barcode is not null) as issued,
                     t.holder_first_name, t.holder_last_name, t.holder_company, t.holder_position, t.personalization_status,
                     t.checked_in_at, t.created_at, t.purchased_at as issued_at
              from ticket t where t.speaker_profile_id = v_sp.id and t.source = 'speaker' and t.status <> 'cancelled'
              order by t.created_at desc limit 1) x),
    -- Bis zur Umstellung der Oberfläche: das jüngste aktive Begleitticket wie bisher (ein alter App-Stand liest nur dieses).
    'companion', (select to_jsonb(x) from (
              select t.id, t.status, t.pass_type, t.holder_first_name as first_name, t.holder_last_name as last_name, t.holder_email::text as email,
                     t.team_note, t.created_at, t.approved_at, t.purchased_at as issued_at, (t.barcode is not null) as issued
              from ticket t where t.speaker_profile_id = v_sp.id and t.source = 'speaker_companion' and t.status <> 'cancelled'
              order by t.created_at desc limit 1) x),
    -- ADM-076: alle aktiven Begleitungen, die älteste zuerst, mit der Lounge-Berechtigung, und das Kontingent dazu.
    'companions', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at, x.id) from (
              select t.id, t.status, t.pass_type, t.holder_first_name as first_name, t.holder_last_name as last_name, t.holder_email::text as email,
                     t.team_note, t.created_at, t.approved_at, t.purchased_at as issued_at, (t.barcode is not null) as issued, t.lounge_access
              from ticket t where t.speaker_profile_id = v_sp.id and t.source = 'speaker_companion' and t.status <> 'cancelled') x), '[]'::jsonb),
    'companion_quota', v_sp.companion_quota,
    'companion_used', (select count(*)::integer from ticket t where t.speaker_profile_id = v_sp.id and t.source = 'speaker_companion' and t.status <> 'cancelled'),
    'companion_history', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'status', t.status, 'first_name', t.holder_first_name,
                                                                        'last_name', t.holder_last_name, 'team_note', t.team_note, 'created_at', t.created_at)
                                                     order by t.created_at desc), '[]'::jsonb)
                          from ticket t where t.speaker_profile_id = v_sp.id and t.source = 'speaker_companion' and t.status = 'cancelled')
  );
end $$;
