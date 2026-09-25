create or replace function company_tour_options(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not has_admin_section('companyTours') then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  return jsonb_build_object(
    'edition_id', v_ed,
    'days', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', d.id,
                            'label', coalesce(nullif(btrim(d.label_de), ''), to_char(d.day_date, 'DD.MM.YYYY')))
                          order by d.day_date)
                        from event_day d where d.event_id = v_ed), '[]'::jsonb),
    -- Nur Begleitpersonen vom Typ `tour_lead`: `check_edition_contact` laesst
    -- beim Speichern ohnehin nichts anderes zu, und eine Liste, aus der man
    -- Falsches waehlen kann, ist eine Falle.
    -- ADM-059: mit den Feldern, die der Editor braucht. Dieselbe Runde wie die
    -- Auswahlliste — wer die Begleitung waehlen darf, darf sie auch pflegen.
    'leads', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', c.id, 'name', c.display_name,
                            'email', c.email::text, 'phone', c.phone,
                            'role_label_de', c.role_label_de, 'role_label_en', c.role_label_en,
                            'contract_consent_at', c.contract_consent_at)
                          order by c.sort_order, c.display_name)
                         from edition_contact c where c.edition_id = v_ed and c.type = 'tour_lead'), '[]'::jsonb),
    -- Sessions im Format `company_tour` — **plus** jede, die schon an einer Tour
    -- haengt: sonst verschwaende eine bestehende Verknuepfung aus der Liste,
    -- sobald jemand das Format der Session aendert, und der Editor schriebe sie
    -- beim naechsten Speichern still weg.
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', se.id,
                            'title', coalesce(se.title_de, se.title_en, '(ohne Titel)'),
                            'format', se.format) order by coalesce(se.title_de, se.title_en))
                            from session se
                           where se.event_id = v_ed
                             and (se.format = 'company_tour'
                                  or exists (select 1 from company_tour t where t.session_id = se.id))), '[]'::jsonb),
    'orgs', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', coalesce(nullif(btrim(o.communication_name), ''), o.legal_name))
                        order by coalesce(nullif(btrim(o.communication_name), ''), o.legal_name))
                        from organization o where o.active), '[]'::jsonb));
end $$;
