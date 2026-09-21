create or replace function my_diet()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select jsonb_build_object('diet', p.diet, 'diet_note', p.diet_note)
    from person p where p.id = current_person_id()
$$;
