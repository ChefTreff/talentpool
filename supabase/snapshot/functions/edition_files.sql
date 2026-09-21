create or replace function edition_files(p_audience text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, kind text, storage_path text, filename text, mime text, size_bytes bigint, label_de text, label_en text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- Dieselbe Regel wie im Wiki: die Zielgruppe wird aus den Rollen abgeleitet,
  -- nicht geglaubt.
  if not (my_kb_audiences() && array[p_audience]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select f.id, f.kind, f.storage_path, f.filename, f.mime, f.size_bytes,
           f.label_de, f.label_en, f.created_at
      from edition_file f
     where f.edition_id = v_ed
       and f.audience && array[p_audience]
     order by f.sort_order, f.created_at desc;
end $$;
