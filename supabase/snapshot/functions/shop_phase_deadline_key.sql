create or replace function shop_phase_deadline_key(p_phase integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select case p_phase when 1 then 'shop_phase1_end' when 2 then 'shop_phase2_end' else null end
$$;
