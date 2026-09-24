create or replace function release_partner_session(p_session_id uuid, p_approved boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_fehlt text[];
begin
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  -- Erst laden, dann prüfen: das Recht hängt an der Veranstaltung der Session.
  -- Vorher stand hier `is_programme_editor(null)` — immer false, die
  -- Programmleitung war ausgesperrt (LEAD-022).
  if not coalesce(is_partner_team() or is_programme_editor(v_se.event_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_se.partner_org_id is null then
    raise exception 'not_editable' using errcode = 'P0001', detail = 'not_a_partner_session';
  end if;
  if p_approved is false and nullif(btrim(coalesce(p_note, '')), '') is null then
    -- Eine Ablehnung ohne Grund kann der Partner nicht beheben.
    raise exception 'fields_required' using errcode = '22023', detail = 'note';
  end if;

  -- **Auflage der Architektur-Session (21.09.).** Vorher setzte die Freigabe `published` und
  -- lief in den Trigger `session_publish_check` — der wirft 23514 mit einem englischen
  -- Klartext. Der Fehlerschlüssel-Vertrag kennt 23514 nicht, die Oberfläche hätte also einen
  -- rohen Datenbanktext angezeigt, und das Team hätte raten dürfen, was fehlt.
  --
  -- Dieselben drei Bedingungen, nur vorher und mit Namen: Slot, beide Titel, mindestens eine
  -- Beschreibung. Sie stehen hier bewusst noch einmal statt als Verweis — der Trigger bleibt
  -- die harte Grenze, diese Prüfung ist die freundliche davor. Weicht der Trigger später ab,
  -- scheitert die Freigabe immer noch, nur wieder mit 23514; still falsch werden kann es nicht.
  --
  -- `partner_create_session` verlangt den englischen Titel **nicht** — im Entwurf darf der
  -- Partner unvollständig sein. Erst die Freigabe braucht beides.
  if p_approved then
    v_fehlt := array_remove(array[
      case when v_se.slot_id is null then 'slot' end,
      case when nullif(btrim(coalesce(v_se.title_de, '')), '') is null then 'title_de' end,
      case when nullif(btrim(coalesce(v_se.title_en, '')), '') is null then 'title_en' end,
      case when coalesce(nullif(btrim(coalesce(v_se.description_de, '')), ''),
                         nullif(btrim(coalesce(v_se.description_en, '')), '')) is null
           then 'description_de|description_en' end
    ], null);
    if cardinality(v_fehlt) > 0 then
      raise exception 'fields_required' using errcode = '22023',
        detail = array_to_string(v_fehlt, ', ');
    end if;
  end if;

  update session set
    publish_status = case when p_approved then 'published' else 'draft' end,
    updated_by = current_person_id()
  where id = p_session_id;
  -- Der Slot zieht mit: freigegeben heißt final, abgelehnt heißt wieder angefragt.
  update slot set status = case when p_approved then 'final' else 'requested' end
   where id = v_se.slot_id;

  perform log_audit(case when p_approved then 'partner.session_released' else 'partner.session_rejected' end,
                    'session', p_session_id::text,
                    jsonb_build_object('publish_status', v_se.publish_status),
                    jsonb_build_object('org_id', v_se.partner_org_id, 'note', nullif(btrim(coalesce(p_note, '')), '')));
end $$;
