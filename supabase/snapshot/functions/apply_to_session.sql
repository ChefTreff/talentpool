create or replace function apply_to_session(p_session_id uuid, p_answers jsonb DEFAULT '{}'::jsonb, p_consent_share boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_pid  uuid := current_person_id();
  v_s    session%rowtype;
  v_p    person%rowtype;
  v_rule jsonb;
  v_id   uuid;
begin
  if v_pid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_s from session where id = p_session_id;
  if not found or v_s.publish_status <> 'published' then
    raise exception 'session_not_open' using errcode = 'P0002';
  end if;
  if v_s.access_mode <> 'application' then
    raise exception 'session_not_application' using errcode = '22023';
  end if;
  if v_s.application_deadline is not null and v_s.application_deadline < now() then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;
  select * into v_p from person where id = v_pid;
  v_rule := coalesce(v_s.eligibility_rule, '{}'::jsonb);
  if coalesce((v_rule->>'u35')::boolean, false) and coalesce(is_u35(v_p.birthdate), false) is not true then
    raise exception 'not_eligible' using errcode = 'P0001', detail = 'u35';
  end if;
  if v_rule ? 'occupation_status'
     and not (v_rule->'occupation_status') ? coalesce(v_p.occupation_status, '') then
    raise exception 'not_eligible' using errcode = 'P0001', detail = 'occupation_status';
  end if;
  if exists (
    select 1 from session_question sq
    where sq.session_id = p_session_id and sq.required
      and not (p_answers ? coalesce(sq.question_id::text, sq.id::text))
  ) then
    raise exception 'missing_required_answers' using errcode = 'P0001';
  end if;
  insert into application (session_id, person_id, answers, consent_share)
    values (p_session_id, v_pid, coalesce(p_answers, '{}'::jsonb), p_consent_share)
  on conflict (session_id, person_id) do update
    set status = 'applied', answers = excluded.answers, consent_share = excluded.consent_share,
        decided_by = null, decided_at = null, confirm_by = null, confirmed_at = null, rank = null
    where application.status in ('withdrawn','expired')
  returning id into v_id;
  if v_id is null then
    raise exception 'already_applied' using errcode = '23505';
  end if;
  return v_id;
end $$;
