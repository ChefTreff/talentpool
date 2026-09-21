create or replace function speaker_asset_path_allowed(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_profile uuid; v_edition uuid; v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  if v_me is null or p_name is null then return false; end if;
  begin
    v_edition := split_part(p_name, '/', 1)::uuid;
    v_profile := split_part(p_name, '/', 2)::uuid;
  exception when others then return false; end;
  if split_part(p_name, '/', 3) not in ('presentation', 'photo', 'other', 'receipt', 'invoice') or split_part(p_name, '/', 4) = '' then return false; end if;
  select * into v_sp from speaker_profile where id = v_profile and edition_id = v_edition;
  if not found then return false; end if;
  if split_part(p_name, '/', 3) = 'invoice' and not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or is_expense_approver()), false) then return false; end if;
  return coalesce(v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(v_profile) or is_staff(), false);
end $$;
