-- NNNN · Freigabe-Zähler: wie viele Einträge warten je Art auf eine Entscheidung (ADM-072b / ADM-080, Konrad und Paulina 05.10.2026)
--
-- Anlass: Die zentrale Freigabe-Übersicht (`/admin/einreichungen`, ADM-072, #349) zählt je Reiter. Das Admin-Menü soll
-- dieselben Zahlen zeigen („wäre für Paulina Gold“, Plan 05.10.), und zwar auf jeder Admin-Seite. Ohne diese Funktion
-- müssten Layout und Seite bei **jedem** Admin-Aufruf Programmtabelle, Reisekosten, Hotel, Shuttle und Einreichungen als
-- Zeilen laden und im Server zählen; hier zählt die Datenbank und liefert fünf Zahlen.
--
-- Vertrag: `freigabe_zaehler()` → jsonb mit je Art einer Zahl, **nur** für die Arten, die der Aufrufer entscheiden darf:
--   { "inhalte": n, "slots": n, "reisekosten": n, "hotel": n, "shuttle": n }   (fehlende Art = nicht erlaubt, nie 0)
-- Keine Zeilen, keine Namen, keine Inhalte — nur Zahlen. Ohne Anmeldung 28000.
--
-- Rechte je Art — **dieselben Tore wie die Listen, die die Seite lädt**, nicht eine Abschrift:
--   inhalte      Abschnitt `submissions` und `my_manager_scope().is_manager` · Zahl = `pending_submissions()`
--   slots        Abschnitt `programme` · Standbühnen: `partner_sessions_pending(<Summit>)` (verweigert sie dem Aufrufer die
--                Liste, zählt sie 0, wie die Seite) + Hauptbühnen: `programme_board`-Zeilen des Summits mit Session im
--                Stand `draft` oder `review`, die nicht auf einer Standbühne liegen und nicht schon als Standbühnen-
--                Anfrage gezählt sind (Regel von `loadSlotFreigaben`, `components/programme/loadFreigabe.ts`)
--   reisekosten  Abschnitt `expenses` · `expense_queue()` im Stand `submitted` (die Funktion verweigert Nicht-Freigebern)
--   hotel        Abschnitt `hospitality` · Buchungen aus `hospitality_admin_overview()` im Stand `requested` oder `waitlisted`
--   shuttle      Abschnitt `hospitality` · `shuttle_bookings_admin()` im Stand `requested`
-- Verweigert eine Listenfunktion dem Aufrufer die Liste (42501), fehlt die Art — so wie die Seite den Reiter ausblendet.
-- Menü und Reiter nennen damit dieselbe Zahl **und** dieselbe Rechtelage, auch wenn sich ein Tor später ändert.
--
-- **Abweichung von der Vorgabe (Plan 05.10.: „SECURITY DEFINER“): SECURITY INVOKER.** Grund: Die Slot-Zahl muss dieselbe
-- RLS-Sicht haben wie das Board, das die Seite als Aufrufer liest. Ein Teammitglied ohne Programm-Team-Rolle (zum Beispiel
-- area_lead_speaker) sieht über `session_read`/`slot_read` keine unveröffentlichten Sessions; als DEFINER würde das Menü
-- Zahlen nennen, die der Reiter nicht zeigt — und Unveröffentlichtes preisgeben, das die Zeilensicherheit verbirgt. Als
-- INVOKER braucht die Funktion keine eigenen Rechte: jede Listenfunktion trägt ihr Tor selbst, die Tabellen liest der
-- Aufrufer mit seiner RLS. Keine Rechteerhöhung; `search_path` ist trotzdem gepinnt, `anon` bekommt kein EXECUTE.
-- `harden_definer_functions()` am Ende gilt für DEFINER-Funktionen und berührt diese nicht.
--
-- Hängt von keiner anderen Migration ab (nur Funktionen und Sichten, die es gibt). Funktioniert vor und nach
-- `v6_hotel_freigabe_rechte`: ob „hotel“ und „reisekosten“ im Ergebnis stehen, bestimmen die Listenfunktionen.
set search_path = public, extensions;

create or replace function freigabe_zaehler()
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public', 'extensions'
as $$
declare
  v_res     jsonb := '{}'::jsonb;
  v_n       integer;
  v_event   uuid;
  v_partner uuid[] := '{}';
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  -- Titel & Beschreibungen: Abschnitt und Speaker-Team bzw. Stage Lead mit Bühne (`pending_submissions` filtert die Zeilen).
  if has_admin_section('submissions') and coalesce((my_manager_scope() ->> 'is_manager')::boolean, false) then
    select count(*) into v_n from pending_submissions();
    v_res := v_res || jsonb_build_object('inhalte', v_n);
  end if;

  -- Slots: Standbühnen-Anfragen plus nicht veröffentlichte Hauptbühnen-Sessions des Summits (Board und Tabelle zeigen nur ihn).
  if has_admin_section('programme') then
    select e.id into v_event
      from event e
     where not e.is_edition
       and exists (select 1 from stage st where st.event_id = e.id)
     order by (e.format_tag is distinct from 'summit'), e.start_date
     limit 1;
    v_n := 0;
    if v_event is not null then
      begin
        select coalesce(array_agg(p.session_id), '{}') into v_partner from partner_sessions_pending(v_event) p;
      exception when insufficient_privilege then
        v_partner := '{}';
      end;
      select count(*) into v_n
        from programme_board b
       where b.event_id = v_event
         and b.session_id is not null
         and b.stage_type is distinct from 'partner_booth'
         and b.publish_status in ('draft', 'review')
         and b.session_id <> all (v_partner);
      v_n := v_n + cardinality(v_partner);
    end if;
    v_res := v_res || jsonb_build_object('slots', v_n);
  end if;

  -- Reisekosten: nur eingereichte Anträge; die Funktion verweigert allen außer admin und area_lead_speaker.
  if has_admin_section('expenses') then
    begin
      select count(*) into v_n from expense_queue() q where q.status = 'submitted';
      v_res := v_res || jsonb_build_object('reisekosten', v_n);
    exception when insufficient_privilege then
      null;
    end;
  end if;

  -- Hotel und Shuttle teilen sich den Abschnitt `hospitality`; jede Liste trägt ihr eigenes Tor.
  if has_admin_section('hospitality') then
    begin
      select count(*) into v_n
        from hospitality_admin_overview() o, jsonb_array_elements(o.bookings) b
       where b ->> 'status' in ('requested', 'waitlisted');
      v_res := v_res || jsonb_build_object('hotel', v_n);
    exception when insufficient_privilege then
      null;
    end;
    begin
      select count(*) into v_n from shuttle_bookings_admin() s where s.status = 'requested';
      v_res := v_res || jsonb_build_object('shuttle', v_n);
    exception when insufficient_privilege then
      null;
    end;
  end if;

  return v_res;
end $$;

comment on function freigabe_zaehler() is
  'Wartende Einträge je Freigabe-Art (inhalte, slots, reisekosten, hotel, shuttle) nur für Arten, die der Aufrufer entscheiden darf; nur Zahlen. SECURITY INVOKER: die Slot-Zahl folgt der RLS des Boards.';

revoke execute on function freigabe_zaehler() from public, anon;
grant execute on function freigabe_zaehler() to authenticated;

select harden_definer_functions();
