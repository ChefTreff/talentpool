-- =============================================================================
-- 0027 · can_manage_speaker: Owner/Ersteller nur mit aktiver Rolle speaker_manager
--   Befund Test v2_speaker.sql, Schritt 12: Wer einen Speaker angelegt hatte, behielt nach
--   Entzug der Manager-Rolle Schreibrechte. Jetzt gilt: Team immer; alles andere nur mit
--   aktiver Rolle speaker_manager (Owner/Ersteller, Edition-Scope, Bühne/Bühne×Tag/Slot).
-- =============================================================================
set search_path = public, extensions;

create or replace function can_manage_speaker(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from speaker_profile sp
    where sp.id = p_profile_id
      and (
        is_speaker_team(sp.edition_id)
        or (has_role('speaker_manager') and (
              sp.owner_person_id = current_person_id()
              or sp.created_by = current_person_id()
              or has_role('speaker_manager', 'edition', null, sp.edition_id)
              or exists (
                select 1
                from session_speaker ss
                join session se on se.id = ss.session_id
                join slot sl on sl.id = se.slot_id
                left join stage_day sd on sd.stage_id = sl.stage_id and sd.event_day_id = sl.event_day_id
                where ss.person_id = sp.person_id
                  and (has_role('speaker_manager', 'stage', sl.stage_id)
                       or has_role('speaker_manager', 'slot', sl.id)
                       or (sd.id is not null and has_role('speaker_manager', 'stage_day', sd.id)))
              )))
      )
  )
$$;

select harden_definer_functions();
