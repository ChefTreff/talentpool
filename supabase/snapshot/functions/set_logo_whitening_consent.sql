create or replace function set_logo_whitening_consent(p_org_id uuid, p_granted boolean, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; v_at timestamptz;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;

  -- Eine bestehende Erlaubnis wird nicht neu datiert, wenn sie noch einmal bestätigt wird:
  -- der Nachweis soll sagen, wann sie erteilt wurde, nicht wann jemand zuletzt geklickt hat.
  update org_edition set
    logo_whitening_consent_at = case when p_granted then coalesce(logo_whitening_consent_at, now()) end,
    logo_whitening_consent_by = case when p_granted then coalesce(logo_whitening_consent_by, current_person_id()) end
  where id = v_oe.id
  returning logo_whitening_consent_at into v_at;

  perform log_audit(case when p_granted then 'partner.logo_whitening_granted' else 'partner.logo_whitening_revoked' end,
                    'org_edition', v_oe.id::text, null,
                    jsonb_build_object('org_id', p_org_id, 'granted', p_granted));
  return v_at;
end $$;
