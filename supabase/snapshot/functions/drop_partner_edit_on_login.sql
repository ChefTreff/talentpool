create or replace function drop_partner_edit_on_login()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if new.auth_user_id is not null and old.auth_user_id is null then
    update speaker_profile set partner_editable_until_login = false
     where person_id = new.id and partner_editable_until_login;
  end if;
  return new;
end $$;
