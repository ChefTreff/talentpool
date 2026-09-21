create or replace function kb_articles_admin(p_audience text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, slug text, title text, body_md text, phase text, roles text[], audience text[], language text, edition_id uuid, edition_slug text, status text, valid_until timestamp with time zone, owner_name text, updated_at timestamp with time zone, published_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_role('admin') or can_edit_kb(array['partner','speaker','talent','volunteer','hackathon'])) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select a.id, a.slug, a.title, a.body_md, a.phase, a.roles, a.audience, a.language,
           a.edition_id, e.slug, a.status, a.valid_until,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           a.updated_at, a.published_at
      from kb_article a
      left join event e on e.id = a.edition_id
      left join person p on p.id = a.owner_person_id
     where (p_audience is null or a.audience && array[p_audience])
       -- Nur Artikel, deren Zielgruppen diese Person alle betreut.
       and can_edit_kb_all(a.audience)
     order by a.slug, a.language, a.edition_id nulls first;
end $$;
