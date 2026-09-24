create or replace function my_admin_section_overrides()
 RETURNS TABLE(section text, allowed boolean, quelle text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id();
begin
  if v_me is null then return; end if;
  -- `admin` sieht alles; Ausnahmen gelten für ihn nicht. Sonst könnte Konrad
  -- sich mit einem Klick den Weg zurück zum Rollen-Bereich abschalten.
  if has_role('admin') then return; end if;
  return query
    select o.section, o.allowed, 'person'::text
      from admin_section_override o
     where o.person_id = v_me
    union all
    select o.section, bool_or(o.allowed), 'role'::text
      from admin_section_override o
     where o.role is not null
       and has_role(o.role)
       -- Eine Ausnahme je Rolle; hat jemand zwei Rollen und eine davon öffnet
       -- den Abschnitt, ist er offen — dieselbe Regel wie bei der Vorgabe.
       and not exists (select 1 from admin_section_override p
                        where p.section = o.section and p.person_id = v_me)
     group by o.section;
end $$;
