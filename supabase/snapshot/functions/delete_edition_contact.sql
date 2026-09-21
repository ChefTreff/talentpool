create or replace function delete_edition_contact(p_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_before jsonb; v_photo text;
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  select to_jsonb(c), c.photo_path into v_before, v_photo from edition_contact c where c.id = p_id;
  if v_before is null then raise exception 'contact_not_found' using errcode = 'P0002', detail = p_id::text; end if;
  delete from edition_contact where id = p_id;
  -- **Beim Widerruf keine Kontaktdaten ins Protokoll.** Sonst überlebten genau
  -- die Angaben, für die die Einwilligung zurückgezogen wurde, ihre Löschung im
  -- Audit-Log. `id`, `type` und `display_name` reichen als Nachweis, dass diese
  -- Zeile entfernt wurde (Auflage der Architektur-Session, 18.09.).
  perform log_audit(case when p_reason = 'consent_withdrawn' then 'contact.remove' else 'edition_contact.delete' end,
                    'edition_contact', p_id::text,
                    case when p_reason = 'consent_withdrawn'
                         then v_before - 'photo_path' - 'email' - 'phone'
                         else v_before - 'photo_path' end,
                    jsonb_build_object('reason', coalesce(p_reason, 'deleted')));
  return v_photo;
end $$;
