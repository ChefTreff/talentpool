-- 0282 · Hauptbühnen 2027: Namen und sechste Bühne (K-80)
-- Angewendet von der Architektur-Session am 08.10.2026 als 20261008134737.
-- NNNN · Hauptbühnen 2027: Namen und sechste Bühne (K-80, Konrad 08.10.2026)
--
-- Konrad 08.10.: sechs Hauptbühnen — Main Stage, Industry Stage, Leadership & Growth Stage, Tech & Impact Stage,
-- ZEIT:Future Forum, Impossible Founders Stage; die Namen werden noch angepasst, Konrad pflegt sie später im Admin.
-- Datenpflege durch die Architektur-Session auf Konrads Bitte („lege die Bühnen einmal selbst an“): zwei Umbenennungen
-- (Impact & Tech → Tech & Impact; Startup Stage → Impossible Founders Stage, die Slugs bleiben) und eine neue Bühne
-- (ZEIT:Future Forum, Typ main). Partner-Organisationen der gebrandeten Bühnen setzt Konrad über das Formular (ADM-106, #398).
-- Gezielt über die Bühne „Main Stage“ (Slug main) desselben Events; ein zweiter Lauf ändert nichts mehr.
set search_path = public, extensions;

do $$
declare v_ev uuid;
begin
  select st.event_id into v_ev from stage st where st.slug = 'main' and st.name = 'Main Stage' limit 1;
  if v_ev is null then raise exception 'summit_event_not_found' using errcode = 'P0002'; end if;

  update stage set name = 'Tech & Impact Stage' where event_id = v_ev and name = 'Impact & Tech Stage';
  update stage set name = 'Impossible Founders Stage' where event_id = v_ev and name = 'Startup Stage';

  insert into stage (event_id, name, slug, type, sort_order, active)
  select v_ev, 'ZEIT:Future Forum', 'zeit-future-forum', 'main', 5, true
   where not exists (select 1 from stage st where st.event_id = v_ev and st.slug = 'zeit-future-forum');

  update stage set sort_order = case name
      when 'Main Stage' then 1 when 'Industry Stage' then 2 when 'Leadership & Growth Stage' then 3
      when 'Tech & Impact Stage' then 4 when 'ZEIT:Future Forum' then 5 when 'Impossible Founders Stage' then 6
      else sort_order end
   where event_id = v_ev
     and name in ('Main Stage', 'Industry Stage', 'Leadership & Growth Stage', 'Tech & Impact Stage', 'ZEIT:Future Forum', 'Impossible Founders Stage');
end $$;

select harden_definer_functions();
