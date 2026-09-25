-- Vorschlag · Welle 6 · Begleitungen verwalten: Liste, Bearbeiten, Loeschen (ADM-060)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Konrad, 25.09. — auf der Company-Tours-Seite eine eigene Sektion „Begleitung" mit der
-- Liste aller Tour-Leads der Edition, zum Bearbeiten **und Loeschen**; die Auswahl in der
-- Tour-Maske greift auf dieselbe Liste zu.
--
-- Schreiben konnte der Abschnitt seit 0194 (ADM-059). Hier kommt das Loeschen dazu, mit **derselben**
-- engen Ausnahme: wer nur `companyTours` hat, entfernt Zeilen vom Typ `tour_lead` und sonst nichts.
-- Die Regeln stehen weiter genau einmal, in `delete_edition_contact`.
--
-- **Die Zuordnung an den Touren loest der Fremdschluessel selbst**: `company_tour.lead_contact_id`
-- traegt `on delete set null` (0166). Ein zusaetzliches `update` davor waere doppelt gemoppelt und
-- verdeckte, dass die Datenbank das schon regelt. Was fehlte, ist etwas anderes: **die Folge sichtbar
-- machen.** Deshalb zaehlt die Funktion vor dem Loeschen, wie viele Touren ihre Begleitung verlieren,
-- und schreibt die Zahl ins Audit-Log; die Liste in der Oberflaeche zeigt sie vorher an, damit
-- niemand versehentlich zwei Touren ohne Begleitung zuruecklaesst.
--
-- Am Umgang mit Kontaktdaten aendert sich nichts: beim Widerruf einer Einwilligung bleiben E-Mail
-- und Telefon weiter aus dem Protokoll heraus (Auflage vom 18.09.).
-- Basis: `supabase/snapshot/functions/delete_edition_contact.sql`, `company_tour_options.sql`
-- (Konvention §1). Test: `supabase/tests/v6_begleitungen.sql`.

-- 1 · Loeschen, eng gefasst, mit sichtbarer Folge
create or replace function delete_edition_contact(p_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_before jsonb; v_photo text; v_typ text; v_touren integer;
begin
  select to_jsonb(c), c.photo_path, c.type into v_before, v_photo, v_typ from edition_contact c where c.id = p_id;
  if v_before is null then raise exception 'contact_not_found' using errcode = 'P0002', detail = p_id::text; end if;
  -- ADM-060: dieselbe enge Ausnahme wie beim Schreiben (0194). Wer nur den
  -- Abschnitt „Company Tours" hat, entfernt **Begleitungen** und sonst nichts.
  if not can_edit_edition_contacts() then
    if not (coalesce(has_admin_section('companyTours'), false) and v_typ = 'tour_lead') then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;
  -- Die Zuordnung an den Touren loest der Fremdschluessel selbst
  -- (`on delete set null`, 0166). Gezaehlt wird sie trotzdem: dass eine Loeschung
  -- zwei Touren ohne Begleitung zuruecklaesst, soll im Audit-Log stehen und nicht
  -- erst auffallen, wenn jemand die Tour aufmacht.
  select count(*) into v_touren from company_tour ct where ct.lead_contact_id = p_id;
  delete from edition_contact where id = p_id;
  -- **Beim Widerruf keine Kontaktdaten ins Protokoll.** Sonst überlebten genau
  -- die Angaben, für die die Einwilligung zurückgezogen wurde, ihre Löschung im
  -- Audit-Log. `id`, `type` und `display_name` reichen als Nachweis, dass diese
  -- Zeile entfernt wurde (Auflage der Architektur-Session, 18.09.).
  perform log_audit(case when p_reason = 'consent_withdrawn' then 'contact.remove' else 'edition_contact.delete' end,
                    'edition_contact', p_id::text,
                    case when p_reason = 'consent_withdrawn'
                         then v_before - 'photo_path' - 'email' - 'phone'
                         else v_before - 'photo_path' end,
                    jsonb_build_object('reason', coalesce(p_reason, 'deleted'), 'touren_ohne_begleitung', v_touren));
  return v_photo;
end $$;

-- 2 · Die Liste sagt, an wie vielen Touren eine Begleitung haengt
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
                            'contract_consent_at', c.contract_consent_at,
                            -- ADM-060: an wie vielen Touren haengt sie? Wer loeschen
                            -- will, soll vorher sehen, was dabei leer wird.
                            'tours', (select count(*) from company_tour ct where ct.lead_contact_id = c.id))
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

select harden_definer_functions();
