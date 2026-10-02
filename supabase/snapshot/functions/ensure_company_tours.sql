create or replace function ensure_company_tours(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v record; v_tour uuid; v_n integer := 0;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('tourAssignment') then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1));
  if v_ed is null then raise exception 'edition_not_found' using errcode = 'P0002'; end if;
  for v in select key, label_de from vocab_term where vocabulary = 'company_tour_type' and active order by sort_order loop
    continue when exists (select 1 from company_tour t where t.edition_id = v_ed and t.tour_type = v.key);
    -- Eine Tour gleichen Namens ohne Typ (Bestand) bekommt den Typ, statt verdoppelt zu werden.
    update company_tour set tour_type = v.key
     where edition_id = v_ed and tour_type is null and lower(btrim(name)) = lower(v.label_de)
    returning id into v_tour;
    if v_tour is null then
      insert into company_tour (edition_id, name, tour_type, meeting_point)
      values (v_ed, v.label_de, v.key, 'CCH, Congressplatz 1, 20355 Hamburg')
      returning id into v_tour;
      insert into company_tour_stop (tour_id, sort_order) select v_tour, g from generate_series(1, 3) g;
    end if;
    v_n := v_n + 1;
    v_tour := null;
  end loop;
  perform log_audit('tour.ensure', 'event', v_ed::text, null, jsonb_build_object('tours', v_n));
  return v_n;
end $$;
