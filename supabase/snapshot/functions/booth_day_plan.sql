create or replace function booth_day_plan(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(event_day_id uuid, day_date date, day_label text, booth_id uuid, booth_number text, booth_type text, segment text, org_edition_id uuid, org_id uuid, org_name text, geteilt boolean, note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not (is_partner_team() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by e.start_date desc limit 1)) into v_ed;
  return query
    select d.id, d.day_date, coalesce(d.label_de, to_char(d.day_date, 'DD.MM.')),
           b.id, b.booth_number, b.booth_type, b.segment,
           ba.org_edition_id, o.id, coalesce(nullif(btrim(o.communication_name), ''), o.legal_name),
           -- „Geteilt" heisst: an diesem Stand haengt mindestens eine
           -- Tagesbelegung. Genau die Staende will die Produktion sehen.
           exists (select 1 from booth_assignment x
                    where x.booth_id = b.id and x.event_day_id is not null),
           ba.note
      from event_day d
      join booth_assignment ba
        on (ba.event_day_id = d.id or ba.event_day_id is null)
      join booth b on b.id = ba.booth_id
      join org_edition oe on oe.id = ba.org_edition_id and oe.edition_id = v_ed
      join organization o on o.id = oe.org_id
     where d.event_id = v_ed
     order by d.day_date, b.booth_number nulls last, 10;
end $$;
