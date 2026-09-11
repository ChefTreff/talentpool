-- 0067 · Volunteer-Rolle bei Absage sofort beenden (Fund im eigenen Smoke-Test, PR #21).
-- `set_volunteer_status` beendete die Rolle über `valid_to = greatest(now(), valid_from + 1 s)`. In derselben Transaktion ist
-- `now()` fest, also lag `valid_to` immer eine Sekunde in der Zukunft und die Rolle galt weiter — genau die Falle aus
-- `docs/db-konventionen.md` §4 („in derselben Transaktion beenden über delete, nicht valid_to = now()“).
-- Entzogen wird jetzt per `delete`, und zwar nur die Zuweisung, die die Zusage selbst angelegt hat (`note = 'auto:volunteer_accepted'`);
-- eine von Hand vergebene Volunteer-Rolle bleibt stehen. Der Nachweis liegt weiter im Audit-Log (`volunteer.set_status`).
-- Abweichungen: keine. Verhalten bei Zusage unverändert.
set search_path = public, extensions;

create or replace function set_volunteer_status(p_profile_id uuid, p_status text, p_note text default null) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_v volunteer_profile; v_me uuid := current_person_id(); v_end date; v_removed integer := 0;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('applied', 'accepted', 'declined', 'withdrawn') then raise exception 'invalid_status' using errcode = '22023', detail = p_status; end if;
  select * into v_v from volunteer_profile where id = p_profile_id for update;
  if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;

  update volunteer_profile set status = p_status, decided_at = now(), decided_by = v_me,
         decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_profile_id;

  select coalesce(e.end_date, current_date) into v_end from event e where e.id = v_v.edition_id;
  if p_status = 'accepted' then
    insert into role_assignment (person_id, role, scope_type, edition_id, valid_from, valid_to, granted_by, note)
    values (v_v.person_id, 'volunteer', 'edition', v_v.edition_id, now(), (v_end + 1)::timestamptz, v_me, 'auto:volunteer_accepted')
    on conflict (person_id, role, scope_type,
                 coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(portal, ''))
    do update set valid_from = now(), valid_to = (v_end + 1)::timestamptz, granted_by = v_me, note = 'auto:volunteer_accepted';
  elsif p_status in ('declined', 'withdrawn') then
    -- Löschen statt `valid_to`: in derselben Transaktion steht `now()` still,
    -- eine Endzeit „jetzt“ verletzt `role_assignment_valid_chk` oder wirkt erst
    -- eine Sekunde später. Nur die automatisch vergebene Zuweisung.
    delete from role_assignment
     where person_id = v_v.person_id and role = 'volunteer' and scope_type = 'edition'
       and edition_id = v_v.edition_id and note = 'auto:volunteer_accepted';
    get diagnostics v_removed = row_count;
  end if;

  if p_status in ('accepted', 'declined') then
    perform queue_mail(case when p_status = 'accepted' then 'volunteer_accepted' else 'volunteer_declined' end, v_v.person_id,
                       jsonb_build_object('edition', (select e.name from event e where e.id = v_v.edition_id),
                                          'note', coalesce(nullif(btrim(coalesce(p_note, '')), ''), '')),
                       'volunteer_profile', p_profile_id);
  end if;
  perform log_audit('volunteer.set_status', 'volunteer_profile', p_profile_id::text,
                    jsonb_build_object('status', v_v.status), jsonb_build_object('status', p_status, 'note', p_note, 'roles_removed', v_removed));
end $$;

select harden_definer_functions();
