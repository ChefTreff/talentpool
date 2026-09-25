create or replace function partner_set_session_questions(p_session_id uuid, p_question_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_bad uuid; v_n integer := 0; q uuid; i integer := 0; v_basis integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if v_se.partner_org_id is null or not partner_can_edit(v_se.partner_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select qc.id into v_bad from question_catalog qc
   where qc.id = any(coalesce(p_question_ids, '{}'::uuid[])) and not (qc.partner_selectable and qc.active)
   limit 1;
  if v_bad is not null then
    raise exception 'question_not_selectable' using errcode = 'P0001', detail = v_bad::text;
  end if;

  -- Eigene (beantragte) Fragen bleiben stehen: sie gehören nicht zur Katalogauswahl.
  -- PART-045: ebenso die Katalogfragen, die das Team gesetzt hat und die ein Partner gar nicht wählen
  -- darf (nicht partner_selectable) — vorher löschte ein Speichern jede Katalogfrage, und mit einer
  -- leeren Auswahl verschwand die Pflichtfrage des Teams. Zur Wahl stehen nur partner_selectable-Fragen;
  -- was davon bleibt, behält Pflicht-Markierung und Platz, neu Gewähltes kommt hinten an.
  delete from session_question sq
   using question_catalog qc
   where sq.session_id = p_session_id and sq.question_id = qc.id and qc.partner_selectable
     and not (sq.question_id = any(coalesce(p_question_ids, '{}'::uuid[])));
  select coalesce(max(sq.sort_order), 0) into v_basis from session_question sq
   where sq.session_id = p_session_id and sq.question_id is not null;
  foreach q in array coalesce(p_question_ids, '{}'::uuid[]) loop
    if not exists (select 1 from session_question sq where sq.session_id = p_session_id and sq.question_id = q) then
      i := i + 1;
      insert into session_question (session_id, question_id, sort_order) values (p_session_id, q, v_basis + i);
    end if;
    v_n := v_n + 1;
  end loop;
  perform log_audit('partner.session_questions', 'session', p_session_id::text, null,
                    jsonb_build_object('count', v_n));
  return v_n;
end $$;
