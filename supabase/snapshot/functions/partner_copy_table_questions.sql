create or replace function partner_copy_table_questions(p_from_session uuid, p_to_sessions uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_src session; v_stage uuid; v_targets uuid[]; v_t record; v_found integer := 0;
  v_cat uuid[]; v_own_n integer; v_id uuid; v_q uuid; v_r session_question;
  v_ex_id uuid; v_ex_appr timestamptz; v_n integer; v_basis integer; v_i integer;
  v_hier boolean; v_changed integer := 0; v_own_appr integer := 0;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_src from session where id = p_from_session;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  -- Wie `partner_set_session_questions`; `coalesce`, weil `partner_can_edit` über `&&` auch NULL liefern kann.
  if v_src.partner_org_id is null or not coalesce(partner_can_edit(v_src.partner_org_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select sl.stage_id into v_stage from slot sl where sl.id = v_src.slot_id;
  if v_stage is null or v_src.format <> 'interview_table' or v_src.publish_status = 'cancelled' then
    raise exception 'not_same_table' using errcode = 'P0001', detail = p_from_session::text;
  end if;

  select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) into v_targets
    from unnest(coalesce(p_to_sessions, '{}'::uuid[])) x where x is not null;
  if cardinality(v_targets) = 0 then raise exception 'no_targets' using errcode = '22023'; end if;
  if cardinality(v_targets) > 200 then
    raise exception 'too_many_targets' using errcode = '22023', detail = cardinality(v_targets)::text;
  end if;
  if p_from_session = any(v_targets) then
    raise exception 'not_same_table' using errcode = 'P0001', detail = p_from_session::text;
  end if;

  -- Jedes Ziel gehört derselben Organisation und liegt am selben Tisch; die Sperre hält zwei gleichzeitige Übernahmen auseinander
  -- (sonst legten beide dieselbe eigene Frage an).
  for v_t in
    select se.id, se.partner_org_id, se.format, se.publish_status, sl.stage_id
      from session se left join slot sl on sl.id = se.slot_id
     where se.id = any(v_targets)
     order by se.id
       for update of se
  loop
    v_found := v_found + 1;
    if v_t.partner_org_id is distinct from v_src.partner_org_id or v_t.stage_id is distinct from v_stage
       or v_t.format <> 'interview_table' or v_t.publish_status = 'cancelled' then
      raise exception 'not_same_table' using errcode = 'P0001', detail = v_t.id::text;
    end if;
  end loop;
  if v_found <> cardinality(v_targets) then raise exception 'session_not_found' using errcode = 'P0002'; end if;

  -- Die Vorgabe: Katalogwahl (wählbar und aktiv, in der Reihenfolge der Quelle) und die Zahl der eigenen Fragen.
  select coalesce(array_agg(sq.question_id order by sq.sort_order, sq.id), '{}'::uuid[]) into v_cat
    from session_question sq join question_catalog qc on qc.id = sq.question_id
   where sq.session_id = p_from_session and qc.partner_selectable and qc.active;
  select count(*)::integer into v_own_n from session_question sq
   where sq.session_id = p_from_session and sq.question_id is null and sq.requested_by is not null;

  foreach v_id in array v_targets loop
    v_hier := false;

    -- Katalogwahl spiegeln, nach den Regeln von `partner_set_session_questions`: nur wählbare Fragen anfassen, vorhandene behalten Pflicht und Platz,
    -- Neues kommt hinten an; die Fragen des Teams (nicht wählbar) bleiben.
    delete from session_question sq
     using question_catalog qc
     where sq.session_id = v_id and sq.question_id = qc.id and qc.partner_selectable
       and not (sq.question_id = any(v_cat));
    get diagnostics v_n = row_count;
    if v_n > 0 then v_hier := true; end if;
    select coalesce(max(sq.sort_order), 0) into v_basis from session_question sq
     where sq.session_id = v_id and sq.question_id is not null;
    v_i := 0;
    foreach v_q in array v_cat loop
      if not exists (select 1 from session_question sq where sq.session_id = v_id and sq.question_id = v_q) then
        v_i := v_i + 1;
        insert into session_question (session_id, question_id, sort_order) values (v_id, v_q, v_basis + v_i);
        v_hier := true;
      end if;
    end loop;

    -- Eigene Fragen der Quelle: hinzufügen, wenn es im Ziel keine in allen Inhaltsfeldern gleiche gibt — nie löschen. Eine freigegebene Quellfrage
    -- gibt ihre Freigabe weiter; eine gleiche, noch offene Frage im Ziel zieht nach.
    for v_r in
      select * from session_question sq
       where sq.session_id = p_from_session and sq.question_id is null and sq.requested_by is not null
       order by sq.sort_order, sq.created_at, sq.id
    loop
      v_ex_id := null; v_ex_appr := null;
      select sq.id, sq.approved_at into v_ex_id, v_ex_appr from session_question sq
       where sq.session_id = v_id and sq.question_id is null and sq.requested_by is not null
         and sq.label_de is not distinct from v_r.label_de
         and sq.label_en is not distinct from v_r.label_en
         and sq.type is not distinct from v_r.type
         and sq.options is not distinct from v_r.options
         and sq.purpose is not distinct from v_r.purpose
       order by sq.created_at, sq.id
       limit 1;
      if v_ex_id is null then
        -- Höchstens zwei eigene Zeilen je Gespräch (auch die des Teams zählen); der Trigger wäre die letzte Grenze.
        select count(*)::integer into v_n from session_question sq where sq.session_id = v_id and sq.question_id is null;
        if v_n >= 2 then raise exception 'too_many_questions' using errcode = 'P0001', detail = v_id::text; end if;
        insert into session_question (session_id, label_de, label_en, type, options, required, sort_order,
                                      requested_by, purpose, approved_by, approved_at)
        values (v_id, v_r.label_de, v_r.label_en, v_r.type, v_r.options, v_r.required, v_r.sort_order,
                current_person_id(), v_r.purpose, v_r.approved_by, v_r.approved_at);
        v_hier := true;
        if v_r.approved_at is not null then v_own_appr := v_own_appr + 1; end if;
      elsif v_ex_appr is null and v_r.approved_at is not null then
        update session_question set approved_by = v_r.approved_by, approved_at = v_r.approved_at where id = v_ex_id;
        v_hier := true;
        v_own_appr := v_own_appr + 1;
      end if;
    end loop;

    if v_hier then v_changed := v_changed + 1; end if;
  end loop;

  perform log_audit('partner.table_questions', 'stage', v_stage::text, null,
                    jsonb_build_object('from_session', p_from_session, 'sessions', v_changed,
                                       'catalog', cardinality(v_cat), 'own', v_own_n, 'own_approved', v_own_appr));
  return v_changed;
end $$;
