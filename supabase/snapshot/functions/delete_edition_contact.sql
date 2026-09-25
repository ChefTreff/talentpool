create or replace function delete_edition_contact(p_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_before jsonb; v_photo text; v_typ text; v_touren integer;
begin
  select to_jsonb(c), c.photo_path, c.type into v_before, v_photo, v_typ from edition_contact c where c.id = p_id;
  if v_before is null then raise exception 'contact_not_found' using errcode = 'P0002', detail = p_id::text; end if;
  -- ADM-060: dieselbe enge Ausnahme wie beim Schreiben (0194). Wer nur den
  -- Abschnitt „Company Tours" hat, entfernt **Begleitungen** und sonst nichts.
  if not can_edit_edition_contacts() then
    if not (coalesce(has_admin_section('companyTours'), false) and v_typ = 'tour_lead') then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;
  -- Die Zuordnung an den Touren loest der Fremdschluessel selbst
  -- (`on delete set null`, 0166). Gezaehlt wird sie trotzdem: dass eine Loeschung
  -- zwei Touren ohne Begleitung zuruecklaesst, soll im Audit-Log stehen und nicht
  -- erst auffallen, wenn jemand die Tour aufmacht.
  select count(*) into v_touren from company_tour ct where ct.lead_contact_id = p_id;
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
                    jsonb_build_object('reason', coalesce(p_reason, 'deleted'), 'touren_ohne_begleitung', v_touren));
  return v_photo;
end $$;
