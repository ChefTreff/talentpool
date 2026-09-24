create or replace function review_deliverable(p_deliverable_id uuid, p_accepted boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_d deliverable; v_oe org_edition; v_t deliverable_template; v_org_name text; v_primary uuid; v_locale text; r record; v_mail bigint;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_d from deliverable where id = p_deliverable_id for update;
  if not found then raise exception 'deliverable_not_found' using errcode = 'P0002'; end if;
  if v_d.status not in ('submitted', 'accepted') then raise exception 'not_pending' using errcode = 'P0001', detail = v_d.status; end if;
  if not p_accepted and nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'note_required' using errcode = '22023'; end if;
  select * into v_oe from org_edition where id = v_d.org_edition_id;
  select * into v_t from deliverable_template where id = v_d.template_id;
  update deliverable set status = case when p_accepted then 'accepted' else 'rejected' end, reviewed_by = current_person_id(), reviewed_at = now(),
                         review_note = nullif(btrim(p_note), '') where id = p_deliverable_id;
  update partner_asset set status = case when p_accepted then 'accepted' else 'rejected' end, reviewed_by = current_person_id(), reviewed_at = now(),
                           review_note = nullif(btrim(p_note), '')
   where deliverable_id = p_deliverable_id and is_current;
  if not p_accepted then
    select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = v_oe.org_id;
    select om.person_id into v_primary from org_membership om where om.org_id = v_oe.org_id and om.roles @> '{primary_ops}';
    for r in select distinct x as pid from unnest(array_remove(array[v_d.submitted_by, v_primary], null)) x loop
      select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = r.pid;
      v_mail := queue_mail('partner_deliverable_rejected', r.pid,
                         jsonb_build_object('org_name', v_org_name, 'deliverable', case when v_locale = 'en' then v_t.label_en else v_t.label_de end, 'note', btrim(p_note)),
                         'deliverable', p_deliverable_id);
      -- CC-Kontakte in Kopie, genau an einer Mail: der an den Hauptkontakt, sonst der an die handelnde Person (PART-063).
      if r.pid = coalesce(v_primary, v_d.submitted_by) then perform partner_mail_cc(v_mail, v_oe.org_id); end if;
    end loop;
  end if;
  perform log_audit(case when p_accepted then 'partner.deliverable_accept' else 'partner.deliverable_reject' end, 'organization', v_oe.org_id::text,
                    jsonb_build_object('status', v_d.status), jsonb_build_object('deliverable_id', p_deliverable_id, 'note', p_note));
end $$;
