create or replace function ticket_final_mail(p_t ticket)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_person uuid; v_halter text;
begin
  -- Empfaenger: die Speakerin. Beim Begleitticket gibt es keine Person zur
  -- Inhaberin (siehe Kopf), und `queue_mail` braucht eine.
  select sp.person_id into v_person from speaker_profile sp where sp.id = p_t.speaker_profile_id;
  if v_person is null then return; end if;
  -- Nur einmal je Ticket, unabhaengig vom Status der ersten Mail.
  if exists (select 1 from mail_log m
              where m.template_key = 'ticket_final' and m.related_type = 'ticket' and m.related_id = p_t.id) then
    return;
  end if;
  v_halter := nullif(btrim(coalesce(p_t.holder_first_name, '') || ' ' || coalesce(p_t.holder_last_name, '')), '');
  -- PART-091: an den Empfänger der Speaker-Mails.
  perform queue_speaker_mail('ticket_final', p_t.speaker_profile_id,
                     jsonb_build_object('holder_name', coalesce(v_halter, p_t.holder_email::text, '—'),
                                        'source', p_t.source),
                     'ticket', p_t.id);
end $$;
