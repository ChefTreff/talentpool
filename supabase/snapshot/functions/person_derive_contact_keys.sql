create or replace function person_derive_contact_keys()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_tel_neu boolean; v_e164_neu boolean; v_url_neu boolean; v_key_neu boolean; v text;
begin
  v_tel_neu  := case when tg_op = 'INSERT' then new.phone is not null else new.phone is distinct from old.phone end;
  v_e164_neu := case when tg_op = 'INSERT' then new.phone_e164 is not null else new.phone_e164 is distinct from old.phone_e164 end;
  v_url_neu  := case when tg_op = 'INSERT' then new.linkedin_url is not null else new.linkedin_url is distinct from old.linkedin_url end;
  v_key_neu  := case when tg_op = 'INSERT' then new.linkedin_normalized is not null else new.linkedin_normalized is distinct from old.linkedin_normalized end;

  if v_e164_neu then
    v := normalize_phone_e164(new.phone_e164);
    if v is not null then new.phone_e164 := v;
    elsif v_tel_neu then new.phone_e164 := normalize_phone_e164(new.phone);
    else new.phone_e164 := nullif(btrim(coalesce(new.phone_e164, '')), '');
    end if;
  elsif v_tel_neu then
    new.phone_e164 := normalize_phone_e164(new.phone);
  end if;

  if v_key_neu then
    v := normalize_linkedin_url(new.linkedin_normalized);
    if v is not null then new.linkedin_normalized := v;
    elsif v_url_neu then new.linkedin_normalized := normalize_linkedin_url(new.linkedin_url);
    else new.linkedin_normalized := nullif(lower(btrim(coalesce(new.linkedin_normalized, ''))), '');
    end if;
  elsif v_url_neu then
    new.linkedin_normalized := normalize_linkedin_url(new.linkedin_url);
  end if;
  return new;
end $$;
