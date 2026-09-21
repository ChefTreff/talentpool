create or replace function sevdesk_document_targets(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_id uuid, org_edition_id uuid, edition_id uuid, org_name text, sevdesk_contact_id text, bekannt text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  -- **Zwei erlaubte Kontexte, und beide ausdrücklich.** Das Team liest die Liste
  -- im Portal; der nächtliche Lauf liest sie als `service_role`, wo `auth.uid()`
  -- null und `has_role(…)` deshalb immer false ist. Eine reine Rollenprüfung
  -- hätte den Cron beim ersten Aufruf mit 42501 abgewiesen — derselbe Fehler,
  -- den die Architektur-Session in 0120 gefunden hat. `coalesce` nach §4: eine
  -- nackte ODER-Kette wird NULL, sobald ein Glied NULL ist.
  if not coalesce(is_partner_team() or auth.uid() is null, false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by e.start_date desc limit 1))
    into v_ed;
  return query
    select o.id, oe.id, oe.edition_id,
           coalesce(nullif(btrim(o.communication_name), ''), o.legal_name),
           o.sevdesk_contact_id,
           coalesce((select array_agg(a.filename order by a.filename)
                       from partner_asset a
                      where a.org_edition_id = oe.id and a.kind in ('offer', 'invoice')), '{}')
      from org_edition oe
      join organization o on o.id = oe.org_id
     where oe.edition_id = v_ed and nullif(btrim(o.sevdesk_contact_id), '') is not null
     order by 4;
end $$;
