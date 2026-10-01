create or replace function award_set_images(p_application_id uuid, p_paths text[], p_ip_hash text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a award_application; v_p text;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_a from award_application where id = p_application_id for update;
  if not found then return 'not_found'; end if;
  if v_a.submitter_hash is distinct from award_hash(v_a.edition_id, p_ip_hash)
     or v_a.created_at < now() - interval '1 hour' or cardinality(v_a.images) > 0 then
    return 'invalid';
  end if;
  if cardinality(coalesce(p_paths, '{}')) > 3 then return 'invalid'; end if;
  foreach v_p in array coalesce(p_paths, '{}') loop
    if v_p !~ ('^' || v_a.edition_id::text || '/' || v_a.id::text || '/[0-9]\.webp$') then return 'invalid'; end if;
  end loop;
  update award_application set images = coalesce(p_paths, '{}') where id = p_application_id;
  return 'ok';
end $$;
