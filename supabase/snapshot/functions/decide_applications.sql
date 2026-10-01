create or replace function decide_applications(p_application_ids uuid[], p_status text)
 RETURNS TABLE(application_id uuid, ok boolean, error_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- Einmal vorab statt je Zeile: ein falscher Status ist kein Fehler einzelner Bewerbungen.
  if p_status is null or p_status not in ('shortlisted','accepted','waitlisted','declined') then
    raise exception 'invalid_decision' using errcode = '22023', detail = coalesce(p_status, 'null');
  end if;
  if coalesce(cardinality(p_application_ids), 0) > 200 then
    raise exception 'too_many_applications' using errcode = '22023', detail = cardinality(p_application_ids)::text;
  end if;

  -- Je Bewerbung der Weg des Einzelklicks: Rechte, Regeln und Audit stehen in decide_application.
  -- Sortiert, damit zwei gleichzeitige Sammelaktionen die Zeilen in derselben Reihenfolge sperren.
  for v_id in select distinct u from unnest(coalesce(p_application_ids, '{}'::uuid[])) as u where u is not null order by u loop
    begin
      perform decide_application(v_id, p_status, null);
      application_id := v_id; ok := true; error_key := null;
      return next;
    exception
      when sqlstate '42501' then
        application_id := v_id; ok := false; error_key := 'not_allowed';
        return next;
      when sqlstate 'P0001' or sqlstate 'P0002' or sqlstate '22023' then
        application_id := v_id; ok := false; error_key := sqlerrm;
        return next;
    end;
  end loop;
end $$;
