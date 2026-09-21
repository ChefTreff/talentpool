create or replace function merch_fields(p_config jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select case
           when jsonb_typeof(p_config) = 'array' then p_config
           when jsonb_typeof(p_config) = 'object' and jsonb_typeof(p_config->'fields') = 'array' then p_config->'fields'
           else '[]'::jsonb
         end
$$;
