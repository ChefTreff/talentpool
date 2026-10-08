create or replace function session_change_notify(p_session_id uuid, p_old jsonb, p_new jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_s session%rowtype; v_tz text; v_event text; v_ed uuid; v_primary uuid; r record; v_n integer;
  v_speakers uuid[] := '{}'; v_partners uuid[] := '{}';
begin
  -- Nur, wenn eine Person handelt: Skripte, Migrationen und die Service-Rolle schicken keine Mail.
  if current_person_id() is null then return; end if;
  select * into v_s from session where id = p_session_id;
  if not found or v_s.publish_status is distinct from 'published' then return; end if;
  -- Das Profil hängt an der Edition (`speaker_profile.edition_id`), die Session am Event des Summits, der auf die Edition verweist.
  select coalesce(e.timezone, 'Europe/Berlin'), coalesce(e.name, ''), coalesce(e.edition_id, e.id) into v_tz, v_event, v_ed from event e where e.id = v_s.event_id;
  v_tz := coalesce(v_tz, 'Europe/Berlin');
  v_event := coalesce(v_event, '');

  -- Speaker, Moderation, Host und Panel: mit Profil über die Weiche (Kontakt statt Speaker, wenn eingerichtet), ohne Profil direkt.
  for r in
    select distinct on (z.empfaenger) z.empfaenger, z.profile_id
      from (select case when prof.id is not null then speaker_mail_recipient(prof.id) else ss.person_id end as empfaenger, prof.id as profile_id
              from session_speaker ss
              left join speaker_profile prof on prof.person_id = ss.person_id and prof.edition_id = v_ed
             where ss.session_id = p_session_id) z
     where z.empfaenger is not null
     order by z.empfaenger, z.profile_id nulls last
  loop
    v_speakers := v_speakers || r.empfaenger;
    perform session_change_queue('session_changed', r.empfaenger, r.profile_id, null, p_session_id, p_old, p_new, v_tz, v_event);
  end loop;

  -- Partner-Session: der Hauptkontakt der Organisation, mit den CC-Kontakten in Kopie.
  if v_s.partner_org_id is not null then
    select om.person_id into v_primary from org_membership om
     where om.org_id = v_s.partner_org_id and om.roles @> '{primary_ops}' order by om.person_id limit 1;
    if v_primary is not null then
      v_partners := v_partners || v_primary;
      perform session_change_queue('session_changed_partner', v_primary, null, v_s.partner_org_id, p_session_id, p_old, p_new, v_tz, v_event);
    end if;
  end if;

  -- Wer inzwischen nicht mehr zur Session gehört, bekommt die wartende Mail nicht mehr.
  for r in
    select distinct m.template_key, m.person_id from mail_log m
     where m.status = 'queued' and m.related_id = p_session_id and m.template_key in ('session_changed', 'session_changed_partner')
       and not (m.person_id = any (case when m.template_key = 'session_changed' then v_speakers else v_partners end))
  loop
    v_n := cancel_queued_mail(r.template_key, p_session_id, r.person_id, 'no_longer_recipient');
    if v_n > 0 then
      perform log_audit('mail.session_change', 'session', p_session_id::text, null,
        jsonb_build_object('person_id', r.person_id, 'template', r.template_key, 'state', 'cancelled', 'reason', 'no_longer_recipient'));
    end if;
  end loop;
end $$;
