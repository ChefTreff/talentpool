create or replace function set_diet(p_diet text, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ziel uuid; v_diet text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ziel := v_me;

  v_diet := nullif(btrim(coalesce(p_diet, '')), '');
  if v_diet is not null and not is_vocab_key('diet', v_diet) then
    raise exception 'invalid_diet' using errcode = '22023', detail = v_diet;
  end if;

  update person set
    diet = v_diet,
    -- Kurz halten ist Datensparsamkeit, nicht Bequemlichkeit.
    diet_note = left(nullif(btrim(coalesce(p_note, '')), ''), 300)
   where id = v_ziel;

  -- **Ohne Werte im Protokoll.** Ein Audit-Log, das die Allergie mitschreibt,
  -- hebt genau den Schutz auf, den die RPCs darüber aufbauen.
  perform log_audit('person.diet', 'person', v_ziel::text, null, null);
end $$;
