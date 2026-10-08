create or replace function new_speaker_count(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  -- Tor und Definition von „neu“ kommen aus der Listenfunktion; verweigert sie dem Aufrufer die Liste, gilt 42501 auch hier.
  return (select count(*)::integer from partner_created_speakers(p_edition_id) s where s.is_new);
end $$;
