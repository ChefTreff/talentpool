create or replace function has_admin_section(p_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_erlaubt boolean;
begin
  if not exists (select 1 from admin_section_role r where r.section = p_key) then
    -- Tippfehler im Schluessel: laut scheitern. Ein stilles „nein" liesse eine
    -- Funktion fuer immer zu, ohne dass jemand die Ursache faende.
    raise exception 'unknown_section' using errcode = '22023', detail = p_key;
  end if;
  if coalesce(has_role('admin'), false) then return true; end if;
  if v_me is null then return false; end if;

  select o.allowed into v_erlaubt from admin_section_override o
   where o.section = p_key and o.person_id = v_me;
  if found then return v_erlaubt; end if;

  select bool_or(o.allowed) into v_erlaubt from admin_section_override o
   where o.section = p_key and o.role is not null and has_role(o.role);
  if v_erlaubt is not null then return v_erlaubt; end if;

  return exists (select 1 from admin_section_role r where r.section = p_key and has_role(r.role));
end $$;
