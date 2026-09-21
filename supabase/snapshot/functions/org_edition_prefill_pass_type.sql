create or replace function org_edition_prefill_pass_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if new.pass_type_choice is null then
    select case when o.partner_category = 'startup' then 'startup' else 'talent' end
      into new.pass_type_choice
      from organization o where o.id = new.org_id;
  end if;
  return new;
end $$;
