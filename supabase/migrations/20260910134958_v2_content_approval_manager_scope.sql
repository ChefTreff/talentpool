-- 0037 · Einreichungen (Session-Inhalte) dürfen auch die Speaker-Manager im Scope freigeben/ablehnen (Arbeitsauftrag Welle 2 D:
-- „Einreichung → Freigabe durch Lead"); bisher nur can_edit_session (Programm-Team / Slot-Scope). manager_speakers liefert internal_notes.
set search_path = public, extensions;

create or replace function approve_session_content(p_submission_id uuid, p_overrides jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_s session_submission%rowtype; v_lang text;
begin
  select * into v_s from session_submission where id = p_submission_id for update;
  if not found then raise exception 'submission_not_found' using errcode = 'P0002'; end if;
  if not (can_edit_session(v_s.session_id) or can_manage_speaker(v_s.speaker_profile_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_s.status <> 'submitted' then raise exception 'not_pending' using errcode = 'P0001', detail = v_s.status; end if;
  v_lang := coalesce(nullif(p_overrides->>'language', ''), v_s.language);
  update session set
    title_de       = coalesce(nullif(btrim(p_overrides->>'title_de'), ''),       case when v_lang = 'de' then v_s.title else title_de end),
    title_en       = coalesce(nullif(btrim(p_overrides->>'title_en'), ''),       case when v_lang = 'de' then title_en else v_s.title end),
    description_de = coalesce(nullif(btrim(p_overrides->>'description_de'), ''), case when v_lang = 'de' then coalesce(v_s.description, description_de) else description_de end),
    description_en = coalesce(nullif(btrim(p_overrides->>'description_en'), ''), case when v_lang = 'de' then description_en else coalesce(v_s.description, description_en) end),
    language       = coalesce(v_lang, language),
    updated_by     = current_person_id()
  where id = v_s.session_id;
  update session_submission
     set status = 'approved', reviewed_by = current_person_id(), reviewed_at = now(), review_note = nullif(btrim(p_overrides->>'review_note'), '')
   where id = p_submission_id;
  perform log_audit('session.content_approved', 'session', v_s.session_id::text, null, jsonb_build_object('submission_id', p_submission_id, 'overrides', p_overrides));
end $$;

create or replace function reject_session_content(p_submission_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_s session_submission%rowtype;
begin
  select * into v_s from session_submission where id = p_submission_id for update;
  if not found then raise exception 'submission_not_found' using errcode = 'P0002'; end if;
  if not (can_edit_session(v_s.session_id) or can_manage_speaker(v_s.speaker_profile_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_s.status <> 'submitted' then raise exception 'not_pending' using errcode = 'P0001', detail = v_s.status; end if;
  update session_submission set status = 'rejected', reviewed_by = current_person_id(), reviewed_at = now(), review_note = nullif(btrim(p_note), '')
   where id = p_submission_id;
  perform log_audit('session.content_rejected', 'session', v_s.session_id::text, null, jsonb_build_object('submission_id', p_submission_id, 'note', p_note));
end $$;

create or replace function pending_submissions(p_event_id uuid default null)
returns table (
  id uuid, session_id uuid, event_id uuid, session_title_de text, session_title_en text, session_description_de text, session_description_en text,
  session_language text, publish_status text, start_at timestamptz, stage_name text,
  speaker_profile_id uuid, speaker_name text, title text, description text, topics text[], language text, notes text, created_at timestamptz
)
language sql stable security definer set search_path = public, extensions as $$
  select s.id, se.id, se.event_id, se.title_de, se.title_en, se.description_de, se.description_en, se.language, se.publish_status,
         sl.start_at, st.name,
         s.speaker_profile_id, (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) from person p where p.id = s.submitted_by),
         s.title, s.description, s.topics, s.language, s.notes, s.created_at
  from session_submission s
  join session se on se.id = s.session_id
  left join slot sl on sl.id = se.slot_id
  left join stage st on st.id = sl.stage_id
  where s.status = 'submitted'
    and (p_event_id is null or se.event_id = p_event_id)
    and (can_edit_session(se.id) or can_manage_speaker(s.speaker_profile_id))
  order by s.created_at
$$;

-- manager_speakers: interne Notiz mitliefern (Rückgabetyp ändert sich ⇒ drop + create)
drop function if exists manager_speakers(uuid);
create function manager_speakers(p_edition_id uuid default null)
returns table (
  id uuid, person_id uuid, first_name text, last_name text, title text, email text,
  job_title text, organization_name text, speaker_type text, pipeline_status text,
  owner_person_id uuid, owner_name text, reception_eligible boolean, travel_costs_covered boolean, travel_costs_approved boolean,
  hospitality_status text, hotel_tier text, pass_type text, lounge_access boolean, invited_at timestamptz,
  assistant_name text, sessions jsonb, next_open jsonb, updated_at timestamptz, internal_notes text
)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not (has_role('speaker_manager') or has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select sp.id, sp.person_id, p.first_name, p.last_name, p.title,
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           sp.job_title, sp.organization_name, sp.speaker_type, sp.pipeline_status,
           sp.owner_person_id, (select btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')) from person o where o.id = sp.owner_person_id),
           sp.reception_eligible, sp.travel_costs_covered, (sp.travel_costs_approved_at is not null),
           sp.hospitality_status, sp.hotel_tier, sp.pass_type, sp.lounge_access, sp.invited_at,
           (select btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')) from person a where a.id = sp.assistant_person_id),
           coalesce((select jsonb_agg(jsonb_build_object('session_id', se.id, 'title_de', se.title_de, 'title_en', se.title_en,
                                                          'publish_status', se.publish_status, 'start_at', sl.start_at, 'stage_name', st.name)
                                       order by sl.start_at nulls last)
                     from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                     left join slot sl on sl.id = se.slot_id left join stage st on st.id = sl.stage_id
                     where ss.person_id = sp.person_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)), '[]'::jsonb),
           speaker_next_steps(sp.id)->'open',
           sp.updated_at,
           sp.internal_notes
    from speaker_profile sp
    join person p on p.id = sp.person_id
    left join vocab_term v on v.vocabulary = 'speaker_pipeline' and v.key = sp.pipeline_status
    where (p_edition_id is null or sp.edition_id = p_edition_id)
      and p.deleted_at is null
      and can_manage_speaker(sp.id)
    order by v.sort_order nulls last, p.last_name nulls last, p.first_name nulls last;
end $$;

select harden_definer_functions();
