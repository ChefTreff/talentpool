-- 0069 · Eventtage einer Edition lesbar machen, ohne fremde Policies anzufassen (Fund im Walkthrough zu PR #21).
-- `event_day` hat einen SELECT-Grant für `authenticated`, aber keine RLS-Policy — RLS verweigert damit jede Zeile, und der
-- Bewerbungs-Wizard bekam eine leere Tagesliste. Eine Policy auf `event_day` wäre eine Änderung an einer fremden Tabelle
-- und ist in der Pause nicht erlaubt (Arbeitsauftrag Welle 4, Abschnitt E). Stattdessen eine eigene Lese-RPC.
-- Der tote Grant selbst bleibt unangetastet und steht als Frage in der PR-Beschreibung.
set search_path = public, extensions;

/** Die Tage einer Edition — die der Edition selbst und die ihrer Events. */
create or replace function volunteer_days(p_edition_id uuid default null)
returns table (id uuid, event_id uuid, day_date date, label_de text, label_en text, sort_order integer)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select d.id, d.event_id, d.day_date, d.label_de, d.label_en, d.sort_order
      from event_day d join event e on e.id = d.event_id
     where e.id = v_ed or e.edition_id = v_ed
     order by d.day_date, d.sort_order;
end $$;

select harden_definer_functions();
